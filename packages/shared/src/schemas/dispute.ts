import { z } from 'zod';
import { DisputeReasonSchema, DisputeStatusSchema } from '../enums';
import { PageQuery } from './pagination';

export const DisputeDto = z.object({
  id: z.string(),
  jobId: z.string(),
  raisedById: z.string().nullable(),
  reason: DisputeReasonSchema,
  detail: z.string().nullable(),
  status: DisputeStatusSchema,
  resolution: z.string().nullable(),
  resolvedById: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type DisputeDto = z.infer<typeof DisputeDto>;

// POST /jobs/:id/dispute (raised by the job's customer or driver) — and admin can log one too.
export const CreateDisputeInput = z.object({
  reason: DisputeReasonSchema,
  detail: z.string().max(1000).optional(),
});
export type CreateDisputeInput = z.infer<typeof CreateDisputeInput>;

// GET /admin/disputes
export const AdminListDisputesQuery = PageQuery.extend({
  status: DisputeStatusSchema.optional(),
});
export type AdminListDisputesQuery = z.infer<typeof AdminListDisputesQuery>;

// PATCH /admin/disputes/:id — resolve or reject; optionally refund the job's transaction.
export const AdminResolveDisputeInput = z.object({
  status: z.enum(['RESOLVED', 'REJECTED']),
  resolution: z.string().max(1000).optional(),
  refund: z.boolean().optional(), // if true, mark the job's transaction REFUNDED
});
export type AdminResolveDisputeInput = z.infer<typeof AdminResolveDisputeInput>;
