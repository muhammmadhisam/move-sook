import { z } from 'zod';

// Zod enums are the validation source of truth for the API boundary.
// Values are kept identical to the Prisma enums in @movesook/db so the two
// map 1:1 without conversion.

export const RoleSchema = z.enum(['USER', 'DRIVER', 'ADMIN', 'SYSTEM']);
export type Role = z.infer<typeof RoleSchema>;

export const JobStatusSchema = z.enum([
  'DRAFT',
  'PENDING_PAYMENT',
  'POSTED',
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'PENDING_CONFIRMATION',
  'DELIVERED',
  'CANCELLED',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const VehicleTypeSchema = z.enum(['MOTORCYCLE', 'PICKUP', 'TRUCK_4W', 'TRUCK_6W']);
export type VehicleType = z.infer<typeof VehicleTypeSchema>;

export const DriverVerifyStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']);
export type DriverVerifyStatus = z.infer<typeof DriverVerifyStatusSchema>;

export const TransactionStatusSchema = z.enum(['PENDING', 'PAID', 'REFUNDED']);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

export const AdminRoleSchema = z.enum(['SUPER', 'OPS', 'FINANCE']);
export type AdminRole = z.infer<typeof AdminRoleSchema>;

export const NotificationTypeSchema = z.enum([
  'JOB_ASSIGNED',
  'JOB_NEW_IN_AREA',
  'JOB_STATUS',
  'DRIVER_VERIFY',
  'DISPUTE',
  'GENERIC',
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const DisputeStatusSchema = z.enum(['OPEN', 'RESOLVED', 'REJECTED']);
export type DisputeStatus = z.infer<typeof DisputeStatusSchema>;

export const DisputeReasonSchema = z.enum([
  'ITEM_DAMAGED',
  'DRIVER_NO_SHOW',
  'LATE',
  'OVERCHARGED',
  'OTHER',
]);
export type DisputeReason = z.infer<typeof DisputeReasonSchema>;

export const PayoutStatusSchema = z.enum(['PENDING', 'PAID']);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

export const ConsentTypeSchema = z.enum(['TERMS', 'PRIVACY', 'MARKETING', 'DRIVER_AGREEMENT']);
export type ConsentType = z.infer<typeof ConsentTypeSchema>;

export const PromoTypeSchema = z.enum(['PERCENT', 'FIXED']);
export type PromoType = z.infer<typeof PromoTypeSchema>;

export const PricingModeSchema = z.enum(['CHARTER', 'PER_ITEM']);
export type PricingMode = z.infer<typeof PricingModeSchema>;
