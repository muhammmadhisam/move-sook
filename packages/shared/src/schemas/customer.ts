import { z } from 'zod';
import { GenderSchema } from '../enums';

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

// ── Self-serve customer profile ──────────────────────────────────────────────
// GET /me/profile — the customer's own editable profile. All fields optional.
export const CustomerProfileDto = z.object({
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  gender: GenderSchema.nullable(),
  birthDate: z.string().nullable(), // YYYY-MM-DD
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
});
export type CustomerProfileDto = z.infer<typeof CustomerProfileDto>;

// PATCH /me/profile — the customer updates their own profile. Every field is
// optional (nothing is required); send `null` to clear a value, omit to leave
// it untouched.
export const UpdateCustomerProfileInput = z.object({
  firstName: z.string().trim().max(80).nullish(),
  lastName: z.string().trim().max(80).nullish(),
  gender: GenderSchema.nullish(),
  birthDate: z.string().date().nullish(), // YYYY-MM-DD; server coerces to Date
  email: z.string().trim().email().max(120).nullish(),
  phone: z.string().trim().min(6).max(20).nullish(),
  address: z.string().trim().max(300).nullish(),
});
export type UpdateCustomerProfileInput = z.infer<typeof UpdateCustomerProfileInput>;

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
