import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  REFERRAL_REWARD_THB,
  type ListNotificationsQuery,
  type MeResponse,
  type NotificationDto,
  type ReferralResponse,
} from '@movesook/shared';
import { ensureReferralCode } from '../support';

// USER/DRIVER session, profile, referral, and in-app notifications.
// HTTP routing lives in apps/api/src/routes/me.ts — these functions take the
// authenticated user id (`sub`) plus validated input and return wire DTOs.

/** Current user + role (reads the USER cookie audience). */
export async function getMe(sub: string): Promise<MeResponse> {
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

  return {
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
}

/** The customer's referral status + share code (generated lazily on first read). */
export async function getReferral(sub: string): Promise<ReferralResponse> {
  const customer = await prisma.customer.upsert({
    where: { userId: sub },
    create: { userId: sub },
    update: {},
  });
  const code = await ensureReferralCode(customer);
  const [referredCount, rewardedCount] = await Promise.all([
    prisma.customer.count({ where: { referredById: customer.id } }),
    prisma.customer.count({
      where: { referredById: customer.id, referralRewardedAt: { not: null } },
    }),
  ]);
  return {
    code,
    referredCount,
    rewardedCount,
    rewardThb: REFERRAL_REWARD_THB,
    referredByApplied: customer.referredById !== null,
  };
}

/** Apply a friend's referral code (once). The reward fires when this customer's
 *  first job is confirmed DELIVERED (see maybeIssueReferralReward). */
export async function applyReferral(sub: string, rawCode: string): Promise<ReferralResponse> {
  const code = rawCode.trim().toUpperCase();

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
  return {
    code: myCode,
    referredCount: 0,
    rewardedCount: 0,
    rewardThb: REFERRAL_REWARD_THB,
    referredByApplied: true,
  };
}

export type NotificationListResponse = {
  items: NotificationDto[];
  nextCursor: string | null;
};

/** Paginated list of the user's notifications (cursor-based). */
export async function listNotifications(
  sub: string,
  q: ListNotificationsQuery,
): Promise<NotificationListResponse> {
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
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

/** Count of unread notifications (for a badge). */
export async function countUnreadNotifications(sub: string): Promise<{ count: number }> {
  const count = await prisma.notification.count({ where: { userId: sub, readAt: null } });
  return { count };
}

/** Mark one notification read. Returns how many rows changed (0 if not owned/already read). */
export async function markNotificationRead(
  sub: string,
  id: string,
): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { id, userId: sub, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

/** Mark all of the user's notifications read. */
export async function markAllNotificationsRead(sub: string): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId: sub, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
