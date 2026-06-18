import { HTTPException } from 'hono/http-exception';
import { prisma, type Prisma } from '@movesook/db';
import {
  computeDiscount,
  canTransition,
  computeCommission,
  JOB_STATUS_LABEL,
} from '@movesook/shared';
import type {
  AdminListJobsQuery,
  AdminCreateJobInput,
  AdminPatchJobInput,
  AdminApproveAssignInput,
  AdminRejectPaymentInput,
  AdminRejectDestChangeInput,
  AdminJobListItem,
  AdminJobDetailResponse,
  JobStatus,
  JobDto,
  DriverDto,
} from '@movesook/shared';
import {
  toJobDto,
  toDriverDto,
  pageArgs,
  orderByOf,
  writeAudit,
  notify,
  enqueueAdminAlert,
  enqueueJobBroadcast,
  buildReceiptLink,
  getCommissionPct,
  getSystemSettings,
  getVehicleLabel,
  isVehicleTypeActive,
  createCodCommissionTransaction,
  createDeliveryTransaction,
  attachToDriverPayout,
  maybeIssueReferralReward,
  renderJobDocument,
  type DocType,
} from '@movesook/services/support';

export type JobListResponse = {
  items: AdminJobListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** List jobs (province matches origin OR dest). */
export async function listJobs(q: AdminListJobsQuery): Promise<JobListResponse> {
  const where: Prisma.JobWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.province
      ? { OR: [{ originProvince: q.province }, { destProvince: q.province }] }
      : {}),
    ...(q.originProvince ? { originProvince: q.originProvince } : {}),
    ...(q.destProvince ? { destProvince: q.destProvince } : {}),
    ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: orderByOf(
        q.sortBy,
        q.sortDir,
        ['createdAt', 'status', 'priceQuoted', 'originProvince'],
        'createdAt',
      ),
      ...pageArgs(q),
      include: {
        customer: { include: { user: { select: { displayName: true, phone: true } } } },
      },
    }),
    prisma.job.count({ where }),
  ]);
  const items: AdminJobListItem[] = rows.map((j) => ({
    ...toJobDto(j),
    customerName: j.customer.name ?? j.customer.user?.displayName ?? null,
    customerPhone: j.customer.phone ?? j.customer.user?.phone ?? null,
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Single job detail (admin). */
export async function getJobDetail(id: string): Promise<AdminJobDetailResponse> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: { include: { user: { select: { displayName: true, phone: true } } } },
      driver: { include: { user: { select: { displayName: true } } } },
    },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  return {
    ...toJobDto(job),
    customerName: job.customer.name ?? job.customer.user?.displayName ?? null,
    customerPhone: job.customer.phone ?? job.customer.user?.phone ?? null,
    driverName: job.driver ? (job.driver.user?.displayName ?? job.driver.name) : null,
    driverLat: job.driver?.lastLat ?? null,
    driverLng: job.driver?.lastLng ?? null,
    driverLocationAt: job.driver?.locationAt ? job.driver.locationAt.toISOString() : null,
  };
}

/** Admin creates a job on behalf of a customer (assign a driver now, or post open). */
export async function createJob(sub: string, input: AdminCreateJobInput): Promise<JobDto> {
  const actorId = sub;

  // Enforce: vehicle type must be open for joining.
  if (!(await isVehicleTypeActive(input.vehicleType))) {
    throw new HTTPException(422, { message: 'ประเภทรถนี้ยังไม่เปิดรับ' });
  }
  // Enforce active service area (if any configured) + price guards.
  const areaCount = await prisma.serviceArea.count();
  if (areaCount > 0) {
    const area = await prisma.serviceArea.findUnique({ where: { province: input.originProvince } });
    if (!area || !area.isActive) {
      throw new HTTPException(422, { message: 'จังหวัดต้นทางไม่ได้เปิดให้บริการ' });
    }
  }
  if (input.priceQuoted !== undefined) {
    const sys = await getSystemSettings();
    if (input.priceQuoted < sys.minJobPrice || input.priceQuoted > sys.maxJobPrice) {
      throw new HTTPException(422, {
        message: `ราคาต้องอยู่ระหว่าง ${sys.minJobPrice}–${sys.maxJobPrice} บาท`,
      });
    }
  }

  // Apply a promo code (if any) against the quoted price.
  let priceQuoted = input.priceQuoted ?? null;
  let discountAmount: number | null = null;
  let promoCode: string | null = null;
  if (input.promoCode && priceQuoted !== null) {
    const code = input.promoCode.trim().toUpperCase();
    const promo = await prisma.promoCode.findUnique({ where: { code } });
    const now = new Date();
    if (
      !promo ||
      !promo.isActive ||
      (promo.expiresAt && promo.expiresAt <= now) ||
      (promo.maxUses !== null && promo.usedCount >= promo.maxUses) ||
      (promo.minOrder !== null && priceQuoted < promo.minOrder)
    ) {
      throw new HTTPException(422, { message: 'โค้ดส่วนลดใช้ไม่ได้' });
    }
    discountAmount = computeDiscount(priceQuoted, promo.type, promo.value);
    priceQuoted = priceQuoted - discountAmount;
    promoCode = code;
  }

  // Resolve the customer: reuse an existing one, or record a new offline customer.
  let customerId = input.customerId;
  if (customerId) {
    const exists = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!exists) throw new HTTPException(404, { message: 'Customer not found' });
  } else {
    const created = await prisma.customer.create({
      data: {
        name: input.customerName ?? null,
        phone: input.customerPhone ?? null,
        note: input.customerNote ?? null,
        createdById: actorId,
      },
    });
    customerId = created.id;
  }

  const paymentMethod = input.paymentMethod ?? 'PREPAID';
  // Disposition: assign now (-> ACCEPTED, snapshot commission) or post open (-> POSTED).
  let status: JobStatus = 'POSTED';
  let driverId: string | null = null;
  let driverUserId: string | null = null;
  let commissionPct: number | null = null;
  // For a COD job assigned straight to a driver, snapshot the commission fee they owe.
  let codCommissionFee: number | null = null;
  if (input.assignDriverId) {
    const driver = await prisma.driver.findUnique({ where: { id: input.assignDriverId } });
    if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
    if (driver.verifyStatus !== 'APPROVED') {
      throw new HTTPException(422, { message: 'Driver is not approved' });
    }
    status = 'ACCEPTED';
    driverId = driver.id;
    driverUserId = driver.userId;
    commissionPct = await getCommissionPct();
    if (paymentMethod === 'COD' && priceQuoted != null) {
      codCommissionFee = computeCommission(priceQuoted, commissionPct).commissionAmount;
    }
  }

  const job = await prisma.job.create({
    data: {
      customerId,
      createdByAdminId: actorId,
      status,
      paymentMethod,
      driverId,
      commissionPct,
      codCommissionFee,
      itemDescription: input.itemDescription,
      vehicleType: input.vehicleType,
      originAddress: input.originAddress,
      originProvince: input.originProvince,
      destAddress: input.destAddress,
      destProvince: input.destProvince,
      scheduledAt: input.scheduledAt ?? null,
      priceQuoted,
      promoCode,
      discountAmount,
      // Admin-created jobs post directly; if the admin attaches the customer's
      // slip, record it and mark payment approved (admin vouches for it).
      paymentSlipUrl: input.paymentSlipUrl ?? null,
      paymentSlipUploadedAt: input.paymentSlipUrl ? new Date() : null,
      paymentApprovedAt: input.paymentSlipUrl ? new Date() : null,
      paymentApprovedById: input.paymentSlipUrl ? actorId : null,
    },
  });
  if (promoCode) {
    await prisma.promoCode.update({
      where: { code: promoCode },
      data: { usedCount: { increment: 1 } },
    });
  }
  // COD: an admin-created job skips the customer payment gate, so book the commission
  // as collected revenue now (admin vouches for the up-front payment), mirroring the
  // self-serve payment-approval flow. Idempotent; a no-op for PREPAID.
  if (job.paymentMethod === 'COD') {
    await createCodCommissionTransaction(prisma, job);
  }
  await writeAudit({
    actorId,
    action: 'job.create',
    targetType: 'job',
    targetId: job.id,
    metadata: { customerId, status, assignedDriverId: driverId, promoCode, discountAmount },
  });
  // Tell the assigned driver they have a new job from dispatch; otherwise fan out to the area.
  if (driverUserId) {
    await notify({
      userId: driverUserId,
      type: 'JOB_ASSIGNED',
      title: 'คุณได้รับมอบหมายงานใหม่',
      body: `${job.originProvince} → ${job.destProvince} · ${job.itemDescription}`,
      jobId: job.id,
    });
  } else {
    await enqueueJobBroadcast(job.id);
  }
  return toJobDto(job);
}

/** Intervene on a problem job (admin may set any status, but still legal-only). */
export async function patchJob(
  sub: string,
  id: string,
  patch: AdminPatchJobInput,
): Promise<JobDto> {
  const actorId = sub;
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });

  if (patch.status && patch.status !== job.status && !canTransition(job.status, patch.status)) {
    throw new HTTPException(422, {
      message: `Illegal transition ${job.status} -> ${patch.status}`,
    });
  }

  const data: Prisma.JobUncheckedUpdateInput = {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.driverId !== undefined ? { driverId: patch.driverId } : {}),
    ...(patch.priceQuoted !== undefined ? { priceQuoted: patch.priceQuoted } : {}),
  };

  // Admin-confirmed delivery: write the commission ledger + credit the driver atomically.
  const confirmingDelivery = patch.status === 'DELIVERED' && job.status !== 'DELIVERED';
  const statusChanged = !!patch.status && patch.status !== job.status;

  // Guard: a delivery confirmation MUST be able to produce the driver's commission
  // transaction. Block (don't silently skip) if the effective job has no driver or
  // no price — the admin sets a price in the same patch / the จัดการ dialog first.
  if (confirmingDelivery) {
    const effectiveDriverId = patch.driverId !== undefined ? patch.driverId : job.driverId;
    const effectivePrice = patch.priceQuoted !== undefined ? patch.priceQuoted : job.priceQuoted;
    if (!effectiveDriverId) {
      throw new HTTPException(422, {
        message: 'งานนี้ยังไม่มีคนขับ — มอบหมายคนขับก่อนยืนยันส่งสำเร็จ',
      });
    }
    if (effectivePrice == null || effectivePrice <= 0) {
      throw new HTTPException(422, {
        message: 'กรุณาระบุราคางานก่อนยืนยันส่งสำเร็จ เพื่อสร้างธุรกรรมกับคนขับ',
      });
    }
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.job.update({ where: { id }, data });
    if (confirmingDelivery) {
      // Per-job payment: the commission ledger row IS the payable unit shown on
      // "ธุรกรรมกับคนขับ" (1 job = 1 row), marked paid individually.
      const txn = await createDeliveryTransaction(tx, u);
      // PREPAID owes the driver netToDriver — bundle it into their open payout run so
      // it surfaces on "ธุรกรรมกับคนขับ" immediately. COD rows owe no payout (driver
      // took the cash) and createDeliveryTransaction returns null when a row already
      // exists (e.g. a COD job whose commission was booked at approval).
      if (txn && txn.driverId && txn.paymentMethod !== 'COD') {
        await attachToDriverPayout(tx, txn, actorId);
      }
      if (u.driverId) {
        await tx.driver.update({
          where: { id: u.driverId },
          data: { completedCount: { increment: 1 } },
        });
      }
    }
    return u;
  });

  // Notify the assigned driver that their delivery was confirmed.
  if (confirmingDelivery && updated.driverId) {
    const drv = await prisma.driver.findUnique({
      where: { id: updated.driverId },
      select: { userId: true },
    });
    if (drv?.userId) {
      await notify({
        userId: drv.userId,
        type: 'JOB_STATUS',
        title: 'ยืนยันการส่งสำเร็จแล้ว',
        body: `${updated.originProvince} → ${updated.destProvince} ได้รับการยืนยันจากแอดมิน`,
        jobId: updated.id,
      });
    }
    // Two-sided referral reward (best-effort, idempotent) on the customer's
    // first confirmed delivery — runs post-commit so it never blocks delivery.
    await maybeIssueReferralReward(updated.customerId);
  }

  // Keep the customer informed when an admin changes the job status (mirrors the
  // normal lifecycle notification) — send the Thai label, not the raw enum.
  if (statusChanged) {
    const customer = await prisma.customer.findUnique({
      where: { id: updated.customerId },
      select: { userId: true },
    });
    if (customer?.userId) {
      await notify({
        userId: customer.userId,
        type: 'JOB_STATUS',
        title: 'สถานะงานอัปเดต',
        body: `งานของคุณเปลี่ยนเป็น ${JOB_STATUS_LABEL[updated.status]}`,
        jobId: updated.id,
      });
    }
  }

  await writeAudit({
    actorId,
    action: 'job.patch',
    targetType: 'job',
    targetId: id,
    metadata: {
      before: { status: job.status, driverId: job.driverId, priceQuoted: job.priceQuoted },
      patch,
    },
  });
  return toJobDto(updated);
}

const DOC_TYPES = ['receipt', 'payout', 'worksheet', 'delivery'] as const;

/**
 * Build a printable PDF document for a job. Returns the raw bytes + metadata;
 * the route sets HTTP headers / body.
 */
export async function buildJobDoc(
  sub: string,
  id: string,
  type: string,
): Promise<{ pdf: Buffer; filename: string; contentType: string }> {
  if (!DOC_TYPES.includes(type as (typeof DOC_TYPES)[number])) {
    throw new HTTPException(404, { message: 'Unknown document type' });
  }
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: { include: { user: { select: { displayName: true, phone: true } } } },
      driver: { include: { user: { select: { displayName: true, phone: true } } } },
      transaction: true,
    },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });

  const settings = await getSystemSettings();
  const pdf = await renderJobDocument(type as DocType, {
    job,
    customer: job.customer,
    driver: job.driver,
    transaction: job.transaction,
    settings,
    vehicleLabel: await getVehicleLabel(job.vehicleType),
  });
  await writeAudit({
    actorId: sub,
    action: 'job.document',
    targetType: 'job',
    targetId: id,
    metadata: { type },
  });
  return {
    pdf,
    filename: `${type}-${id}.pdf`,
    contentType: 'application/pdf',
  };
}

/**
 * Approve a customer's transfer slip: publishes a PENDING_PAYMENT job (-> POSTED)
 * and fans it out to drivers in the area. Requires a slip to have been uploaded.
 */
export async function approvePayment(sub: string, id: string): Promise<JobDto> {
  const actorId = sub;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.status !== 'PENDING_PAYMENT') {
    throw new HTTPException(422, { message: 'งานนี้ไม่ได้อยู่ในขั้นรอชำระเงิน' });
  }
  if (!job.paymentSlipUrl) {
    throw new HTTPException(422, { message: 'ยังไม่มีสลิปการโอนให้อนุมัติ' });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.job.update({
      where: { id },
      data: {
        status: 'POSTED',
        paymentApprovedAt: new Date(),
        paymentApprovedById: actorId,
        paymentRejectedReason: null,
      },
    });
    // COD: the customer just paid the commission up-front — record it on the ledger
    // now (status PAID, no driver yet) so it shows on "ธุรกรรมกับลูกค้า" immediately.
    // PREPAID's ledger row is written later, at admin-confirmed delivery.
    if (u.paymentMethod === 'COD') {
      await createCodCommissionTransaction(tx, u);
    }
    return u;
  });
  await writeAudit({
    actorId,
    action: 'job.payment.approve',
    targetType: 'job',
    targetId: id,
    metadata: { priceQuoted: updated.priceQuoted, slipUrl: updated.paymentSlipUrl },
  });
  // Now public — alert approved, available drivers in the origin province.
  await enqueueJobBroadcast(updated.id);
  if (job.customer.userId) {
    await notify({
      userId: job.customer.userId,
      type: 'JOB_STATUS',
      title: 'ยืนยันการชำระเงินแล้ว',
      body: `งาน ${updated.originProvince} → ${updated.destProvince} ถูกเผยแพร่ให้คนขับแล้ว`,
      jobId: updated.id,
      cta: { label: 'ดูใบเสร็จรับเงิน', url: await buildReceiptLink(updated.id) },
    });
  }
  return toJobDto(updated);
}

/**
 * Drivers an admin can hand THIS job to. Returns every APPROVED driver (the admin
 * is overriding the on-demand flow, so we never empty the list), with the best fits
 * sorted to the top: matching vehicle type, then currently available, then matching
 * origin province, then rating. Availability/vehicle are ranking signals, not hard
 * filters — verification is the only hard gate (enforced again in approveAssign).
 */
export async function listAssignableDrivers(
  id: string,
): Promise<{ items: DriverDto[] }> {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  const rows = await prisma.driver.findMany({
    where: { verifyStatus: 'APPROVED' },
    include: { user: { select: { displayName: true } } },
  });
  const score = (d: DriverDto, available: boolean) =>
    (d.vehicleType === job.vehicleType ? 4 : 0) +
    (available ? 2 : 0) +
    (d.serviceProvince === job.originProvince ? 1 : 0);
  const items = rows
    .map((d) => ({ dto: toDriverDto(d, d.user?.displayName ?? null), available: d.isAvailable }))
    .sort((a, b) => {
      const diff = score(b.dto, b.available) - score(a.dto, a.available);
      if (diff !== 0) return diff;
      return b.dto.ratingAvg - a.dto.ratingAvg;
    })
    .map((r) => r.dto);
  return { items };
}

/**
 * Approve the customer's slip AND assign the job to a chosen driver in one step:
 * the job skips the open POSTED feed and goes straight to ACCEPTED.
 */
export async function approveAssign(
  sub: string,
  id: string,
  input: AdminApproveAssignInput,
): Promise<JobDto> {
  const actorId = sub;
  const { driverId } = input;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.status !== 'PENDING_PAYMENT') {
    throw new HTTPException(422, { message: 'งานนี้ไม่ได้อยู่ในขั้นรอชำระเงิน' });
  }
  if (!job.paymentSlipUrl) {
    throw new HTTPException(422, { message: 'ยังไม่มีสลิปการโอนให้อนุมัติ' });
  }
  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
  if (driver.verifyStatus !== 'APPROVED') {
    throw new HTTPException(422, { message: 'คนขับยังไม่ผ่านการอนุมัติ' });
  }
  // Availability is a ranking hint in the picker, not a hard gate — an admin
  // explicitly assigning here is overriding the on-demand flow on purpose.

  const commissionPct = await getCommissionPct();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.job.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        driverId: driver.id,
        commissionPct,
        paymentApprovedAt: new Date(),
        paymentApprovedById: actorId,
        paymentRejectedReason: null,
        // COD: snapshot the commission the driver now owes on this job.
        ...(job.paymentMethod === 'COD' && job.priceQuoted != null
          ? { codCommissionFee: computeCommission(job.priceQuoted, commissionPct).commissionAmount }
          : {}),
      },
    });
    // COD: the customer paid the commission up-front — record it on the ledger now.
    if (u.paymentMethod === 'COD') {
      await createCodCommissionTransaction(tx, u);
    }
    return u;
  });

  await writeAudit({
    actorId,
    action: 'job.payment.approve-assign',
    targetType: 'job',
    targetId: id,
    metadata: { driverId: driver.id, priceQuoted: updated.priceQuoted },
  });
  if (driver.userId) {
    await notify({
      userId: driver.userId,
      type: 'JOB_ASSIGNED',
      title: 'คุณได้รับมอบหมายงานใหม่',
      body: `${updated.originProvince} → ${updated.destProvince} · ${updated.itemDescription}`,
      jobId: updated.id,
    });
  }
  if (job.customer.userId) {
    await notify({
      userId: job.customer.userId,
      type: 'JOB_STATUS',
      title: 'ยืนยันการชำระเงินแล้ว',
      body: `งาน ${updated.originProvince} → ${updated.destProvince} ได้รับการมอบหมายให้คนขับแล้ว`,
      jobId: updated.id,
      cta: { label: 'ดูใบเสร็จรับเงิน', url: await buildReceiptLink(updated.id) },
    });
  }
  return toJobDto(updated);
}

/**
 * Reject a customer's transfer slip: bounce it back so the customer can re-upload.
 * The job stays PENDING_PAYMENT (hidden from drivers).
 */
export async function rejectPayment(
  sub: string,
  id: string,
  input: AdminRejectPaymentInput,
): Promise<JobDto> {
  const actorId = sub;
  const { reason } = input;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.status !== 'PENDING_PAYMENT') {
    throw new HTTPException(422, { message: 'งานนี้ไม่ได้อยู่ในขั้นรอชำระเงิน' });
  }
  const updated = await prisma.job.update({
    where: { id },
    data: {
      paymentSlipUrl: null,
      paymentSlipUploadedAt: null,
      paymentRejectedReason: reason ?? 'สลิปไม่ถูกต้อง กรุณาอัปโหลดใหม่',
      paymentRejectedCount: { increment: 1 },
    },
  });
  await writeAudit({
    actorId,
    action: 'job.payment.reject',
    targetType: 'job',
    targetId: id,
    metadata: { reason: updated.paymentRejectedReason, rejectedCount: updated.paymentRejectedCount },
  });
  // Repeated rejections usually mean a stuck customer or a problem job —
  // surface it to ops instead of looping silently.
  if (updated.paymentRejectedCount >= 3) {
    await enqueueAdminAlert({
      type: 'GENERIC',
      title: 'สลิปถูกปฏิเสธซ้ำหลายครั้ง',
      body: `งาน ${updated.originProvince} → ${updated.destProvince} ถูกปฏิเสธสลิปครั้งที่ ${updated.paymentRejectedCount} — ควรติดต่อลูกค้าโดยตรง`,
      jobId: updated.id,
    });
  }
  if (job.customer.userId) {
    await notify({
      userId: job.customer.userId,
      type: 'JOB_STATUS',
      title: 'สลิปการโอนไม่ผ่าน',
      body: updated.paymentRejectedReason ?? 'กรุณาอัปโหลดสลิปใหม่อีกครั้ง',
      jobId: updated.id,
    });
  }
  return toJobDto(updated);
}

/** Approve the dest-change REQUEST itself: the customer may now transfer the change fee. */
export async function approveDestChange(sub: string, id: string): Promise<JobDto> {
  const actorId = sub;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.destChangeStatus !== 'REQUESTED') {
    throw new HTTPException(422, { message: 'คำขอนี้ไม่ได้อยู่ในขั้นรออนุมัติ' });
  }
  const updated = await prisma.job.update({
    where: { id },
    data: {
      destChangeStatus: 'APPROVED_AWAITING_PAYMENT',
      destChangeApprovedById: actorId,
      destChangeRejectedReason: null,
    },
  });
  await writeAudit({
    actorId,
    action: 'job.destchange.approve',
    targetType: 'job',
    targetId: id,
    metadata: { newAddress: updated.destChangeNewAddress, fee: updated.destChangeFee },
  });
  if (job.customer.userId) {
    await notify({
      userId: job.customer.userId,
      type: 'JOB_STATUS',
      title: 'อนุมัติคำขอเปลี่ยนที่อยู่แล้ว',
      body: `กรุณาโอนค่าธรรมเนียม ฿${(updated.destChangeFee ?? 0).toLocaleString('th-TH')} แล้วอัปโหลดสลิปเพื่อยืนยันการเปลี่ยนที่อยู่`,
      jobId: updated.id,
    });
  }
  return toJobDto(updated);
}

/** Reject the destination-change request (customer may raise a new one later). */
export async function rejectDestChange(
  sub: string,
  id: string,
  input: AdminRejectDestChangeInput,
): Promise<JobDto> {
  const actorId = sub;
  const { reason } = input;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.destChangeStatus !== 'REQUESTED' && job.destChangeStatus !== 'PENDING_REVIEW') {
    throw new HTTPException(422, { message: 'ไม่มีคำขอเปลี่ยนที่อยู่ที่ปฏิเสธได้' });
  }
  const updated = await prisma.job.update({
    where: { id },
    data: {
      destChangeStatus: 'REJECTED',
      destChangeRejectedReason: reason ?? 'คำขอเปลี่ยนที่อยู่ไม่ได้รับการอนุมัติ',
      destChangeSlipUrl: null,
      destChangeSlipUploadedAt: null,
    },
  });
  await writeAudit({
    actorId,
    action: 'job.destchange.reject',
    targetType: 'job',
    targetId: id,
    metadata: { reason: updated.destChangeRejectedReason },
  });
  if (job.customer.userId) {
    await notify({
      userId: job.customer.userId,
      type: 'JOB_STATUS',
      title: 'คำขอเปลี่ยนที่อยู่ไม่ผ่าน',
      body: updated.destChangeRejectedReason ?? 'คำขอเปลี่ยนที่อยู่ไม่ได้รับการอนุมัติ',
      jobId: updated.id,
    });
  }
  return toJobDto(updated);
}

/**
 * Approve the change-fee slip: write the new destination onto the live job in one
 * transaction, then notify the assigned driver of the re-route.
 */
export async function approveDestChangePayment(sub: string, id: string): Promise<JobDto> {
  const actorId = sub;
  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      customer: { select: { userId: true } },
      driver: { select: { userId: true } },
    },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.destChangeStatus !== 'PENDING_REVIEW') {
    throw new HTTPException(422, { message: 'ไม่มีสลิปค่าเปลี่ยนที่อยู่รออนุมัติ' });
  }
  if (!job.destChangeNewAddress || !job.destChangeNewProvince) {
    throw new HTTPException(422, { message: 'ข้อมูลที่อยู่ใหม่ไม่ครบถ้วน' });
  }
  const updated = await prisma.job.update({
    where: { id },
    data: {
      // Promote the pending destination to the live fields.
      destAddress: job.destChangeNewAddress,
      destProvince: job.destChangeNewProvince,
      destLat: job.destChangeNewLat,
      destLng: job.destChangeNewLng,
      destChangeStatus: 'COMPLETED',
      destChangeApprovedById: actorId,
      destChangeCompletedAt: new Date(),
      destChangeRejectedReason: null,
    },
  });
  await writeAudit({
    actorId,
    action: 'job.destchange.complete',
    targetType: 'job',
    targetId: id,
    metadata: {
      from: `${job.destAddress} (${job.destProvince})`,
      to: `${updated.destAddress} (${updated.destProvince})`,
      fee: updated.destChangeFee,
    },
  });
  // Tell the driver the drop-off moved — this is the whole point of the flow.
  if (job.driver?.userId) {
    await notify({
      userId: job.driver.userId,
      type: 'JOB_STATUS',
      title: 'ที่อยู่ปลายทางมีการเปลี่ยนแปลง',
      body: `งาน #${updated.id} เปลี่ยนปลายทางเป็น: ${updated.destAddress} (${updated.destProvince})`,
      jobId: updated.id,
    });
  }
  if (job.customer.userId) {
    await notify({
      userId: job.customer.userId,
      type: 'JOB_STATUS',
      title: 'เปลี่ยนที่อยู่ปลายทางสำเร็จ',
      body: `แจ้งคนขับเรียบร้อยแล้ว ปลายทางใหม่: ${updated.destAddress} (${updated.destProvince})`,
      jobId: updated.id,
    });
  }
  return toJobDto(updated);
}

/** Reject the change-fee slip: bounce it back so the customer can re-upload. */
export async function rejectDestChangePayment(
  sub: string,
  id: string,
  input: AdminRejectDestChangeInput,
): Promise<JobDto> {
  const actorId = sub;
  const { reason } = input;
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.destChangeStatus !== 'PENDING_REVIEW') {
    throw new HTTPException(422, { message: 'ไม่มีสลิปค่าเปลี่ยนที่อยู่รอตรวจสอบ' });
  }
  const updated = await prisma.job.update({
    where: { id },
    data: {
      destChangeStatus: 'APPROVED_AWAITING_PAYMENT',
      destChangeSlipUrl: null,
      destChangeSlipUploadedAt: null,
      destChangeRejectedReason: reason ?? 'สลิปไม่ถูกต้อง กรุณาอัปโหลดใหม่',
    },
  });
  await writeAudit({
    actorId,
    action: 'job.destchange.payment.reject',
    targetType: 'job',
    targetId: id,
    metadata: { reason: updated.destChangeRejectedReason },
  });
  if (job.customer.userId) {
    await notify({
      userId: job.customer.userId,
      type: 'JOB_STATUS',
      title: 'สลิปค่าเปลี่ยนที่อยู่ไม่ผ่าน',
      body: updated.destChangeRejectedReason ?? 'กรุณาอัปโหลดสลิปใหม่อีกครั้ง',
      jobId: updated.id,
    });
  }
  return toJobDto(updated);
}
