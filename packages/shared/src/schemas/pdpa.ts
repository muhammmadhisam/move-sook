import { z } from 'zod';
import { ConsentTypeSchema } from '../enums';

export const ConsentDto = z.object({
  id: z.string(),
  type: ConsentTypeSchema,
  version: z.string(),
  granted: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ConsentDto = z.infer<typeof ConsentDto>;

// Record a consent decision (admin on behalf, or user via app).
export const RecordConsentInput = z.object({
  type: ConsentTypeSchema,
  version: z.string().min(1).max(40),
  granted: z.boolean(),
});
export type RecordConsentInput = z.infer<typeof RecordConsentInput>;

// GET /admin/users/:id/export — PDPA data-subject access bundle.
export const UserDataExport = z.object({
  user: z.record(z.string(), z.unknown()),
  customer: z.record(z.string(), z.unknown()).nullable(),
  driver: z.record(z.string(), z.unknown()).nullable(),
  jobs: z.array(z.record(z.string(), z.unknown())),
  reviews: z.array(z.record(z.string(), z.unknown())),
  consents: z.array(ConsentDto),
  exportedAt: z.string().datetime(),
});
export type UserDataExport = z.infer<typeof UserDataExport>;
