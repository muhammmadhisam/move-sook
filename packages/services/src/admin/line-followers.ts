import { prisma, type Prisma } from '@movesook/db';
import { pageArgs, orderByOf } from '@movesook/services/support';
import type {
  AdminListLineFollowersQuery,
  AdminLineFollowerListItem,
  Paged,
} from '@movesook/shared';

/**
 * List LINE-linked accounts and their OA follow state (set by the webhook
 * follow/unfollow events). Only users with a lineUserId are "followable", so the
 * list is scoped to those — admin-only accounts without LINE never appear.
 */
export async function listLineFollowers(
  q: AdminListLineFollowersQuery,
): Promise<Paged<AdminLineFollowerListItem>> {
  const where: Prisma.UserWhereInput = {
    lineUserId: { not: null },
    ...(q.following !== undefined ? { lineFollowing: q.following } : {}),
    ...(q.search ? { displayName: { contains: q.search, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: orderByOf(
        q.sortBy,
        q.sortDir,
        ['createdAt', 'displayName', 'lineFollowedAt'],
        'lineFollowedAt',
      ),
      ...pageArgs(q),
      select: {
        id: true,
        displayName: true,
        role: true,
        lineFollowing: true,
        lineFollowedAt: true,
        lineUnfollowedAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);
  const items: AdminLineFollowerListItem[] = rows.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    role: u.role,
    lineFollowing: u.lineFollowing,
    lineFollowedAt: u.lineFollowedAt ? u.lineFollowedAt.toISOString() : null,
    lineUnfollowedAt: u.lineUnfollowedAt ? u.lineUnfollowedAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}
