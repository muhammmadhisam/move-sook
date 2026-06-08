// Offset-pagination + safe sort helpers for admin list endpoints.

/** Prisma `skip`/`take` from a 1-based page + pageSize. */
export function pageArgs(q: { page: number; pageSize: number }): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

/**
 * Build a single-column Prisma `orderBy`, constrained to an allow-list so a
 * client can't sort by (or inject) an arbitrary column. Falls back to `fallback`.
 */
export function orderByOf(
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc',
  allowed: readonly string[],
  fallback: string,
): Record<string, 'asc' | 'desc'> {
  const col = sortBy && allowed.includes(sortBy) ? sortBy : fallback;
  return { [col]: sortDir };
}
