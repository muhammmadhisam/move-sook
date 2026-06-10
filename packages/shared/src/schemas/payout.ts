import { z } from 'zod';
import { PayoutStatusSchema } from '../enums';
import { PageQuery } from './pagination';

export const PayoutDto = z.object({
  id: z.string(),
  driverId: z.string(),
  driverName: z.string().nullable(),
  driverCompletedCount: z.number().int(), // driver's lifetime delivered (completed) jobs
  amount: z.number().int(), // sum of netToDriver across bundled transactions
  commissionTotal: z.number().int(), // sum of commission across bundled transactions
  status: PayoutStatusSchema,
  reference: z.string().nullable(),
  slipUrl: z.string().nullable().optional(), // uploaded bank-transfer slip
  transactionCount: z.number().int(),
  jobIds: z.array(z.string()), // jobs included in this payout round
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type PayoutDto = z.infer<typeof PayoutDto>;

// GET /admin/payouts
export const AdminListPayoutsQuery = PageQuery.extend({
  driverId: z.string().optional(),
  status: PayoutStatusSchema.optional(),
});
export type AdminListPayoutsQuery = z.infer<typeof AdminListPayoutsQuery>;

// POST /admin/payouts — bundle a driver's unpaid (PENDING) commission entries into one run.
export const AdminCreatePayoutInput = z.object({
  driverId: z.string(),
});
export type AdminCreatePayoutInput = z.infer<typeof AdminCreatePayoutInput>;

// PATCH /admin/payouts/:id — mark a run as paid (flips its transactions to PAID).
export const AdminMarkPayoutPaidInput = z.object({
  reference: z.string().max(200).optional(),
  slipUrl: z.string().url().optional(), // bank-transfer slip image
});
export type AdminMarkPayoutPaidInput = z.infer<typeof AdminMarkPayoutPaidInput>;

// Driver bank info (admin edits on the driver profile).
export const AdminUpdateDriverBankInput = z.object({
  bankName: z.string().max(100).nullable().optional(),
  bankAccountName: z.string().max(120).nullable().optional(),
  bankAccountNo: z.string().max(40).nullable().optional(),
});
export type AdminUpdateDriverBankInput = z.infer<typeof AdminUpdateDriverBankInput>;
