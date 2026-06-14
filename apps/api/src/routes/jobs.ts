import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { prisma, type Prisma } from '@movesook/db';
import {
  CreateJobInput,
  CreateReviewInput,
  CreateDisputeInput,
  EstimateJobInput,
  FlagJobIllegalInput,
  ListJobsQuery,
  SetJobProofInput,
  UpdateJobStatusInput,
  UploadPaymentSlipInput,
  VehicleTypeSchema,
  canTransition,
  clampJobPrice,
  computeJobQuote,
  DRIVER_ADVANCEABLE,
  DRIVER_IN_HAND,
  haversineKm,
  isCustomerCancellable,
  isCustomerConfirmable,
  isInHand,
  isTerminalStatus,
  type DisputeDto,
  type EstimateJobResponse,
  type JobDetailResponse,
  type JobListResponse,
  type JobPricingResponse,
  type JobServiceAreasResponse,
  type JobTrackEvent,
  type ReviewDto,
} from '@movesook/shared';
import type { AppEnv } from '../lib/context';
import { authenticate, requireRole } from '../middleware/auth';
import { toJobDto } from '../lib/serialize';
import {
  getCommissionPct,
  getEffectivePricePerKm,
  getEffectiveFlatRate,
  getEffectivePerItemRate,
  getFloorSurcharge,
  getHelperSurcharge,
  getSystemSettings,
  isVehicleTypeActive,
} from '../lib/settings';
import { evaluatePromo } from '../lib/promo';
import { getSurge } from '../lib/surge';
import { buildJobDocument } from '../lib/pdf';
import { notify, notifyAdmins, pushAdminLineGroup } from '../lib/notify';

export const jobRoutes = new Hono<AppEnv>()
  // Public: price-per-km per vehicle type — used by the web summary screen (read-only display).
  .get('/pricing', async (c) => {
    // All config rows (not just active) so we can surface the admin-set label even
    // for a type that's temporarily closed; absence of a row defaults to active.
    const rows = await prisma.vehiclePricing.findMany();
    const byType = new Map(rows.map((r) => [r.vehicleType, r]));
    const rates = await Promise.all(
      VehicleTypeSchema.options.map(async (vt) => {
        const row = byType.get(vt);
        return {
          vehicleType: vt,
          label: row?.label ?? null,
          imageUrl: row?.imageUrl ?? null,
          pricePerKm: await getEffectivePricePerKm(vt),
          isActive: row?.isActive ?? true,
        };
      }),
    );
    const body: JobPricingResponse = { rates };
    return c.json(body);
  })
  // Public: provinces the platform serves — used by the posting form to constrain
  // the origin-province picker. Mirrors the POST /jobs service-area guard: when no
  // ServiceArea rows are configured, every province is allowed (unrestricted=true).
  .get('/service-areas', async (c) => {
    const rows = await prisma.serviceArea.findMany({ orderBy: { province: 'asc' } });
    const body: JobServiceAreasResponse = {
      unrestricted: rows.length === 0,
      provinces: rows.filter((r) => r.isActive).map((r) => r.province),
    };
    return c.json(body);
  })
  // Public: full itemised quote for a specific trip (distance base + floor/helper
  // surcharges) and an optional promo-code preview. Mirrors what POST /jobs charges
  // so the customer sees the real price before posting.
  .post('/estimate', zValidator('json', EstimateJobInput), async (c) => {
    const input = c.req.valid('json');

    const [pricePerKm, floorSurcharge, helperSurcharge, surge, flatRate, perItemRate, sys] =
      await Promise.all([
        getEffectivePricePerKm(input.vehicleType),
        getFloorSurcharge(),
        getHelperSurcharge(),
        getSurge(input.originProvince),
        getEffectiveFlatRate(input.vehicleType),
        getEffectivePerItemRate(input.vehicleType),
        getSystemSettings(),
      ]);
    const distanceKm = haversineKm(input.originLat, input.originLng, input.destLat, input.destLng);
    const quote = computeJobQuote({
      pricingMode: input.pricingMode,
      distanceKm,
      pricePerKm,
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
      itemCount: input.itemCount,
    });

    // Promo is preview-only here — usedCount is incremented only at job creation.
    const promo = await evaluatePromo(input.promoCode, quote.subtotal);
    const discountAmount = promo?.ok ? promo.discount : 0;

    const body: EstimateJobResponse = {
      pricingMode: quote.pricingMode,
      distanceKm: Number(distanceKm.toFixed(2)),
      pricePerKm,
      base: quote.base,
      flatRate: quote.flatRate,
      itemsCharge: quote.itemsCharge,
      floorSurcharge: quote.floorSurcharge,
      helperSurcharge: quote.helperSurcharge,
      surgeMultiplier: quote.surgeMultiplier,
      surgeActive: surge.active,
      subtotal: quote.subtotal,
      promoCode: promo?.ok ? input.promoCode!.trim().toUpperCase() : null,
      discountAmount,
      total: clampJobPrice(Math.max(0, quote.subtotal - discountAmount), sys.minJobPrice, sys.maxJobPrice),
      promoError: promo && !promo.ok ? promo.reason : null,
    };
    return c.json(body);
  })
  // USER creates and publishes a moving job.
  .post('/', authenticate('user'), requireRole('USER', 'DRIVER'), zValidator('json', CreateJobInput), async (c) => {
    const { sub } = c.get('claims');
    const input = c.req.valid('json');

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
      const [rate, floorSurcharge, helperSurcharge, surge, flatRate, perItemRate] =
        await Promise.all([
          getEffectivePricePerKm(input.vehicleType),
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
        throw new HTTPException(422, { message: `ระยะทางเกินกำหนด (สูงสุด ${sys.maxDistanceKm} กม.)` });
      }
      const quote = computeJobQuote({
        pricingMode: input.pricingMode,
        distanceKm: distKm,
        pricePerKm: rate,
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
      await prisma.customer.update({ where: { id: customer.id }, data: { phone: input.contactPhone } });
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
          // Held until the customer uploads a transfer slip and an admin approves
          // payment; only then does it flip to POSTED and become visible to drivers.
          status: 'PENDING_PAYMENT',
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
    // Do NOT alert drivers yet — the job is PENDING_PAYMENT and stays hidden until
    // the customer uploads a slip and an admin approves it (POST /admin/jobs/:id/payment/approve).
    return c.json(toJobDto(job), 201);
  })

  // CUSTOMER uploads their bank-transfer slip for a job awaiting payment. The job
  // remains hidden from drivers; an admin must approve the slip to publish it.
  .post('/:id/payment-slip', authenticate('user'), requireRole('USER', 'DRIVER'), zValidator('json', UploadPaymentSlipInput), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
    const { slipUrl } = c.req.valid('json');
    const job = await prisma.job.findUnique({
      where: { id },
      include: { customer: { select: { userId: true } } },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
    if (job.status !== 'PENDING_PAYMENT') {
      throw new HTTPException(422, { message: 'งานนี้ไม่ได้อยู่ในขั้นรอชำระเงิน' });
    }
    const updated = await prisma.job.update({
      where: { id },
      data: {
        paymentSlipUrl: slipUrl,
        paymentSlipUploadedAt: new Date(),
        paymentRejectedReason: null, // clear any previous rejection on re-upload
      },
    });

    // Alert ops that a slip is waiting for review: in-app to every admin + a push
    // to the admin LINE group. Best-effort — must never break the slip upload.
    const priceText = updated.priceQuoted != null ? `฿${updated.priceQuoted.toLocaleString('th-TH')}` : 'ไม่ระบุราคา';
    const title = '💰 มีสลิปโอนเงินใหม่รอตรวจสอบ';
    const lines = [
      `${updated.originProvince} → ${updated.destProvince}`,
      `รายการ: ${updated.itemDescription}`,
      `ราคา: ${priceText}`,
      updated.contactPhone ? `ติดต่อ: ${updated.contactPhone}` : null,
      `งาน #${updated.id}`,
    ].filter((l): l is string => Boolean(l));
    const body = lines.join('\n');
    await notifyAdmins({ type: 'GENERIC', title, body, jobId: updated.id });
    await pushAdminLineGroup(`${title}\n${body}`);

    return c.json(toJobDto(updated));
  })

  // DRIVER browses matching/backhaul jobs; USER lists their own jobs.
  .get('/', authenticate('user'), zValidator('query', ListJobsQuery), async (c) => {
    const { sub, role } = c.get('claims');
    const q = c.req.valid('query');

    let where: Prisma.JobWhereInput;
    if (role === 'DRIVER') {
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
    const body: JobListResponse = {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    };
    return c.json(body);
  })

  // Job detail / tracking — visible to the job's customer or its assigned driver.
  .get('/:id', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        customer: { select: { userId: true } },
        driver: { include: { user: { select: { displayName: true, phone: true } } } },
      },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });

    const isCustomer = job.customer.userId === sub;
    const isAssignedDriver = job.driver?.userId === sub;
    if (!isCustomer && !isAssignedDriver) {
      throw new HTTPException(403, { message: 'Not your job' });
    }

    const body: JobDetailResponse = {
      ...toJobDto(job),
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
    return c.json(body);
  })

  // Customer downloads their own receipt PDF (only the job's owner; only once paid).
  .get('/:id/receipt', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        customer: { include: { user: { select: { displayName: true, phone: true } } } },
        driver: { include: { user: { select: { displayName: true, phone: true } } } },
        transaction: true,
      },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
    if (!job.paymentApprovedAt) {
      throw new HTTPException(422, { message: 'ใบเสร็จจะออกได้หลังยืนยันการชำระเงิน' });
    }
    const settings = await getSystemSettings();
    const pdf = await buildJobDocument('receipt', {
      job,
      customer: job.customer,
      driver: job.driver,
      transaction: job.transaction,
      settings,
    });
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="receipt-${id}.pdf"`,
      },
    });
  })

  // Assigned driver prints the job worksheet (ใบสรุปงาน) for a job they accepted.
  // Available from the moment they win the claim (ACCEPTED) onward — it carries the
  // customer contact, route, items and notes the driver needs on the road.
  .get('/:id/worksheet', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        customer: { include: { user: { select: { displayName: true, phone: true } } } },
        driver: { include: { user: { select: { displayName: true, phone: true } } } },
        transaction: true,
      },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    if (!job.driver || job.driver.userId !== sub) {
      throw new HTTPException(403, { message: 'Not your job' });
    }
    const settings = await getSystemSettings();
    const pdf = await buildJobDocument('worksheet', {
      job,
      customer: job.customer,
      driver: job.driver,
      transaction: job.transaction,
      settings,
    });
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="worksheet-${id}.pdf"`,
      },
    });
  })

  // SSE live-tracking stream: pushes the assigned driver's location + job status
  // every few seconds until the job reaches a terminal state. Visible to the
  // job's customer or its assigned driver (cookie auth via EventSource credentials).
  .get('/:id/track', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
    const gate = await prisma.job.findUnique({
      where: { id },
      select: { customer: { select: { userId: true } }, driver: { select: { userId: true } } },
    });
    if (!gate) throw new HTTPException(404, { message: 'Job not found' });
    if (gate.customer.userId !== sub && gate.driver?.userId !== sub) {
      throw new HTTPException(403, { message: 'Not your job' });
    }

    return streamSSE(c, async (stream) => {
      let aborted = false;
      stream.onAbort(() => {
        aborted = true;
      });
      // Cap the stream (~1h at 5s) so a forgotten tab can't poll forever.
      for (let i = 0; i < 720 && !aborted; i++) {
        const snap = await prisma.job.findUnique({
          where: { id },
          select: {
            status: true,
            driver: { select: { lastLat: true, lastLng: true, locationAt: true } },
          },
        });
        if (!snap) break;
        const event: JobTrackEvent = {
          status: snap.status,
          lat: snap.driver?.lastLat ?? null,
          lng: snap.driver?.lastLng ?? null,
          locationAt: snap.driver?.locationAt ? snap.driver.locationAt.toISOString() : null,
        };
        await stream.writeSSE({ event: 'track', data: JSON.stringify(event) });
        // Stop once the job is finished — nothing left to track.
        if (isTerminalStatus(snap.status)) break;
        await stream.sleep(5000);
      }
    });
  })

  // DRIVER attaches a pickup / delivery proof photo to their job.
  .post('/:id/proof', authenticate('user'), requireRole('DRIVER'), zValidator('json', SetJobProofInput), async (c) => {
    const { sub } = c.get('claims');
    const jobId = c.req.param('id');
    const { kind, urls } = c.req.valid('json');

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
    return c.json(toJobDto(updated));
  })

  // CUSTOMER cancels their own job (only while not yet picked up).
  .post('/:id/cancel', authenticate('user'), requireRole('USER', 'DRIVER'), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
    const job = await prisma.job.findUnique({
      where: { id },
      include: { customer: { select: { userId: true } }, driver: { select: { userId: true } } },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
    if (!isCustomerCancellable(job.status)) {
      throw new HTTPException(422, { message: 'ยกเลิกงานนี้ไม่ได้ (เริ่มขนส่งแล้ว)' });
    }
    // Cancellation fee applies only after the free-cancel window has passed.
    // The fee is snapshotted onto the job so ops can collect it manually —
    // there is no customer wallet to deduct from.
    const sys = await getSystemSettings();
    const elapsedMin = (Date.now() - job.createdAt.getTime()) / 60000;
    const feeApplies = sys.cancellationFee > 0 && elapsedMin > sys.freeCancelMinutes;
    const updated = await prisma.job.update({
      where: { id },
      data: { status: 'CANCELLED', cancellationFeeApplied: feeApplies ? sys.cancellationFee : null },
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
    return c.json(toJobDto(updated));
  })

  // CUSTOMER confirms they received the goods. This does NOT complete the job —
  // it's an extra signal recorded for the admin to decide on final DELIVERED.
  .post('/:id/confirm-delivery', authenticate('user'), requireRole('USER', 'DRIVER'), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
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
    return c.json(toJobDto(updated));
  })

  // DRIVER accepts an open job; snapshots the current commission %.
  .post('/:id/accept', authenticate('user'), requireRole('DRIVER'), async (c) => {
    const { sub } = c.get('claims');
    const jobId = c.req.param('id');

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

    // Cap concurrent in-hand jobs per driver (0 = unlimited).
    const sys = await getSystemSettings();
    if (sys.maxActiveJobsPerDriver > 0) {
      const inHand = await prisma.job.count({
        where: { driverId: driver.id, status: { in: [...DRIVER_IN_HAND] } },
      });
      if (inHand >= sys.maxActiveJobsPerDriver) {
        throw new HTTPException(422, {
          message: `รับงานพร้อมกันได้สูงสุด ${sys.maxActiveJobsPerDriver} งาน — ส่งงานเดิมให้เสร็จก่อน`,
        });
      }
    }

    const commissionPct = await getCommissionPct();

    // Conditional update guards against a race: only an unassigned POSTED job is claimable.
    // The DB serialises concurrent claims at the row level, so exactly one driver wins.
    const result = await prisma.job.updateMany({
      where: { id: jobId, status: 'POSTED', driverId: null },
      data: { status: 'ACCEPTED', driverId: driver.id, commissionPct },
    });
    if (result.count === 0) {
      // We lost the claim — but if *this* driver already owns it (double-tap /
      // retried request), treat it as success so the winner never sees an error.
      const existing = await prisma.job.findUnique({
        where: { id: jobId },
        include: { customer: { select: { userId: true } } },
      });
      if (!existing) throw new HTTPException(404, { message: 'ไม่พบงานนี้' });
      if (existing.driverId === driver.id) return c.json(toJobDto(existing));
      throw new HTTPException(409, { message: 'งานนี้ถูกคนขับคนอื่นรับไปแล้ว' });
    }
    // Winning a claim counts as activity (resets the idle-churn clock).
    await prisma.driver.update({ where: { id: driver.id }, data: { lastActiveAt: new Date() } });

    const job = await prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { customer: { select: { userId: true } } },
    });
    // Notify the customer (if they have an app account) that a driver took the job.
    if (job.customer.userId) {
      await notify({
        userId: job.customer.userId,
        type: 'JOB_STATUS',
        title: 'มีคนขับรับงานของคุณแล้ว',
        body: `${job.originProvince} → ${job.destProvince}`,
        jobId: job.id,
      });
    }
    return c.json(toJobDto(job));
  })

  // DRIVER flags the cargo as prohibited/illegal. Puts the job on hold
  // (FLAGGED_ILLEGAL) for admin review — the driver is NOT penalised and no
  // commission is owed. Allowed only by the assigned driver while in-hand.
  .post('/:id/flag-illegal', authenticate('user'), requireRole('DRIVER'), zValidator('json', FlagJobIllegalInput), async (c) => {
    const { sub } = c.get('claims');
    const jobId = c.req.param('id');
    const { reason } = c.req.valid('json');

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
    await notifyAdmins({
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
    return c.json(toJobDto(updated));
  })

  // DRIVER advances job status through the shared state machine.
  .patch('/:id/status', authenticate('user'), requireRole('DRIVER'), zValidator('json', UpdateJobStatusInput), async (c) => {
    const { sub } = c.get('claims');
    const jobId = c.req.param('id');
    const { status: next } = c.req.valid('json');

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
      await notify({
        userId: customer.userId,
        type: 'JOB_STATUS',
        title: 'สถานะงานอัปเดต',
        body: `งานของคุณเปลี่ยนเป็น ${next}`,
        jobId: updated.id,
      });
    }
    return c.json(toJobDto(updated));
  })

  // USER reviews the driver after a job is DELIVERED (one review per job).
  .post('/:id/review', authenticate('user'), requireRole('USER', 'DRIVER'), zValidator('json', CreateReviewInput), async (c) => {
    const { sub } = c.get('claims');
    const jobId = c.req.param('id');
    const { rating, comment } = c.req.valid('json');

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { customer: { select: { userId: true } } },
    });
    if (!job) throw new HTTPException(404, { message: 'Job not found' });
    // Only the user who owns the job's customer record may review it.
    if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
    if (job.status !== 'DELIVERED') {
      throw new HTTPException(422, { message: 'Can only review delivered jobs' });
    }
    if (!job.driverId) throw new HTTPException(422, { message: 'Job has no driver' });

    const existing = await prisma.review.findUnique({ where: { jobId } });
    if (existing) throw new HTTPException(409, { message: 'Already reviewed' });

    const driverId = job.driverId;
    // Create the review and recompute the driver's denormalised rating in one tx.
    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: { jobId, customerId: sub, driverId, rating, comment: comment ?? null },
      });
      const agg = await tx.review.aggregate({
        where: { driverId },
        _avg: { rating: true },
        _count: { _all: true },
      });
      await tx.driver.update({
        where: { id: driverId },
        data: {
          ratingAvg: Number((agg._avg.rating ?? 0).toFixed(2)),
          ratingCount: agg._count._all,
        },
      });
      return created;
    });

    const dto: ReviewDto = {
      id: review.id,
      jobId: review.jobId,
      customerId: review.customerId,
      driverId: review.driverId,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
    };
    return c.json(dto, 201);
  })

  // A party to the job (customer or assigned driver) raises a dispute.
  .post(
    '/:id/dispute',
    authenticate('user'),
    requireRole('USER', 'DRIVER'),
    zValidator('json', CreateDisputeInput),
    async (c) => {
      const { sub } = c.get('claims');
      const jobId = c.req.param('id');
      const { reason, detail } = c.req.valid('json');

      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: { customer: { select: { userId: true } }, driver: { select: { userId: true } } },
      });
      if (!job) throw new HTTPException(404, { message: 'Job not found' });
      const isParty = job.customer.userId === sub || job.driver?.userId === sub;
      if (!isParty) throw new HTTPException(403, { message: 'Not your job' });
      // Disputes only make sense once a driver is involved — matches the UI's
      // DISPUTABLE set (ACCEPTED → DELIVERED).
      if (!job.driverId) {
        throw new HTTPException(422, { message: 'งานนี้ยังไม่มีคนขับ จึงยังแจ้งปัญหาไม่ได้' });
      }

      const dispute = await prisma.dispute.create({
        data: { jobId, raisedById: sub, reason, detail: detail ?? null },
      });
      const dto: DisputeDto = {
        id: dispute.id,
        jobId: dispute.jobId,
        raisedById: dispute.raisedById,
        reason: dispute.reason,
        detail: dispute.detail,
        status: dispute.status,
        resolution: dispute.resolution,
        resolvedById: dispute.resolvedById,
        resolvedAt: dispute.resolvedAt ? dispute.resolvedAt.toISOString() : null,
        createdAt: dispute.createdAt.toISOString(),
      };
      return c.json(dto, 201);
    },
  );
