import { HTTPException } from 'hono/http-exception';
import { prisma, type Prisma } from '@movesook/db';
import {
  toDriverDto,
  toJobDto,
  pageArgs,
  orderByOf,
  writeAudit,
} from '@movesook/services/support';
import type {
  AdminListUsersQuery,
  AdminBanUserInput,
  AdminUserListItem,
  AdminUserDetailResponse,
  JobStatus,
  ReviewDto,
} from '@movesook/shared';

export type UserListResponse = {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** List users (optional text search over displayName / phone). */
export async function listUsers(q: AdminListUsersQuery): Promise<UserListResponse> {
  const where: Prisma.UserWhereInput = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.isBanned !== undefined ? { isBanned: q.isBanned } : {}),
    ...(q.search
      ? {
          OR: [
            { displayName: { contains: q.search, mode: 'insensitive' } },
            { phone: { contains: q.search } },
          ],
        }
      : {}),
  };
  const select = {
    id: true,
    displayName: true,
    role: true,
    isBanned: true,
    phone: true,
    createdAt: true,
  } as const;
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'displayName', 'role'], 'createdAt'),
      ...pageArgs(q),
      select,
    }),
    prisma.user.count({ where }),
  ]);
  const items: AdminUserListItem[] = rows.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}

/** Full user profile: driver record (if any), posted jobs, authored reviews. */
export async function getUserDetail(
  sub: string,
  id: string,
): Promise<AdminUserDetailResponse> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: { driver: { include: { user: { select: { displayName: true } } } } },
  });
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  await writeAudit({
    actorId: sub,
    action: 'pii.view',
    targetType: 'user',
    targetId: id,
  });

  const [jobsAsCustomer, reviewsAuthored, grouped] = await Promise.all([
    // Jobs this user owns (via their linked Customer record).
    prisma.job.findMany({
      where: { customer: { userId: id } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    // Reviews the user authored (Review.customerId references the User/reviewer).
    prisma.review.findMany({
      where: { customerId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.job.groupBy({
      by: ['status'],
      where: { customer: { userId: id } },
      _count: { _all: true },
    }),
  ]);

  const countFor = (s: JobStatus) =>
    grouped.filter((g) => g.status === s).reduce((n, g) => n + g._count._all, 0);

  const reviews: ReviewDto[] = reviewsAuthored.map((r) => ({
    id: r.id,
    jobId: r.jobId,
    customerId: r.customerId,
    driverId: r.driverId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    user: {
      id: user.id,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      phone: user.phone,
      role: user.role,
      isBanned: user.isBanned,
      anonymizedAt: user.anonymizedAt ? user.anonymizedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    },
    driver: user.driver ? toDriverDto(user.driver, user.driver.user?.displayName ?? null) : null,
    jobsAsCustomer: jobsAsCustomer.map(toJobDto),
    reviewsAuthored: reviews,
    counts: {
      jobsTotal: grouped.reduce((n, g) => n + g._count._all, 0),
      jobsDelivered: countFor('DELIVERED'),
      jobsCancelled: countFor('CANCELLED'),
    },
  };
}

/** Ban / unban a user. */
export async function banUser(
  sub: string,
  id: string,
  input: AdminBanUserInput,
): Promise<{ id: string; isBanned: boolean }> {
  const { isBanned } = input;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  if (user.role === 'ADMIN') throw new HTTPException(403, { message: 'Cannot ban an admin' });
  const updated = await prisma.user.update({ where: { id }, data: { isBanned } });
  await writeAudit({
    actorId: sub,
    action: isBanned ? 'user.ban' : 'user.unban',
    targetType: 'user',
    targetId: id,
    metadata: { isBanned },
  });
  return { id: updated.id, isBanned: updated.isBanned };
}
