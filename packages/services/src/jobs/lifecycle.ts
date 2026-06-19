import { HTTPException } from 'hono/http-exception';
import { prisma, type Prisma } from '@movesook/db';
import {
  canTransition,
  clampJobPrice,
  computeCommission,
  computeJobQuote,
  haversineKm,
  isCustomerCancellable,
  isCustomerConfirmable,
  isInHand,
  DRIVER_ADVANCEABLE,
  DRIVER_IN_HAND,
  JOB_STATUS_LABEL,
  type JobStatus,
  type CreateJobInput,
  type JobDetailResponse,
  type JobDto,
  type JobListResponse,
  type ListJobsQuery,
  type SetJobProofInput,
  type UpdateJobStatusInput,
} from '@movesook/shared';
import {
  evaluatePromo,
  getBaseFare,
  getCommissionPct,
  getEffectiveFlatRate,
  getEffectivePerItemRate,
  getEffectiveMaxActiveJobs,
  getEffectivePricePerKm,
  getEffectivePricePerKmShared,
  getFloorSurcharge,
  getHelperSurcharge,
  getSurge,
  getSystemSettings,
  getVehicleLabel,
  isVehicleTypeActive,
  notify,
  enqueueAdminAlert,
  toJobDto,
} from '@movesook/services/support';

// Core job lifecycle: creation, listing, detail, proof, cancel/confirm, accept,
// flag-illegal, and driver status advance. HTTP routing lives in
// apps/api/src/routes/jobs.ts; these take the authenticated `sub` + validated input.

/** USER creates and publishes a moving job (held at PENDING_PAYMENT). */
export async function createJob(sub: string, input: CreateJobInput): Promise<JobDto> {
  // System guards: maintenance mode, active service area, price bounds.
  const sys = await getSystemSettings();
  if (sys.maintenanceMode) {
    throw new HTTPException(503, { message: sys.maintenanceMessage });
  }
  if (!(await isVehicleTypeActive(input.vehicleType))) {
    throw new HTTPException(422, { message: 'ประเภทรถนี้ยังไม่เปิดรับ' });
  }
  // Scheduling window: a job can't be booked further ahead than maxScheduleDays.
  if (input.scheduledAt && sys.maxScheduleDays > 0) {
    const limit = Date.now() + sys.maxScheduleDays * 24 * 60 * 60 * 1000;
    if (new Date(input.scheduledAt).getTime() > limit) {
      throw new HTTPException(422, {
        message: `จองล่วงหน้าได้ไม่เกิน ${sys.maxScheduleDays} วัน`,
      });
    }
  }
  const areaCount = await prisma.serviceArea.count();
  if (areaCount > 0) {
    const area = await prisma.serviceArea.findUnique({
      where: { province: input.originProvince },
    });
    if (!area || !area.isActive) {
      throw new HTTPException(422, { message: 'จังหวัดต้นทางไม่ได้เปิดให้บริการ' });
    }
  }
  // Auto-calculate price from distance + floor/helper surcharges when both pins
  // are set; ignore any client-supplied priceQuoted so customers cannot
  // manipulate the price. A valid promo code further discounts the subtotal.
  let priceQuoted: number | null = null;
  let appliedPromoCode: string | null = null;
  let discountAmount: number | null = null;
  let promoToConsume: string | null = null; // code whose usedCount we bump in the create tx
  if (
    input.originLat != null &&
    input.originLng != null &&
    input.destLat != null &&
    input.destLng != null
  ) {
    const [baseFare, rate, sharedRate, floorSurcharge, helperSurcharge, surge, flatRate, perItemRate] =
      await Promise.all([
        getBaseFare(),
        getEffectivePricePerKm(input.vehicleType),
        getEffectivePricePerKmShared(input.vehicleType),
        getFloorSurcharge(),
        getHelperSurcharge(),
        getSurge(input.originProvince),
        getEffectiveFlatRate(input.vehicleType),
        getEffectivePerItemRate(input.vehicleType),
      ]);
    const distKm = haversineKm(input.originLat, input.originLng, input.destLat, input.destLng);
    // Distance bounds (0 = no limit).
    if (sys.minDistanceKm > 0 && distKm < sys.minDistanceKm) {
      throw new HTTPException(422, { message: `ระยะทางขั้นต่ำ ${sys.minDistanceKm} กม.` });
    }
    if (sys.maxDistanceKm > 0 && distKm > sys.maxDistanceKm) {
      throw new HTTPException(422, {
        message: `ระยะทางเกินกำหนด (สูงสุด ${sys.maxDistanceKm} กม.)`,
      });
    }
    const quote = computeJobQuote({
      pricingMode: input.pricingMode,
      distanceKm: distKm,
      baseFare,
      pricePerKm: rate,
      pricePerKmShared: sharedRate,
      originFloor: input.originFloor,
      originHasElevator: input.originHasElevator,
      destFloor: input.destFloor,
      destHasElevator: input.destHasElevator,
      needsHelpers: input.needsHelpers,
      floorSurcharge,
      helperSurcharge,
      surgeMultiplier: surge.multiplier,
      flatRate,
      perItemRate,
      itemCount: input.items.reduce((s, it) => s + it.quantity, 0),
    });
    // An invalid promo at post time is silently ignored (the customer already
    // saw why via POST /jobs/estimate); it never blocks publishing the job.
    const promo = await evaluatePromo(input.promoCode, quote.subtotal);
    if (promo?.ok) {
      appliedPromoCode = promo.promo.code;
      discountAmount = promo.discount;
      promoToConsume = promo.promo.code;
    }
    // Clamp into the configured price window (min floor / max cap).
    const net = Math.max(0, quote.subtotal - (discountAmount ?? 0));
    priceQuoted = clampJobPrice(net, sys.minJobPrice, sys.maxJobPrice) || null;
  }

  // Payment method: COD is offered only when ops enabled it AND the quoted price
  // sits inside [codMinPrice, codMaxPrice] (0 = unbounded). Falls back to PREPAID.
  const paymentMethod = input.paymentMethod ?? 'PREPAID';
  if (paymentMethod === 'COD') {
    if (!sys.codEnabled) {
      throw new HTTPException(422, {
        message: 'ขณะนี้ยังไม่เปิดให้ใช้บริการเก็บเงินปลายทาง (COD)',
      });
    }
    if (priceQuoted == null) {
      throw new HTTPException(422, {
        message: 'งานเก็บเงินปลายทางต้องปักหมุดต้นทาง-ปลายทางเพื่อคำนวณราคา',
      });
    }
    if (sys.codMinPrice > 0 && priceQuoted < sys.codMinPrice) {
      throw new HTTPException(422, {
        message: `งานเก็บเงินปลายทางต้องมีมูลค่าอย่างน้อย ฿${sys.codMinPrice.toLocaleString('th-TH')}`,
      });
    }
    if (sys.codMaxPrice > 0 && priceQuoted > sys.codMaxPrice) {
      throw new HTTPException(422, {
        message: `งานเก็บเงินปลายทางต้องมีมูลค่าไม่เกิน ฿${sys.codMaxPrice.toLocaleString('th-TH')}`,
      });
    }
  }
  // COD: the customer transfers only the commission ("ค่าธรรมเนียม") up-front and pays
  // the rest in cash to the driver at the destination. Snapshot the commission now (the
  // commission % is fixed at this moment) so the slip shows the exact amount. Both PREPAID
  // and COD stay hidden at PENDING_PAYMENT until an admin approves the transfer.
  let codCommissionPct: number | null = null;
  let codCommissionFee: number | null = null;
  if (paymentMethod === 'COD' && priceQuoted != null) {
    codCommissionPct = await getCommissionPct();
    codCommissionFee = computeCommission(priceQuoted, codCommissionPct).commissionAmount;
  }

  // Self-serve: find-or-create this user's own Customer record.
  const me = await prisma.user.findUnique({
    where: { id: sub },
    select: { displayName: true, phone: true },
  });
  const customer = await prisma.customer.upsert({
    where: { userId: sub },
    create: { userId: sub, name: me?.displayName ?? null, phone: input.contactPhone },
    update: {},
  });
  // The on-site contact phone doubles as the customer's saved default: backfill
  // it onto the User (and Customer) the first time they provide one, so the
  // next job's form can prefill it. Never overwrite an existing number.
  if (!me?.phone) {
    await prisma.user.update({ where: { id: sub }, data: { phone: input.contactPhone } });
  }
  if (!customer.phone) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { phone: input.contactPhone },
    });
  }
  // Normalise the structured list, then derive the summary / count / flat photo list.
  const items = input.items.map((it) => ({
    name: it.name,
    quantity: it.quantity,
    photoUrls: it.photoUrls,
  }));
  const itemDescription = items
    .map((it) => (it.quantity > 1 ? `${it.name} ×${it.quantity}` : it.name))
    .join(', ')
    .slice(0, 1000);
  const itemCount = items.reduce((sum, it) => sum + it.quantity, 0);
  // Flat gallery of all item photos so existing job cards/feeds keep working.
  const itemPhotos = items.flatMap((it) => it.photoUrls);

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        customerId: customer.id,
        // Both PREPAID and COD are held at PENDING_PAYMENT until the customer uploads
        // the transfer slip (full amount for PREPAID, commission only for COD) and an
        // admin approves it; only then does the job go POSTED and visible to drivers.
        status: 'PENDING_PAYMENT',
        paymentMethod,
        // COD: snapshot the commission the customer pays up-front (and the % used).
        commissionPct: codCommissionPct,
        codCommissionFee,
        itemDescription,
        items,
        vehicleType: input.vehicleType,
        itemCategory: input.itemCategory ?? null,
        prohibitedAck: true, // schema enforces acceptedProhibitedPolicy === true
        pricingMode: input.pricingMode ?? 'CHARTER',
        itemCount,
        needsHelpers: input.needsHelpers ?? false,
        contactPhone: input.contactPhone,
        notes: input.notes ?? null,
        originAddress: input.originAddress,
        originProvince: input.originProvince,
        originLat: input.originLat ?? null,
        originLng: input.originLng ?? null,
        originFloor: input.originFloor ?? null,
        originHasElevator: input.originHasElevator ?? null,
        destAddress: input.destAddress,
        destProvince: input.destProvince,
        destLat: input.destLat ?? null,
        destLng: input.destLng ?? null,
        destFloor: input.destFloor ?? null,
        destHasElevator: input.destHasElevator ?? null,
        scheduledAt: input.scheduledAt ?? null,
        termsAcceptedAt: new Date(),
        priceQuoted,
        promoCode: appliedPromoCode,
        discountAmount,
        itemPhotos,
      },
    });
    // Consume one redemption of the applied promo in the same tx (best-effort
    // on maxUses: a rare concurrent over-redemption is acceptable for promos).
    if (promoToConsume) {
      await tx.promoCode.update({
        where: { code: promoToConsume },
        data: { usedCount: { increment: 1 } },
      });
    }
    return created;
  });
  // Do NOT alert drivers yet — the job is PENDING_PAYMENT and stays hidden until the
  // customer uploads the slip and an admin approves it (then it fans out to the area).
  return toJobDto(job);
}

/** DRIVER browses matching/backhaul jobs; USER lists their own jobs. */
export async function listJobs(
  sub: string,
  role: string,
  q: ListJobsQuery,
): Promise<JobListResponse> {
  let where: Prisma.JobWhereInput;
  if (q.as === 'customer') {
    // Explicit "as a customer" view: jobs this account posted, for ANY role.
    // A DRIVER who also uses the moving service holds one account; this is how
    // they see jobs they posted (the DRIVER default below shows the feed/their
    // assigned work, never their own posted jobs).
    where = {
      customer: { userId: sub },
      ...(q.status ? { status: q.status } : {}),
    };
  } else if (role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({ where: { userId: sub } });

    if (q.mine) {
      // Jobs already assigned to this driver (their active / past work).
      where = {
        driverId: driver?.id ?? '__none__',
        ...(q.status ? { status: q.status } : {}),
      };
    } else {
      // On-demand feed: open jobs in the driver's service area. An explicit
      // originProvince query overrides the driver's default service province.
      const areaProvince = q.originProvince ?? driver?.serviceProvince ?? undefined;

      where = {
        // The open feed is POSTED-only by design. Never honour a caller-supplied
        // status here — otherwise a driver could pass ?status=PENDING_PAYMENT to
        // see unpaid, admin-unapproved jobs the payment gate hides from them.
        status: 'POSTED',
        driverId: null,
        // A driver must not see (nor accept) a job they posted themselves. Prisma's
        // `not` keeps rows where userId is null (admin/walk-in customers), so those
        // public jobs still appear in the feed.
        customer: { userId: { not: sub } },
        ...(q.vehicleType ? { vehicleType: q.vehicleType } : {}),
        ...(areaProvince ? { originProvince: areaProvince } : {}),
        ...(q.destProvince ? { destProvince: q.destProvince } : {}),
      };
    }
  } else {
    // A user's own jobs are those owned by their linked Customer record.
    where = {
      customer: { userId: sub },
      ...(q.status ? { status: q.status } : {}),
    };
  }

  const rows = await prisma.job.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > q.take;
  const items = (hasMore ? rows.slice(0, q.take) : rows).map(toJobDto);
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

/** Job detail / tracking — visible to the job's customer or its assigned driver. */
export async function getJobDetail(sub: string, id: string): Promise<JobDetailResponse> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: { select: { userId: true } },
      driver: { include: { user: { select: { displayName: true, phone: true } } } },
      review: { select: { id: true } },
    },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });

  const isCustomer = job.customer.userId === sub;
  const isAssignedDriver = job.driver?.userId === sub;
  if (!isCustomer && !isAssignedDriver) {
    throw new HTTPException(403, { message: 'Not your job' });
  }

  return {
    ...toJobDto(job),
    hasReview: job.review !== null,
    driver: job.driver
      ? {
          displayName: job.driver.user?.displayName ?? null,
          vehicleType: job.driver.vehicleType,
          plateNumber: job.driver.plateNumber,
          phone: job.driver.user?.phone ?? null,
          ratingAvg: job.driver.ratingAvg,
          ratingCount: job.driver.ratingCount,
          lat: job.driver.lastLat,
          lng: job.driver.lastLng,
          locationAt: job.driver.locationAt ? job.driver.locationAt.toISOString() : null,
        }
      : null,
  };
}

/** DRIVER attaches a pickup / delivery proof photo to their job. */
export async function setJobProof(
  sub: string,
  jobId: string,
  input: SetJobProofInput,
): Promise<JobDto> {
  const { kind, urls } = input;

  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.driverId !== driver.id) throw new HTTPException(403, { message: 'Not your job' });
  // Proof photos belong to an active delivery — closed/cancelled jobs are immutable.
  if (!isInHand(job.status) && job.status !== 'PENDING_CONFIRMATION') {
    throw new HTTPException(422, { message: 'แนบรูปหลักฐานได้เฉพาะงานที่กำลังดำเนินการ' });
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: kind === 'PICKUP' ? { pickupProofUrls: urls } : { deliveryProofUrls: urls },
  });
  return toJobDto(updated);
}

/** CUSTOMER cancels their own job (only while not yet picked up). */
export async function cancelJob(sub: string, id: string): Promise<JobDto> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } }, driver: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
  if (!isCustomerCancellable(job.status, job.paymentMethod)) {
    throw new HTTPException(422, {
      message:
        job.paymentMethod === 'COD'
          ? 'ยกเลิกงานนี้ไม่ได้ (คนขับรับของแล้ว)'
          : 'ยกเลิกงานนี้ไม่ได้ (ชำระเงินแล้ว/คนขับกำลังไปรับ)',
    });
  }
  // Cancellation fee applies only after the free-cancel window has passed AND a
  // driver has actually committed to the job — a customer bailing out before any
  // driver is assigned (e.g. an unpaid PREPAID job still PENDING_PAYMENT) costs the
  // platform nothing. The fee is snapshotted onto the job so ops can collect it
  // manually — there is no customer wallet to deduct from.
  const sys = await getSystemSettings();
  const elapsedMin = (Date.now() - job.createdAt.getTime()) / 60000;
  const feeApplies =
    job.driverId !== null && sys.cancellationFee > 0 && elapsedMin > sys.freeCancelMinutes;
  const updated = await prisma.job.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancellationFeeApplied: feeApplies ? sys.cancellationFee : null,
    },
  });
  if (feeApplies) {
    await notify({
      userId: sub,
      type: 'JOB_STATUS',
      title: 'ยกเลิกงานแล้ว (มีค่าธรรมเนียม)',
      body: `เกินช่วงยกเลิกฟรี ${sys.freeCancelMinutes} นาที — มีค่าธรรมเนียมยกเลิก ฿${sys.cancellationFee.toLocaleString()}`,
      jobId: job.id,
    });
  }
  // Let an already-assigned driver know it was cancelled.
  if (job.driver?.userId) {
    await notify({
      userId: job.driver.userId,
      type: 'JOB_STATUS',
      title: 'งานถูกยกเลิก',
      body: `${job.originProvince} → ${job.destProvince} ถูกลูกค้ายกเลิก`,
      jobId: job.id,
    });
  }
  return toJobDto(updated);
}

/** CUSTOMER confirms they received the goods. This does NOT complete the job —
 *  it's an extra signal recorded for the admin to decide on final DELIVERED. */
export async function confirmDelivery(sub: string, id: string): Promise<JobDto> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } }, driver: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
  // Only meaningful once the goods are on the move / delivery has been claimed.
  if (!isCustomerConfirmable(job.status)) {
    throw new HTTPException(422, { message: 'ยังยืนยันรับของไม่ได้ในสถานะนี้' });
  }

  const updated = await prisma.job.update({
    where: { id },
    data: { customerConfirmedAt: new Date() },
  });
  // Let the driver know the customer confirmed receipt.
  if (job.driver?.userId) {
    await notify({
      userId: job.driver.userId,
      type: 'JOB_STATUS',
      title: 'ลูกค้ายืนยันรับของแล้ว',
      body: `${job.originProvince} → ${job.destProvince} · รอแอดมินยืนยันขั้นสุดท้าย`,
      jobId: job.id,
    });
  }
  return toJobDto(updated);
}

/** DRIVER accepts an open job; snapshots the current commission %. */
// Driver fields needed to enrich a customer-facing status push.
type DriverContact = {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  vehicleType: string;
  plateNumber: string | null;
};

function driverDisplayName(d: DriverContact): string {
  const full = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
  return full || 'พนักงานขนส่ง';
}

/**
 * Detail rows (route, item, driver, vehicle, contact) attached to a customer's
 * LINE status push so the message is useful on its own — not just a status word.
 */
async function customerJobRows(
  job: { originProvince: string; destProvince: string; itemDescription: string },
  driver: DriverContact,
): Promise<{ label: string; value: string }[]> {
  const vehicle = await getVehicleLabel(driver.vehicleType);
  const rows = [
    { label: 'เส้นทางการขนส่ง', value: `${job.originProvince} → ${job.destProvince}` },
    { label: 'รายการพัสดุ', value: job.itemDescription },
    { label: 'พนักงานขนส่ง', value: driverDisplayName(driver) },
    { label: 'ยานพาหนะ', value: driver.plateNumber ? `${vehicle} (${driver.plateNumber})` : vehicle },
  ];
  if (driver.phone) rows.push({ label: 'เบอร์ติดต่อ', value: driver.phone });
  return rows;
}

// Friendly, status-specific copy for the customer push when a driver advances a
// job. Falls back to a generic line for any status not listed here.
const CUSTOMER_STATUS_NOTICE: Partial<Record<JobStatus, { title: string; body: string }>> = {
  PICKED_UP: {
    title: 'รับพัสดุเรียบร้อยแล้ว',
    body: 'พนักงานขนส่งได้รับพัสดุของท่านเรียบร้อยแล้ว และกำลังเตรียมจัดส่งไปยังปลายทาง',
  },
  IN_TRANSIT: {
    title: 'อยู่ระหว่างการจัดส่ง',
    body: 'พัสดุของท่านอยู่ระหว่างการนำส่งไปยังปลายทาง',
  },
  PENDING_CONFIRMATION: {
    title: 'จัดส่งถึงปลายทางแล้ว',
    body: 'พนักงานขนส่งแจ้งว่าได้นำส่งพัสดุถึงปลายทางเรียบร้อยแล้ว กรุณาตรวจสอบและกดยืนยันการรับพัสดุในแอปพลิเคชัน',
  },
};

export async function acceptJob(sub: string, jobId: string): Promise<JobDto> {
  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });
  if (driver.verifyStatus !== 'APPROVED') {
    throw new HTTPException(403, { message: 'Driver not yet approved' });
  }
  // An off-duty driver (พักงาน) is excluded from the feed/notifications, so they
  // must not be able to claim jobs either — turn availability on first.
  if (!driver.isAvailable) {
    throw new HTTPException(422, { message: 'กรุณาเปิดรับงานก่อน (สถานะพักงานอยู่)' });
  }

  // What the driver currently holds (in-hand) and what they're trying to claim —
  // both inform the concurrency + charter-exclusivity gates below.
  const inHandJobs = await prisma.job.findMany({
    where: { driverId: driver.id, status: { in: [...DRIVER_IN_HAND] } },
    select: { pricingMode: true },
  });
  const target = await prisma.job.findUnique({
    where: { id: jobId },
    select: { pricingMode: true, customer: { select: { userId: true } } },
  });
  if (!target) throw new HTTPException(404, { message: 'ไม่พบงานนี้' });

  // Self-hire guard: a driver who also posts jobs as a customer must never claim
  // their own job — that would let them spoof activity / referral / incentive
  // metrics and write a self-dealing commission ledger row.
  if (target.customer.userId === sub) {
    throw new HTTPException(403, { message: 'ไม่สามารถรับงานที่คุณโพสต์เองได้' });
  }

  // CHARTER (เหมาลำ) dedicates the whole vehicle to one job, so it's mutually
  // exclusive with any other in-hand work — both directions:
  //  - holding an active charter blocks claiming anything else, and
  //  - claiming a charter requires zero in-hand jobs (even PER_ITEM loads).
  if (inHandJobs.some((j) => j.pricingMode === 'CHARTER')) {
    throw new HTTPException(422, {
      message: 'คุณมีงานเหมาลำที่กำลังทำอยู่ — ส่งงานนั้นให้เสร็จก่อนจึงจะรับงานใหม่ได้',
    });
  }
  if (target.pricingMode === 'CHARTER' && inHandJobs.length > 0) {
    throw new HTTPException(422, {
      message: 'งานเหมาลำต้องใช้รถทั้งคัน — ส่งงานที่ค้างอยู่ให้เสร็จก่อนจึงจะรับงานเหมาลำได้',
    });
  }

  // Cap concurrent in-hand jobs — per the driver's vehicle type if it sets its own
  // limit, otherwise the global setting (0 = unlimited).
  const maxActiveJobs = await getEffectiveMaxActiveJobs(driver.vehicleType);
  if (maxActiveJobs > 0 && inHandJobs.length >= maxActiveJobs) {
    throw new HTTPException(422, {
      message: `รับงานพร้อมกันได้สูงสุด ${maxActiveJobs} งาน — ส่งงานเดิมให้เสร็จก่อน`,
    });
  }

  // Conditional update guards against a race: only an unassigned POSTED job is claimable.
  // The DB serialises concurrent claims at the row level, so exactly one driver wins.
  const result = await prisma.job.updateMany({
    where: { id: jobId, status: 'POSTED', driverId: null },
    data: { status: 'ACCEPTED', driverId: driver.id },
  });
  if (result.count === 0) {
    // We lost the claim — but if *this* driver already owns it (double-tap /
    // retried request), treat it as success so the winner never sees an error.
    const existing = await prisma.job.findUnique({
      where: { id: jobId },
      include: { customer: { select: { userId: true } } },
    });
    if (!existing) throw new HTTPException(404, { message: 'ไม่พบงานนี้' });
    if (existing.driverId === driver.id) return toJobDto(existing);
    throw new HTTPException(409, { message: 'งานนี้ถูกคนขับคนอื่นรับไปแล้ว' });
  }
  // Winning a claim counts as activity (resets the idle-churn clock).
  await prisma.driver.update({ where: { id: driver.id }, data: { lastActiveAt: new Date() } });

  let job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: { customer: { select: { userId: true } } },
  });
  // PREPAID: snapshot the commission % at accept time. COD already snapshotted it at
  // creation (when the customer paid the commission up-front) — don't overwrite it.
  if (job.paymentMethod !== 'COD' && job.commissionPct == null) {
    job = await prisma.job.update({
      where: { id: jobId },
      data: { commissionPct: await getCommissionPct() },
      include: { customer: { select: { userId: true } } },
    });
  }
  // Notify the customer (if they have an app account) that a driver took the job.
  if (job.customer.userId) {
    await notify({
      userId: job.customer.userId,
      type: 'JOB_STATUS',
      title: 'พนักงานขนส่งรับงานของท่านแล้ว',
      body: 'พนักงานขนส่งกำลังเดินทางไปรับพัสดุของท่าน สามารถดูรายละเอียดพนักงานและยานพาหนะได้ด้านล่าง',
      jobId: job.id,
      rows: await customerJobRows(job, driver),
    });
  }
  return toJobDto(job);
}

/** DRIVER flags the cargo as prohibited/illegal. Puts the job on hold
 *  (FLAGGED_ILLEGAL) for admin review — the driver is NOT penalised and no
 *  commission is owed. Allowed only by the assigned driver while in-hand. */
export async function flagJobIllegal(
  sub: string,
  jobId: string,
  reason: string,
): Promise<JobDto> {
  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.driverId !== driver.id) {
    throw new HTTPException(403, { message: 'Not your job' });
  }
  // Reuse the state machine: only ACCEPTED/PICKED_UP/IN_TRANSIT may be flagged.
  if (!canTransition(job.status, 'FLAGGED_ILLEGAL')) {
    throw new HTTPException(422, { message: 'แจ้งของผิดกฎหมายในสถานะนี้ไม่ได้' });
  }

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: 'FLAGGED_ILLEGAL',
      flaggedIllegalAt: new Date(),
      flaggedIllegalReason: reason,
      flaggedByDriverId: driver.id,
    },
  });

  // Alert every admin to review and resolve the flagged job.
  await enqueueAdminAlert({
    type: 'GENERIC',
    title: '🚩 มีการแจ้งของผิดกฎหมาย',
    body: `งาน ${job.originProvince} → ${job.destProvince} ถูกแจ้งว่าเป็นของผิดกฎหมาย/ต้องห้าม — กรุณาตรวจสอบ`,
    jobId: job.id,
  });
  // Let the customer know their job is on hold.
  const customer = await prisma.customer.findUnique({
    where: { id: job.customerId },
    select: { userId: true },
  });
  if (customer?.userId) {
    await notify({
      userId: customer.userId,
      type: 'JOB_STATUS',
      title: 'งานของคุณถูกระงับเพื่อตรวจสอบ',
      body: 'งานนี้ถูกแจ้งว่าอาจมีสิ่งของต้องห้าม ทีมงานกำลังตรวจสอบ',
      jobId: job.id,
    });
  }
  return toJobDto(updated);
}

/** DRIVER advances job status through the shared state machine. */
export async function updateJobStatus(
  sub: string,
  jobId: string,
  input: UpdateJobStatusInput,
): Promise<JobDto> {
  const { status: next } = input;

  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.driverId !== driver.id) {
    throw new HTTPException(403, { message: 'Not your job' });
  }
  if (!canTransition(job.status, next)) {
    throw new HTTPException(422, {
      message: `Illegal transition ${job.status} -> ${next}`,
    });
  }
  // Delivery success is confirmed by an admin only; a driver marks PENDING_CONFIRMATION.
  if (!DRIVER_ADVANCEABLE.includes(next)) {
    throw new HTTPException(403, { message: 'ต้องให้แอดมินยืนยันการส่งสำเร็จ' });
  }

  // Flip status. The commission ledger is written when an admin confirms DELIVERED.
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.job.update({ where: { id: jobId }, data: { status: next } });
    await tx.driver.update({
      where: { id: driver.id },
      data: {
        lastActiveAt: new Date(), // advancing a job counts as activity
        ...(next === 'CANCELLED' ? { cancelCount: { increment: 1 } } : {}),
      },
    });
    return u;
  });
  // Keep the customer informed of progress.
  const customer = await prisma.customer.findUnique({
    where: { id: updated.customerId },
    select: { userId: true },
  });
  if (customer?.userId) {
    const notice = CUSTOMER_STATUS_NOTICE[next] ?? {
      title: 'อัปเดตสถานะการจัดส่ง',
      body: `สถานะงานของท่านเปลี่ยนเป็น “${JOB_STATUS_LABEL[next]}”`,
    };
    await notify({
      userId: customer.userId,
      type: 'JOB_STATUS',
      title: notice.title,
      body: notice.body,
      jobId: updated.id,
      rows: await customerJobRows(updated, driver),
    });
  }
  return toJobDto(updated);
}
