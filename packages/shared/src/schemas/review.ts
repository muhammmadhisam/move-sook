import { z } from 'zod';

// POST /jobs/:id/review  (USER rates the driver after DELIVERED)
export const CreateReviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof CreateReviewInput>;

export const ReviewDto = z.object({
  id: z.string(),
  jobId: z.string(),
  customerId: z.string(),
  driverId: z.string(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type ReviewDto = z.infer<typeof ReviewDto>;
