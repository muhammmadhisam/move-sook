import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import {
  REFERRAL_REWARD_THB,
  type CustomerProfileDto,
  type ListNotificationsQuery,
  type MeResponse,
  type NotificationDto,
  type ReferralResponse,
  type UpdateCustomerProfileInput,
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

/** Serialise a Customer row into the self-serve profile DTO. */
function toCustomerProfileDto(c: {
  firstName: string | null;
  lastName: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  birthDate: Date | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}): CustomerProfileDto {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    gender: c.gender,
    birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
    email: c.email,
    phone: c.phone,
    address: c.address,
  };
}

const CUSTOMER_PROFILE_SELECT = {
  firstName: true,
  lastName: true,
  gender: true,
  birthDate: true,
  email: true,
  phone: true,
  address: true,
} as const;

/** The customer's own editable profile (Customer row created lazily on first read). */
export async function getProfile(sub: string): Promise<CustomerProfileDto> {
  const customer = await prisma.customer.upsert({
    where: { userId: sub },
    create: { userId: sub },
    update: {},
    select: CUSTOMER_PROFILE_SELECT,
  });
  return toCustomerProfileDto(customer);
}

/** Update the customer's own profile. Keys present in `input` are written
 *  (null clears the value); omitted keys are left untouched. `name` is kept in
 *  sync from first/last name so job + admin CRM display stays coherent. */
export async function updateProfile(
  sub: string,
  input: UpdateCustomerProfileInput,
): Promise<CustomerProfileDto> {
  // Build the patch from only the keys the client actually sent.
  const data: Record<string, unknown> = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.gender !== undefined) data.gender = input.gender;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.address !== undefined) data.address = input.address;
  if (input.birthDate !== undefined) {
    data.birthDate = input.birthDate ? new Date(input.birthDate) : null;
  }

  // Ensure the Customer row exists, then patch it.
  const existing = await prisma.customer.upsert({
    where: { userId: sub },
    create: { userId: sub },
    update: {},
    select: { id: true, firstName: true, lastName: true },
  });

  // Keep the display `name` in sync with first/last name when either changes.
  const firstName = (data.firstName as string | null | undefined) ?? existing.firstName;
  const lastName = (data.lastName as string | null | undefined) ?? existing.lastName;
  if ('firstName' in data || 'lastName' in data) {
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) data.name = fullName;
  }

  const updated = await prisma.customer.update({
    where: { id: existing.id },
    data,
    select: CUSTOMER_PROFILE_SELECT,
  });
  return toCustomerProfileDto(updated);
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
