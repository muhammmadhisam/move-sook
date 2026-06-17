import { z } from 'zod';
import { DriverVerifyStatusSchema, RoleSchema } from '../enums';

// POST /auth/line
export const LineLoginInput = z.object({
  idToken: z.string().min(10),
});
export type LineLoginInput = z.infer<typeof LineLoginInput>;

// POST /auth/admin/login
export const AdminLoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type AdminLoginInput = z.infer<typeof AdminLoginInput>;

// POST /auth/dev/login — DEV ONLY. Bypasses LINE to mint a USER/DRIVER session
// for local testing. The API rejects this with 403 in production.
export const DevLoginInput = z.object({
  role: z.enum(['USER', 'DRIVER']).default('USER'),
  lineUserId: z.string().min(1).optional(), // stable id to reuse the same mock; defaults per role
  displayName: z.string().max(60).optional(),
  serviceProvince: z.string().min(1).optional(), // DRIVER service area (default สงขลา)
});
export type DevLoginInput = z.infer<typeof DevLoginInput>;

// GET /me response
export const MeResponse = z.object({
  id: z.string(),
  role: RoleSchema,
  displayName: z.string().nullable(),
  pictureUrl: z.string().nullable(),
  phone: z.string().nullable(),
  isBanned: z.boolean(),
  isDriver: z.boolean(),
  isAvailable: z.boolean(), // driver online/offline; false for non-drivers
  serviceProvince: z.string().nullable(), // driver service area
  verifyStatus: DriverVerifyStatusSchema.nullable(), // driver verification; null for non-drivers
  rejectionReason: z.string().nullable(), // admin note when REJECTED/SUSPENDED
});
export type MeResponse = z.infer<typeof MeResponse>;

/** Decoded JWT claims embedded in both user & admin cookies. */
export const JwtClaims = z.object({
  sub: z.string(), // User.id
  role: RoleSchema,
  aud: z.union([z.string(), z.array(z.string())]).optional(), // session audience ('user' | 'admin')
  iat: z.number().optional(),
  exp: z.number().optional(),
});
export type JwtClaims = z.infer<typeof JwtClaims>;
