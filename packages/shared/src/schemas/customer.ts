import { z } from 'zod';

// A customer (job owner) — may be linked to an app User (self-serve) or be an
// offline customer an admin entered manually (userId null).
export const CustomerDto = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  tags: z.array(z.string()),
  referralCode: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type CustomerDto = z.infer<typeof CustomerDto>;

// PATCH /admin/customers/:id — edit CRM fields (tags).
export const AdminUpdateCustomerInput = z.object({
  tags: z.array(z.string().min(1).max(40)).max(20),
});
export type AdminUpdateCustomerInput = z.infer<typeof AdminUpdateCustomerInput>;

// CRM contact-history note.
export const CustomerNoteDto = z.object({
  id: z.string(),
  body: z.string(),
  authorName: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type CustomerNoteDto = z.infer<typeof CustomerNoteDto>;

export const AddCustomerNoteInput = z.object({
  body: z.string().min(1).max(2000),
});
export type AddCustomerNoteInput = z.infer<typeof AddCustomerNoteInput>;
