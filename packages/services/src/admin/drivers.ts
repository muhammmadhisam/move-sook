import { randomUUID } from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  toDriverDto,
  toJobDto,
  pageArgs,
  orderByOf,
  writeAudit,
  notify,
  isVehicleTypeActive,
} from '@movesook/services/support';
import type {
  AdminListDriversQuery,
  AdminCreateDriverInput,
  AdminConnectDriverInput,
  AdminVerifyDriverInput,
  AdminUpdateDriverBankInput,
  AdminUpdateDriverKycInput,
  AdminDriverDetailResponse,
  DriverDto,
  DriverVerifyStatus,
} from '@movesook/shared';

const VERIFY_STATUS: Record<'APPROVE' | 'REJECT' | 'SUSPEND', DriverVerifyStatus> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  SUSPEND: 'SUSPENDED',
};

export type DriverListResponse = {
  items: DriverDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Driver verification queue (list). */
export async function listDrivers(q: AdminListDriversQuery): Promise<DriverListResponse> {
  const where = q.status ? { verifyStatus: q.status } : {};
  const [rows, total] = await Promise.all([
    prisma.driver.findMany({
      where,
      include: { user: { select: { displayName: true } } },
      orderBy: orderByOf(
        q.sortBy,
        q.sortDir,
        ['createdAt', 'ratingAvg', 'verifyStatus', 'serviceProvince'],
        'createdAt',
      ),
      ...pageArgs(q),
    }),
    prisma.driver.count({ where }),
  ]);
  const items: DriverDto[] = rows.map((d) => toDriverDto(d, d.user?.displayName ?? null));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Full driver profile: jobs accepted, reviews received, earnings. */
export async function getDriverDetail(
  sub: string,
  id: string,
): Promise<AdminDriverDetailResponse> {
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: { user: { select: { displayName: true } } },
  });
  if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
  await writeAudit({
    actorId: sub,
    action: 'pii.view',
    targetType: 'driver',
    targetId: id,
  });

  const [recentJobs, reviews, txns] = await Promise.all([
    prisma.job.findMany({ where: { driverId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.review.findMany({
      where: { driverId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { customer: { select: { displayName: true } } },
    }),
    prisma.transaction.findMany({ where: { driverId: id } }),
  ]);

  const earnings = txns.reduce(
    (acc, t) => {
      acc.totalGross += t.grossAmount;
      acc.totalCommission += t.commissionAmount;
      acc.totalNet += t.netToDriver;
      if (t.status === 'PAID') acc.paidCount += 1;
      if (t.status === 'PENDING') acc.pendingCount += 1;
      return acc;
    },
    { totalGross: 0, totalCommission: 0, totalNet: 0, paidCount: 0, pendingCount: 0 },
  );

  return {
    driver: toDriverDto(driver, driver.user?.displayName ?? null),
    recentJobs: recentJobs.map(toJobDto),
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      customerName: r.customer.displayName,
    })),
    earnings,
  };
}

/** Approve / reject / suspend a driver. */
export async function verifyDriver(
  sub: string,
  id: string,
  input: AdminVerifyDriverInput,
): Promise<{ id: string; verifyStatus: DriverVerifyStatus }> {
  const { decision, reason } = input;
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver) throw new HTTPException(404, { message: 'Driver not found' });

  const verifyStatus = VERIFY_STATUS[decision];
  const updated = await prisma.driver.update({
    where: { id },
    data: {
      verifyStatus,
      // Clear the reason on approval; store it when rejecting / suspending.
      rejectionReason: decision === 'APPROVE' ? null : (reason ?? null),
      // A suspended / rejected driver must drop out of the online feed.
      ...(decision === 'APPROVE' ? {} : { isAvailable: false }),
    },
  });
  await writeAudit({
    actorId: sub,
    action: 'driver.verify',
    targetType: 'driver',
    targetId: id,
    metadata: { decision, from: driver.verifyStatus, to: verifyStatus, reason: reason ?? null },
  });
  const msg =
    decision === 'APPROVE'
      ? 'บัญชีคนขับของคุณได้รับการอนุมัติแล้ว เริ่มรับงานได้เลย'
      : decision === 'SUSPEND'
        ? `บัญชีคนขับถูกระงับชั่วคราว${reason ? `: ${reason}` : ''}`
        : `การสมัครคนขับไม่ผ่าน${reason ? `: ${reason}` : ''}`;
  // Only notify if the driver is linked to an app account.
  if (driver.userId) {
    await notify({
      userId: driver.userId,
      type: 'DRIVER_VERIFY',
      title: 'อัปเดตสถานะคนขับ',
      body: msg,
    });
  }
  return { id: updated.id, verifyStatus: updated.verifyStatus };
}

/** Admin pre-registers a driver (no app account yet — link later via /connect). */
export async function createDriver(
  sub: string,
  input: AdminCreateDriverInput,
): Promise<DriverDto & { claimCode: string }> {
  if (!(await isVehicleTypeActive(input.vehicleType))) {
    throw new HTTPException(422, { message: 'ประเภทรถนี้ยังไม่เปิดรับ' });
  }
  // Invite code the driver enters in the app to claim + complete this application.
  const claimCode = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  const driver = await prisma.driver.create({
    data: {
      name: input.name,
      phone: input.phone ?? null,
      vehicleType: input.vehicleType,
      plateNumber: input.plateNumber ?? null,
      licenseTw2: input.licenseTw2 ?? null,
      serviceProvince: input.serviceProvince ?? null,
      verifyStatus: input.verifyStatus,
      bankName: input.bankName ?? null,
      bankAccountName: input.bankAccountName ?? null,
      bankAccountNo: input.bankAccountNo ?? null,
      claimCode,
    },
  });
  await writeAudit({
    actorId: sub,
    action: 'driver.create',
    targetType: 'driver',
    targetId: driver.id,
    metadata: { name: input.name, verifyStatus: input.verifyStatus },
  });
  // Return the code so the admin can hand it to the driver.
  return { ...toDriverDto(driver, null), claimCode };
}

/** Link a pre-registered driver to a user who has since signed up. */
export async function connectDriver(
  sub: string,
  id: string,
  input: AdminConnectDriverInput,
): Promise<DriverDto> {
  const { userId } = input;

  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
  if (driver.userId) {
    throw new HTTPException(409, { message: 'Driver is already linked to a user' });
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { driver: { select: { id: true } } },
  });
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  if (user.driver) {
    throw new HTTPException(409, { message: 'User already has a driver record' });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.driver.update({ where: { id }, data: { userId } });
    await tx.user.update({ where: { id: userId }, data: { role: 'DRIVER' } });
    return d;
  });
  await writeAudit({
    actorId: sub,
    action: 'driver.connect',
    targetType: 'driver',
    targetId: id,
    metadata: { userId },
  });
  await notify({
    userId,
    type: 'DRIVER_VERIFY',
    title: 'เชื่อมบัญชีคนขับแล้ว',
    body: 'แอดมินได้เชื่อมบัญชีคนขับของคุณเรียบร้อยแล้ว',
  });
  return toDriverDto(updated, user.displayName);
}

/** Update a driver's payout bank info. */
export async function updateDriverBank(
  sub: string,
  id: string,
  input: AdminUpdateDriverBankInput,
): Promise<DriverDto> {
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
  const updated = await prisma.driver.update({
    where: { id },
    data: {
      ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
      ...(input.bankAccountName !== undefined ? { bankAccountName: input.bankAccountName } : {}),
      ...(input.bankAccountNo !== undefined ? { bankAccountNo: input.bankAccountNo } : {}),
    },
  });
  await writeAudit({
    actorId: sub,
    action: 'driver.bank',
    targetType: 'driver',
    targetId: id,
    metadata: { bankName: input.bankName ?? null },
  });
  return toDriverDto(updated, null);
}

/** Update a driver's KYC documents. */
export async function updateDriverKyc(
  sub: string,
  id: string,
  input: AdminUpdateDriverKycInput,
): Promise<DriverDto> {
  const driver = await prisma.driver.findUnique({ where: { id } });
  if (!driver) throw new HTTPException(404, { message: 'Driver not found' });
  const updated = await prisma.driver.update({
    where: { id },
    data: {
      ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
      ...(input.nationalIdUrl !== undefined ? { nationalIdUrl: input.nationalIdUrl } : {}),
      ...(input.licenseNo !== undefined ? { licenseNo: input.licenseNo } : {}),
      ...(input.licenseExpiry !== undefined ? { licenseExpiry: input.licenseExpiry } : {}),
      ...(input.vehicleRegUrl !== undefined ? { vehicleRegUrl: input.vehicleRegUrl } : {}),
      ...(input.vehicleRegExpiry !== undefined
        ? { vehicleRegExpiry: input.vehicleRegExpiry }
        : {}),
      ...(input.insuranceExpiry !== undefined
        ? { insuranceExpiry: input.insuranceExpiry }
        : {}),
    },
  });
  await writeAudit({
    actorId: sub,
    action: 'driver.kyc',
    targetType: 'driver',
    targetId: id,
    metadata: { nationalId: input.nationalId ?? null },
  });
  return toDriverDto(updated, null);
}
