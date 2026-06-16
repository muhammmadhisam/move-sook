import { z } from 'zod';
import { PaymentMethodSchema, TransactionStatusSchema } from '../enums';
import { PageQuery } from './pagination';

export const TransactionDto = z.object({
  id: z.string(),
  jobId: z.string(),
  driverId: z.string(),
  driverName: z.string().nullable(), // for the per-job driver-payout view
  driverCompletedCount: z.number().int(), // driver's lifetime delivered jobs
  grossAmount: z.number().int(),
  commissionPct: z.number(),
  commissionAmount: z.number().int(),
  netToDriver: z.number().int(),
  // PREPAID: platform owes the driver netToDriver (payout). COD: the driver already
  // collected the cash and paid commissionAmount up-front — no payout owed.
  paymentMethod: PaymentMethodSchema,
  status: TransactionStatusSchema,
  slipUrl: z.string().nullable(),
  customerPaidAt: z.string().datetime().nullable(), // when the customer's transfer was approved (auto)
  customerSlipUrl: z.string().nullable(), // the customer's transfer slip (from the payment gate)
  createdAt: z.string().datetime(),
});
export type TransactionDto = z.infer<typeof TransactionDto>;

// GET /admin/transactions
export const AdminListTransactionsQuery = PageQuery.extend({
  status: TransactionStatusSchema.optional(),
});
export type AdminListTransactionsQuery = z.infer<typeof AdminListTransactionsQuery>;

// PATCH /admin/transactions/:id  (mark paid / refunded, optionally attach a slip)
export const AdminUpdateTransactionInput = z.object({
  status: TransactionStatusSchema,
  slipUrl: z.string().max(500).nullable().optional(),
});
export type AdminUpdateTransactionInput = z.infer<typeof AdminUpdateTransactionInput>;

/** Pure commission split helper — single source of truth for the math. */
export function computeCommission(
  grossAmount: number,
  commissionPct: number,
): { commissionAmount: number; netToDriver: number } {
  const commissionAmount = Math.round((grossAmount * commissionPct) / 100);
  return { commissionAmount, netToDriver: grossAmount - commissionAmount };
}
