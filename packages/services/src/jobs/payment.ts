import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  computeAddressChangeFee,
  computeCommission,
  isInHand,
  type JobDto,
  type RequestDestChangeInput,
} from '@movesook/shared';
import {
  getCommissionPct,
  getEffectivePricePerKm,
  getSystemSettings,
  enqueueAdminAlert,
  toJobDto,
} from '@movesook/services/support';

// Customer-side payment + destination-change flows for a job.
// HTTP routing lives in apps/api/src/routes/jobs.ts.

/** CUSTOMER uploads their bank-transfer slip for a job awaiting payment. The job
 *  remains hidden from drivers; an admin must approve the slip to publish it. */
export async function uploadPaymentSlip(
  sub: string,
  id: string,
  slipUrl: string,
): Promise<JobDto> {
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
  const priceText =
    updated.priceQuoted != null
      ? `฿${updated.priceQuoted.toLocaleString('th-TH')}`
      : 'ไม่ระบุราคา';
  const title = '💰 มีสลิปโอนเงินใหม่รอตรวจสอบ';
  const lines = [
    `${updated.originProvince} → ${updated.destProvince}`,
    `รายการ: ${updated.itemDescription}`,
    `ราคา: ${priceText}`,
    updated.contactPhone ? `ติดต่อ: ${updated.contactPhone}` : null,
    `งาน #${updated.id}`,
  ].filter((l): l is string => Boolean(l));
  const body = lines.join('\n');
  await enqueueAdminAlert({ type: 'GENERIC', title, body, jobId: updated.id, lineGroup: true });

  return toJobDto(updated);
}

/** CUSTOMER switches a still-unpaid (PENDING_PAYMENT) job to COD. The job stays at
 *  PENDING_PAYMENT but the customer now transfers only the commission ("ค่าธรรมเนียม")
 *  instead of the full amount; the rest is paid in cash to the driver at the destination. */
export async function switchToCod(sub: string, id: string): Promise<JobDto> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
  if (job.status !== 'PENDING_PAYMENT') {
    throw new HTTPException(422, {
      message: 'เปลี่ยนเป็นเก็บเงินปลายทางได้เฉพาะงานที่ยังไม่ได้ชำระเงิน',
    });
  }
  if (job.paymentMethod === 'COD') {
    throw new HTTPException(422, { message: 'งานนี้เป็นแบบเก็บเงินปลายทางอยู่แล้ว' });
  }
  const sys = await getSystemSettings();
  if (!sys.codEnabled) {
    throw new HTTPException(422, { message: 'ขณะนี้ยังไม่เปิดให้ใช้บริการเก็บเงินปลายทาง (COD)' });
  }
  if (job.priceQuoted == null) {
    throw new HTTPException(422, { message: 'งานนี้ยังไม่มีราคา จึงเปลี่ยนเป็น COD ไม่ได้' });
  }
  if (sys.codMinPrice > 0 && job.priceQuoted < sys.codMinPrice) {
    throw new HTTPException(422, {
      message: `งานเก็บเงินปลายทางต้องมีมูลค่าอย่างน้อย ฿${sys.codMinPrice.toLocaleString('th-TH')}`,
    });
  }
  if (sys.codMaxPrice > 0 && job.priceQuoted > sys.codMaxPrice) {
    throw new HTTPException(422, {
      message: `งานเก็บเงินปลายทางต้องมีมูลค่าไม่เกิน ฿${sys.codMaxPrice.toLocaleString('th-TH')}`,
    });
  }
  // Snapshot the commission the customer now pays up-front (the % is fixed now).
  const commissionPct = await getCommissionPct();
  const codCommissionFee = computeCommission(job.priceQuoted, commissionPct).commissionAmount;
  const updated = await prisma.job.update({
    where: { id },
    data: {
      paymentMethod: 'COD',
      commissionPct,
      codCommissionFee,
      // Reset the transfer: the customer re-uploads a slip for the commission amount.
      paymentSlipUrl: null,
      paymentSlipUploadedAt: null,
      paymentRejectedReason: null,
    },
  });
  return toJobDto(updated);
}

/** CUSTOMER requests a destination change mid-delivery. The live destination is
 *  untouched; the requested new address is parked on destChange* until an admin
 *  approves the request AND the customer pays the change fee. The fee is snapshotted
 *  now (flat base + extra straight-line distance the new drop-off adds). */
export async function requestDestChange(
  sub: string,
  id: string,
  input: RequestDestChangeInput,
): Promise<JobDto> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
  if (!isInHand(job.status)) {
    throw new HTTPException(422, {
      message: 'เปลี่ยนที่อยู่ได้เฉพาะระหว่างที่คนขับกำลังดำเนินงาน',
    });
  }
  // One active request at a time; a prior NONE/REJECTED/COMPLETED may be superseded.
  const activeStatuses = ['REQUESTED', 'APPROVED_AWAITING_PAYMENT', 'PENDING_REVIEW'];
  if (activeStatuses.includes(job.destChangeStatus)) {
    throw new HTTPException(422, { message: 'มีคำขอเปลี่ยนที่อยู่ที่กำลังดำเนินการอยู่แล้ว' });
  }

  const settings = await getSystemSettings();
  const pricePerKm = await getEffectivePricePerKm(job.vehicleType);
  const fee = computeAddressChangeFee({
    origin:
      job.originLat != null && job.originLng != null
        ? { lat: job.originLat, lng: job.originLng }
        : null,
    oldDest:
      job.destLat != null && job.destLng != null ? { lat: job.destLat, lng: job.destLng } : null,
    newDest:
      input.destLat != null && input.destLng != null
        ? { lat: input.destLat, lng: input.destLng }
        : null,
    baseFee: settings.addressChangeFee,
    pricePerKm,
  });

  // When the customer attaches the transfer slip up front, skip the separate
  // "approve request" gate and go straight to admin payment review.
  const withSlip = Boolean(input.slipUrl);
  const updated = await prisma.job.update({
    where: { id },
    data: {
      destChangeStatus: withSlip ? 'PENDING_REVIEW' : 'REQUESTED',
      destChangeNewAddress: input.destAddress,
      destChangeNewProvince: input.destProvince,
      destChangeNewLat: input.destLat ?? null,
      destChangeNewLng: input.destLng ?? null,
      destChangeReason: input.reason ?? null,
      destChangeFee: fee.total,
      destChangeExtraKm: fee.extraKm,
      destChangeRequestedAt: new Date(),
      destChangeSlipUrl: input.slipUrl ?? null,
      destChangeSlipUploadedAt: withSlip ? new Date() : null,
      // Clear any leftovers from a previous (rejected/completed) request.
      destChangeRejectedReason: null,
      destChangeApprovedById: null,
      destChangeCompletedAt: null,
    },
  });

  const title = withSlip
    ? '📍 คำขอเปลี่ยนที่อยู่ + สลิปรอตรวจสอบ'
    : '📍 คำขอเปลี่ยนที่อยู่ปลายทางใหม่';
  const body = [
    `งาน #${updated.id}`,
    `เดิม: ${job.destAddress} (${job.destProvince})`,
    `ใหม่: ${input.destAddress} (${input.destProvince})`,
    `ค่าธรรมเนียม: ฿${fee.total.toLocaleString('th-TH')}`,
  ].join('\n');
  await enqueueAdminAlert({ type: 'GENERIC', title, body, jobId: updated.id, lineGroup: true });

  return toJobDto(updated);
}

/** CUSTOMER uploads the change-fee transfer slip (only after admin approved the request). */
export async function uploadDestChangeSlip(
  sub: string,
  id: string,
  slipUrl: string,
): Promise<JobDto> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
  if (job.destChangeStatus !== 'APPROVED_AWAITING_PAYMENT') {
    throw new HTTPException(422, { message: 'ยังไม่ถึงขั้นชำระค่าธรรมเนียมเปลี่ยนที่อยู่' });
  }
  const updated = await prisma.job.update({
    where: { id },
    data: {
      destChangeStatus: 'PENDING_REVIEW',
      destChangeSlipUrl: slipUrl,
      destChangeSlipUploadedAt: new Date(),
      destChangeRejectedReason: null,
    },
  });

  const title = '💰 มีสลิปค่าเปลี่ยนที่อยู่รอตรวจสอบ';
  const body = [
    `งาน #${updated.id}`,
    `ที่อยู่ใหม่: ${updated.destChangeNewAddress} (${updated.destChangeNewProvince})`,
    `ค่าธรรมเนียม: ฿${(updated.destChangeFee ?? 0).toLocaleString('th-TH')}`,
  ].join('\n');
  await enqueueAdminAlert({ type: 'GENERIC', title, body, jobId: updated.id, lineGroup: true });

  return toJobDto(updated);
}

/** CUSTOMER withdraws their own pending destination-change request. */
export async function cancelDestChange(sub: string, id: string): Promise<JobDto> {
  const job = await prisma.job.findUnique({
    where: { id },
    include: { customer: { select: { userId: true } } },
  });
  if (!job) throw new HTTPException(404, { message: 'Job not found' });
  if (job.customer.userId !== sub) throw new HTTPException(403, { message: 'Not your job' });
  const cancellable = ['REQUESTED', 'APPROVED_AWAITING_PAYMENT', 'PENDING_REVIEW'];
  if (!cancellable.includes(job.destChangeStatus)) {
    throw new HTTPException(422, { message: 'ไม่มีคำขอเปลี่ยนที่อยู่ที่ยกเลิกได้' });
  }
  const updated = await prisma.job.update({
    where: { id },
    data: {
      destChangeStatus: 'NONE',
      destChangeNewAddress: null,
      destChangeNewProvince: null,
      destChangeNewLat: null,
      destChangeNewLng: null,
      destChangeReason: null,
      destChangeFee: null,
      destChangeExtraKm: null,
      destChangeRequestedAt: null,
      destChangeApprovedById: null,
      destChangeRejectedReason: null,
      destChangeSlipUrl: null,
      destChangeSlipUploadedAt: null,
    },
  });
  return toJobDto(updated);
}
