import { z } from 'zod';
import { PageQuery } from './pagination';

export const BlacklistDto = z.object({
  id: z.string(),
  nationalId: z.string().nullable(),
  plateNumber: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type BlacklistDto = z.infer<typeof BlacklistDto>;

export const AdminListBlacklistQuery = PageQuery.extend({
  search: z.string().trim().min(1).max(40).optional(), // nationalId or plate
});
export type AdminListBlacklistQuery = z.infer<typeof AdminListBlacklistQuery>;

export const AdminCreateBlacklistInput = z
  .object({
    nationalId: z.string().max(20).optional(),
    plateNumber: z.string().max(20).optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((d) => Boolean(d.nationalId ?? d.plateNumber), {
    message: 'Provide a national ID or a plate number',
  });
export type AdminCreateBlacklistInput = z.infer<typeof AdminCreateBlacklistInput>;
