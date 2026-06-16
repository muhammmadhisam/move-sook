import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  USER_JWT_TTL_SEC,
  DRIVER_IN_HAND,
  type ClaimDriverInput,
  type DriverAppealInput,
  type DriverApplyInput,
  type DriverAvailabilityInput,
  type DriverUpdateInput,
  type DriverDto,
  type DriverEarningsResponse,
  type DriverIncentivesResponse,
  type UpdateDriverLocationInput,
} from '@movesook/shared';
import { signJwt } from '@movesook/auth';
import { getSystemSettings, notify, notifyAdmins, toDriverDto } from '@movesook/services/support';
import { getEnv } from '@movesook/services/runtime';

// Driver self-service surface: apply / claim / profile / availability / location /
// earnings / incentives. HTTP routing (auth + zValidator middleware) lives in
// apps/api/src/routes/drivers.ts — these functions take the authenticated user id
// (`sub`) plus validated input and return wire DTOs (or throw HTTPException).
//
// The two role-promoting endpoints (apply, claim) also mint a fresh DRIVER session
// JWT so the new role takes effect immediately. They return the signed `token`
// alongside the DTO; the route is responsible for writing it to the USER cookie
// (cookie naming + the Hono context are route-layer concerns).

export type DriverWithToken = { dto: DriverDto; token: string };

/** Public self-signup: a signed-in user applies to become a driver themselves.
 *  Creates a PENDING application, promotes USER -> DRIVER, and mints a new session
 *  token (the route sets the cookie). */
export async function applyAsDriver(
  sub: string,
  input: DriverApplyInput,
): Promise<DriverWithToken> {
  const existing = await prisma.driver.findUnique({ where: { userId: sub } });
  if (existing) throw new HTTPException(409, { message: 'บัญชีนี้เป็นคนขับอยู่แล้ว' });

  const created = await prisma.$transaction(async (tx) => {
    const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
    const d = await tx.driver.create({
      data: {
        userId: sub,
        vehicleType: input.vehicleType,
        plateNumber: input.plateNumber ?? null,
        licenseTw2: input.licenseTw2 ?? null,
        serviceProvince: input.serviceProvince,
        // Legal name for admin lists (LINE displayName may differ / be missing).
        name: fullName || null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        gender: input.gender ?? null,
        email: input.email ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        nationalId: input.nationalId ?? null,
        nationalIdUrl: input.nationalIdUrl ?? null,
        address: input.address ?? null,
        screening: input.screening,
        licenseNo: input.licenseNo ?? null,
        licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : null,
        verifyStatus: 'PENDING',
        // Anchor the verify-queue SLA clock from the moment they apply.
        submittedAt: new Date(),
      },
    });
    const u = await tx.user.update({
      where: { id: sub },
      data: {
        role: 'DRIVER',
        ...(input.phone ? { phone: input.phone } : {}),
      },
      select: { displayName: true },
    });
    return { d, displayName: u.displayName };
  });

  // Refresh the session token so the new DRIVER role takes effect immediately.
  const token = await signJwt({
    sub,
    role: 'DRIVER',
    secret: getEnv().JWT_SECRET,
    ttlSec: USER_JWT_TTL_SEC,
  });

  // Keep the new applicant warm during the verify wait (reduces drop-off).
  await notify({
    userId: sub,
    type: 'DRIVER_VERIFY',
    title: 'ได้รับใบสมัครคนขับแล้ว',
    body: 'ทีมงานกำลังตรวจสอบข้อมูลของคุณ โดยทั่วไปใช้เวลาไม่เกิน 24 ชั่วโมง',
  });

  return { dto: toDriverDto(created.d, created.displayName), token };
}

/** A signed-in user claims an admin-created driver application via its invite code.
 *  Links the pending (unlinked) Driver to this user, promotes them to DRIVER, and
 *  mints a new session token (the route sets the cookie). */
export async function claimDriver(
  sub: string,
  input: ClaimDriverInput,
): Promise<DriverWithToken> {
  const code = input.code.trim().toUpperCase();

  const existingForUser = await prisma.driver.findUnique({ where: { userId: sub } });
  if (existingForUser) throw new HTTPException(409, { message: 'บัญชีนี้เป็นคนขับอยู่แล้ว' });

  const driver = await prisma.driver.findUnique({ where: { claimCode: code } });
  if (!driver || driver.userId) {
    throw new HTTPException(404, { message: 'โค้ดไม่ถูกต้องหรือถูกใช้ไปแล้ว' });
  }

  const linked = await prisma.$transaction(async (tx) => {
    const d = await tx.driver.update({
      where: { id: driver.id },
      data: { userId: sub, claimCode: null },
    });
    const u = await tx.user.update({
      where: { id: sub },
      data: { role: 'DRIVER' },
      select: { displayName: true },
    });
    return { d, displayName: u.displayName };
  });
  // Refresh the session token so the new DRIVER role takes effect immediately
  // (otherwise the JWT still says USER until the next login).
  const token = await signJwt({
    sub,
    role: 'DRIVER',
    secret: getEnv().JWT_SECRET,
    ttlSec: USER_JWT_TTL_SEC,
  });
  return { dto: toDriverDto(linked.d, linked.displayName), token };
}

/** The driver's own record (prefills the edit form). */
export async function getMyDriver(sub: string): Promise<DriverDto> {
  const driver = await prisma.driver.findUnique({
    where: { userId: sub },
    include: { user: { select: { displayName: true } } },
  });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });
  return toDriverDto(driver, driver.user?.displayName ?? null);
}

/** Driver fills in / edits their own application. Re-submitting moves a REJECTED
 *  app back to PENDING. */
export async function updateMyDriver(
  sub: string,
  input: DriverUpdateInput,
): Promise<DriverDto> {
  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'ยังไม่มีใบสมัครคนขับ (ติดต่อแอดมิน)' });

  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: {
      ...(input.vehicleType ? { vehicleType: input.vehicleType } : {}),
      ...(input.plateNumber !== undefined ? { plateNumber: input.plateNumber } : {}),
      ...(input.licenseTw2 !== undefined ? { licenseTw2: input.licenseTw2 } : {}),
      ...(input.serviceProvince ? { serviceProvince: input.serviceProvince } : {}),
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.firstName !== undefined || input.lastName !== undefined
        ? { name: [input.firstName ?? driver.firstName, input.lastName ?? driver.lastName].filter(Boolean).join(' ').trim() || null }
        : {}),
      ...(input.birthDate !== undefined ? { birthDate: new Date(input.birthDate) } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.emergencyContactName !== undefined
        ? { emergencyContactName: input.emergencyContactName }
        : {}),
      ...(input.emergencyContactPhone !== undefined
        ? { emergencyContactPhone: input.emergencyContactPhone }
        : {}),
      ...(input.nationalId !== undefined ? { nationalId: input.nationalId } : {}),
      ...(input.nationalIdUrl !== undefined ? { nationalIdUrl: input.nationalIdUrl } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.screening !== undefined ? { screening: input.screening } : {}),
      ...(input.licenseNo !== undefined ? { licenseNo: input.licenseNo } : {}),
      ...(input.licenseExpiry !== undefined ? { licenseExpiry: new Date(input.licenseExpiry) } : {}),
      ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
      ...(input.bankAccountName !== undefined ? { bankAccountName: input.bankAccountName } : {}),
      ...(input.bankAccountNo !== undefined ? { bankAccountNo: input.bankAccountNo } : {}),
      // Each submission (re)anchors the verify-queue SLA clock.
      submittedAt: new Date(),
      // A driver editing a rejected application resubmits it for review.
      ...(driver.verifyStatus === 'REJECTED'
        ? { verifyStatus: 'PENDING', rejectionReason: null }
        : {}),
    },
  });
  if (input.phone) {
    await prisma.user.update({ where: { id: sub }, data: { phone: input.phone } });
  }
  // Acknowledge a submission that's now awaiting admin review (keeps the
  // applicant warm during the verify wait — reduces onboarding drop-off).
  if (updated.verifyStatus === 'PENDING') {
    await notify({
      userId: sub,
      type: 'DRIVER_VERIFY',
      title: 'ได้รับใบสมัครคนขับแล้ว',
      body: 'ทีมงานกำลังตรวจสอบข้อมูลของคุณ โดยทั่วไปใช้เวลาไม่เกิน 24 ชั่วโมง',
    });
  }
  const user = await prisma.user.findUnique({ where: { id: sub }, select: { displayName: true } });
  return toDriverDto(updated, user?.displayName ?? null);
}

/** A REJECTED / SUSPENDED driver appeals the decision with a message to admins.
 *  REJECTED → goes back to PENDING for re-review; SUSPENDED stays suspended. */
export async function appealDriver(
  sub: string,
  input: DriverAppealInput,
): Promise<DriverDto> {
  const { message } = input;

  const driver = await prisma.driver.findUnique({
    where: { userId: sub },
    include: { user: { select: { displayName: true } } },
  });
  if (!driver) throw new HTTPException(403, { message: 'ยังไม่มีใบสมัครคนขับ' });
  if (driver.verifyStatus !== 'REJECTED' && driver.verifyStatus !== 'SUSPENDED') {
    throw new HTTPException(422, { message: 'ยื่นอุทธรณ์ได้เฉพาะบัญชีที่ถูกปฏิเสธหรือถูกระงับ' });
  }

  const wasRejected = driver.verifyStatus === 'REJECTED';
  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: {
      appealMessage: message,
      appealAt: new Date(),
      // A rejected applicant re-enters the verify queue; a suspended one stays
      // suspended until an admin explicitly lifts it.
      ...(wasRejected
        ? { verifyStatus: 'PENDING', rejectionReason: null, submittedAt: new Date() }
        : {}),
    },
  });

  const who = driver.user?.displayName ?? driver.name ?? 'คนขับ';
  await notifyAdmins({
    type: 'DRIVER_VERIFY',
    title: 'คนขับยื่นอุทธรณ์',
    body: `${who} (${wasRejected ? 'ถูกปฏิเสธ' : 'ถูกระงับ'}) ยื่นอุทธรณ์: ${message}`,
  });
  await notify({
    userId: sub,
    type: 'DRIVER_VERIFY',
    title: 'ได้รับคำอุทธรณ์แล้ว',
    body: wasRejected
      ? 'ใบสมัครของคุณกลับเข้าสู่การตรวจสอบอีกครั้ง ทีมงานจะแจ้งผลให้ทราบ'
      : 'ทีมงานได้รับคำอุทธรณ์ของคุณแล้ว และจะติดต่อกลับโดยเร็ว',
  });

  return toDriverDto(updated, driver.user?.displayName ?? null);
}

/** Driver toggles online/offline for the on-demand feed. */
export async function setAvailability(
  sub: string,
  input: DriverAvailabilityInput,
): Promise<{ id: string; isAvailable: boolean }> {
  const { isAvailable } = input;
  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });

  // Going off-duty (พักงาน) is blocked while a job is still in hand — the
  // driver must finish (deliver) any accepted/in-transit job first.
  if (!isAvailable) {
    const inHand = await prisma.job.count({
      where: { driverId: driver.id, status: { in: [...DRIVER_IN_HAND] } },
    });
    if (inHand > 0) {
      throw new HTTPException(422, {
        message: 'มีงานที่ต้องส่งให้เสร็จก่อน จึงจะพักรับงานได้',
      });
    }
  }

  const updated = await prisma.driver.update({
    where: { id: driver.id },
    // Toggling availability counts as activity (resets the idle-churn clock).
    data: { isAvailable, lastActiveAt: new Date() },
  });
  return { id: updated.id, isAvailable: updated.isAvailable };
}

/** Driver broadcasts their current GPS (throttled client-side) for live tracking. */
export async function updateLocation(
  sub: string,
  input: UpdateDriverLocationInput,
): Promise<{ ok: true }> {
  const { lat, lng } = input;
  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });
  const now = new Date();
  await prisma.driver.update({
    where: { id: driver.id },
    // A live ping also counts as activity (keeps the driver off the idle list).
    data: { lastLat: lat, lastLng: lng, locationAt: now, lastActiveAt: now },
  });
  return { ok: true };
}

/** Driver's own earnings summary (from the commission ledger). */
export async function getEarnings(sub: string): Promise<DriverEarningsResponse> {
  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });

  const txns = await prisma.transaction.findMany({
    where: { driverId: driver.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return {
    totalNet: txns.reduce((n, t) => n + t.netToDriver, 0),
    paidNet: txns.filter((t) => t.status === 'PAID').reduce((n, t) => n + t.netToDriver, 0),
    pendingNet: txns.filter((t) => t.status === 'PENDING').reduce((n, t) => n + t.netToDriver, 0),
    totalCommission: txns.reduce((n, t) => n + t.commissionAmount, 0),
    jobCount: txns.length,
    recent: txns.slice(0, 20).map((t) => ({
      jobId: t.jobId,
      grossAmount: t.grossAmount,
      netToDriver: t.netToDriver,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/** Gamified weekly progress: deliveries, earnings, streak, and rank — keeps
 *  drivers engaged (retention). Derived from the commission ledger; no new schema. */
export async function getIncentives(sub: string): Promise<DriverIncentivesResponse> {
  const driver = await prisma.driver.findUnique({ where: { userId: sub } });
  if (!driver) throw new HTTPException(403, { message: 'Not a driver' });

  const weeklyGoal = (await getSystemSettings()).driverWeeklyGoal;

  // Start of the current ISO week (Monday 00:00, server-local).
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  const fmtDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const streakWindow = new Date(now);
  streakWindow.setDate(now.getDate() - 30);

  const [weekTxns, recentDays, weekGroups] = await Promise.all([
    prisma.transaction.findMany({
      where: { driverId: driver.id, createdAt: { gte: weekStart } },
      select: { netToDriver: true },
    }),
    prisma.transaction.findMany({
      where: { driverId: driver.id, createdAt: { gte: streakWindow } },
      select: { createdAt: true },
    }),
    prisma.transaction.groupBy({
      by: ['driverId'],
      where: { createdAt: { gte: weekStart } },
      _sum: { netToDriver: true },
    }),
  ]);

  const weekDelivered = weekTxns.length;
  const weekEarnings = weekTxns.reduce((n, t) => n + t.netToDriver, 0);

  // Consecutive days (ending today, with one grace day) that have a delivery.
  const days = new Set(recentDays.map((t) => fmtDay(t.createdAt)));
  let streakDays = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(fmtDay(cursor))) cursor.setDate(cursor.getDate() - 1); // today may be in progress
  while (days.has(fmtDay(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Rank by this week's net earnings among drivers who earned anything.
  const ranking = weekGroups
    .map((g) => ({ driverId: g.driverId, sum: g._sum.netToDriver ?? 0 }))
    .sort((a, b) => b.sum - a.sum);
  const idx = ranking.findIndex((r) => r.driverId === driver.id);

  return {
    weekDelivered,
    weekEarnings,
    weeklyGoal,
    goalProgress: Math.min(1, weekDelivered / weeklyGoal),
    streakDays,
    rank: idx >= 0 ? idx + 1 : null,
    totalRanked: ranking.length,
  };
}
