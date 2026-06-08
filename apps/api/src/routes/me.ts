import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  ApplyReferralInput,
  ListNotificationsQuery,
  type MeResponse,
  type NotificationDto,
  type ReferralResponse,
} from '@movesook/shared';
import { REFERRAL_REWARD_THB } from '@movesook/shared';
import type { AppEnv } from '../lib/context';
import { authenticate } from '../middleware/auth';
import { ensureReferralCode } from '../lib/referral';

// GET /me — current user + role. Reads the USER cookie (LIFF audience).
export const meRoutes = new Hono<AppEnv>()
  .get('/', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const user = await prisma.user.findUnique({
      where: { id: sub },
      include: {
        driver: {
          select: {
            id: true,
            isAvailable: true,
            serviceProvince: true,
            verifyStatus: true,
            rejectionReason: true,
          },
        },
      },
    });
    if (!user) throw new HTTPException(404, { message: 'User not found' });

    const body: MeResponse = {
      id: user.id,
      role: user.role,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      phone: user.phone,
      isBanned: user.isBanned,
      isDriver: user.driver !== null,
      isAvailable: user.driver?.isAvailable ?? false,
      serviceProvince: user.driver?.serviceProvince ?? null,
      verifyStatus: user.driver?.verifyStatus ?? null,
      rejectionReason: user.driver?.rejectionReason ?? null,
    };
    return c.json(body);
  })

  // The customer's referral status + share code (generated lazily on first read).
  .get('/referral', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const customer = await prisma.customer.upsert({
      where: { userId: sub },
      create: { userId: sub },
      update: {},
    });
    const code = await ensureReferralCode(customer);
    const [referredCount, rewardedCount] = await Promise.all([
      prisma.customer.count({ where: { referredById: customer.id } }),
      prisma.customer.count({ where: { referredById: customer.id, referralRewardedAt: { not: null } } }),
    ]);
    const body: ReferralResponse = {
      code,
      referredCount,
      rewardedCount,
      rewardThb: REFERRAL_REWARD_THB,
      referredByApplied: customer.referredById !== null,
    };
    return c.json(body);
  })

  // Apply a friend's referral code (once). The reward fires when this customer's
  // first job is confirmed DELIVERED (see maybeIssueReferralReward).
  .post('/referral/apply', authenticate('user'), zValidator('json', ApplyReferralInput), async (c) => {
    const { sub } = c.get('claims');
    const code = c.req.valid('json').code.trim().toUpperCase();

    const me = await prisma.customer.upsert({
      where: { userId: sub },
      create: { userId: sub },
      update: {},
    });
    if (me.referredById) throw new HTTPException(409, { message: 'คุณใช้โค้ดแนะนำไปแล้ว' });

    const referrer = await prisma.customer.findUnique({ where: { referralCode: code } });
    if (!referrer) throw new HTTPException(404, { message: 'ไม่พบโค้ดแนะนำนี้' });
    if (referrer.id === me.id) throw new HTTPException(400, { message: 'ใช้โค้ดของตัวเองไม่ได้' });

    await prisma.customer.update({ where: { id: me.id }, data: { referredById: referrer.id } });

    const myCode = await ensureReferralCode(me);
    const body: ReferralResponse = {
      code: myCode,
      referredCount: 0,
      rewardedCount: 0,
      rewardThb: REFERRAL_REWARD_THB,
      referredByApplied: true,
    };
    return c.json(body, 201);
  })

  // List the current user's notifications.
  .get('/notifications', authenticate('user'), zValidator('query', ListNotificationsQuery), async (c) => {
    const { sub } = c.get('claims');
    const q = c.req.valid('query');
    const rows = await prisma.notification.findMany({
      where: { userId: sub, ...(q.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.take;
    const items: NotificationDto[] = (hasMore ? rows.slice(0, q.take) : rows).map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      jobId: n.jobId,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    }));
    return c.json({ items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null });
  })

  // Count of unread notifications (for a badge).
  .get('/notifications/unread-count', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const count = await prisma.notification.count({ where: { userId: sub, readAt: null } });
    return c.json({ count });
  })

  // Mark one notification read.
  .post('/notifications/:id/read', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const id = c.req.param('id');
    const result = await prisma.notification.updateMany({
      where: { id, userId: sub, readAt: null },
      data: { readAt: new Date() },
    });
    return c.json({ updated: result.count });
  })

  // Mark all read.
  .post('/notifications/read-all', authenticate('user'), async (c) => {
    const { sub } = c.get('claims');
    const result = await prisma.notification.updateMany({
      where: { userId: sub, readAt: null },
      data: { readAt: new Date() },
    });
    return c.json({ updated: result.count });
  });
