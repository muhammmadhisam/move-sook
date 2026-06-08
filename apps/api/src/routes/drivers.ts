import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  ClaimDriverInput,
  DriverAvailabilityInput,
  DriverUpdateInput,
  UpdateDriverLocationInput,
  DRIVER_IN_HAND,
  USER_JWT_TTL_SEC,
  type DriverEarningsResponse,
  type DriverIncentivesResponse,
} from '@movesook/shared';
import { signJwt } from '@movesook/auth';
import { env } from '../config';
import type { AppEnv } from '../lib/context';
import { authenticate, requireRole } from '../middleware/auth';
import { setSessionCookie } from '../lib/cookies';
import { getSystemSettings } from '../lib/settings';
import { toDriverDto } from '../lib/serialize';
import { notify } from '../lib/notify';

export const driverRoutes = new Hono<AppEnv>()
  // A signed-in user claims an admin-created driver application via its invite code.
  // Links the pending (unlinked) Driver to this user and promotes them to DRIVER.
  .post('/claim', authenticate('user'), zValidator('json', ClaimDriverInput), async (c) => {
    const { sub } = c.get('claims');
    const code = c.req.valid('json').code.trim().toUpperCase();

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
    // Refresh the session cookie so the new DRIVER role takes effect immediately
    // (otherwise the JWT still says USER until the next login).
    const token = await signJwt({
      sub,
      role: 'DRIVER',
      secret: env.JWT_SECRET,
      ttlSec: USER_JWT_TTL_SEC,
    });
    setSessionCookie(c, env.USER_COOKIE_NAME, token, USER_JWT_TTL_SEC);
    return c.json(toDriverDto(linked.d, linked.displayName), 201);
  })

  // The driver's own record (prefills the edit form).
  .get('/me', authenticate('user'), requireRole('DRIVER'), async (c) => {
    const { sub } = c.get('claims');
    const driver = await prisma.driver.findUnique({
      where: { userId: sub },
      include: { user: { select: { displayName: true } } },
    });
    if (!driver) throw new HTTPException(403, { message: 'Not a driver' });
    return c.json(toDriverDto(driver, driver.user?.displayName ?? null));
  })

  // Driver fills in / edits their own application (admin creates the record first;
  // there is no public self-signup). Re-submitting moves a REJECTED app back to PENDING.
  .patch('/me', authenticate('user'), requireRole('DRIVER'), zValidator('json', DriverUpdateInput), async (c) => {
    const { sub } = c.get('claims');
    const input = c.req.valid('json');

    const driver = await prisma.driver.findUnique({ where: { userId: sub } });
    if (!driver) throw new HTTPException(403, { message: 'ยังไม่มีใบสมัครคนขับ (ติดต่อแอดมิน)' });

    const updated = await prisma.driver.update({
      where: { id: driver.id },
      data: {
        ...(input.vehicleType ? { vehicleType: input.vehicleType } : {}),
        ...(input.plateNumber !== undefined ? { plateNumber: input.plateNumber } : {}),
        ...(input.licenseTw2 !== undefined ? { licenseTw2: input.licenseTw2 } : {}),
        ...(input.serviceProvince ? { serviceProvince: input.serviceProvince } : {}),
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
    return c.json(toDriverDto(updated, user?.displayName ?? null));
  })

  // Driver toggles online/offline for the on-demand feed.
  .patch('/me/availability', authenticate('user'), requireRole('DRIVER'), zValidator('json', DriverAvailabilityInput), async (c) => {
    const { sub } = c.get('claims');
    const { isAvailable } = c.req.valid('json');
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
    return c.json({ id: updated.id, isAvailable: updated.isAvailable });
  })

  // Driver broadcasts their current GPS (throttled client-side) for live tracking.
  .patch('/me/location', authenticate('user'), requireRole('DRIVER'), zValidator('json', UpdateDriverLocationInput), async (c) => {
    const { sub } = c.get('claims');
    const { lat, lng } = c.req.valid('json');
    const driver = await prisma.driver.findUnique({ where: { userId: sub } });
    if (!driver) throw new HTTPException(403, { message: 'Not a driver' });
    const now = new Date();
    await prisma.driver.update({
      where: { id: driver.id },
      // A live ping also counts as activity (keeps the driver off the idle list).
      data: { lastLat: lat, lastLng: lng, locationAt: now, lastActiveAt: now },
    });
    return c.json({ ok: true });
  })

  // Driver's own earnings summary (from the commission ledger).
  .get('/me/earnings', authenticate('user'), requireRole('DRIVER'), async (c) => {
    const { sub } = c.get('claims');
    const driver = await prisma.driver.findUnique({ where: { userId: sub } });
    if (!driver) throw new HTTPException(403, { message: 'Not a driver' });

    const txns = await prisma.transaction.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const body: DriverEarningsResponse = {
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
    return c.json(body);
  })

  // Gamified weekly progress: deliveries, earnings, streak, and rank — keeps
  // drivers engaged (retention). Derived from the commission ledger; no new schema.
  .get('/me/incentives', authenticate('user'), requireRole('DRIVER'), async (c) => {
    const { sub } = c.get('claims');
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

    const body: DriverIncentivesResponse = {
      weekDelivered,
      weekEarnings,
      weeklyGoal,
      goalProgress: Math.min(1, weekDelivered / weeklyGoal),
      streakDays,
      rank: idx >= 0 ? idx + 1 : null,
      totalRanked: ranking.length,
    };
    return c.json(body);
  });
