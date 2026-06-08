import { z } from 'zod';

// Shared offset-pagination + sort query base for admin list endpoints.
// Each list schema does `PageQuery.extend({ ...its filters })`; the handler
// validates `sortBy` against an allow-list (so it can't inject arbitrary columns).
export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(40).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PageQuery = z.infer<typeof PageQuery>;

/** Generic paged-list envelope returned by admin list endpoints. */
export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
