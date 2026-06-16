import { z } from 'zod';
import { LedgerEntryTypeSchema } from '../enums';
import { PageQuery } from './pagination';

/** A receipt image or document attached to a ledger entry. */
export const LedgerAttachmentDto = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  mimeType: z.string(),
});
export type LedgerAttachmentDto = z.infer<typeof LedgerAttachmentDto>;

/** Admin wire DTO for one income/expense entry. */
export const LedgerEntryDto = z.object({
  id: z.string(),
  type: LedgerEntryTypeSchema,
  category: z.string(),
  title: z.string(),
  amount: z.number().int(), // THB, always positive; sign implied by `type`
  note: z.string().nullable(),
  occurredAt: z.string().datetime(),
  createdById: z.string(),
  createdByName: z.string().nullable(),
  attachments: z.array(LedgerAttachmentDto),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LedgerEntryDto = z.infer<typeof LedgerEntryDto>;

// GET /admin/ledger — filter by type, category, and date range.
export const AdminListLedgerQuery = PageQuery.extend({
  type: LedgerEntryTypeSchema.optional(),
  category: z.string().optional(),
  from: z.string().datetime().optional(), // occurredAt >= from
  to: z.string().datetime().optional(), // occurredAt <= to
});
export type AdminListLedgerQuery = z.infer<typeof AdminListLedgerQuery>;

// Attachment payload on create/update — already-uploaded files (URL + meta).
const LedgerAttachmentInput = z.object({
  url: z.string().url().max(500),
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
});

export const AdminCreateLedgerInput = z.object({
  type: LedgerEntryTypeSchema,
  category: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  amount: z.number().int().positive(),
  note: z.string().max(2000).nullable().optional(),
  occurredAt: z.string().datetime(),
  attachments: z.array(LedgerAttachmentInput).max(20).optional(),
});
export type AdminCreateLedgerInput = z.infer<typeof AdminCreateLedgerInput>;

export const AdminUpdateLedgerInput = z.object({
  type: LedgerEntryTypeSchema.optional(),
  category: z.string().min(1).max(80).optional(),
  title: z.string().min(1).max(200).optional(),
  amount: z.number().int().positive().optional(),
  note: z.string().max(2000).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
  // When present, replaces the full attachment set for the entry.
  attachments: z.array(LedgerAttachmentInput).max(20).optional(),
});
export type AdminUpdateLedgerInput = z.infer<typeof AdminUpdateLedgerInput>;

/** Totals for the current filter — income, expense, and net balance (THB). */
export const LedgerSummaryResponse = z.object({
  income: z.number().int(),
  expense: z.number().int(),
  net: z.number().int(),
});
export type LedgerSummaryResponse = z.infer<typeof LedgerSummaryResponse>;
