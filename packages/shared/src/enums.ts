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
  'FLAGGED_ILLEGAL',
  'CANCELLED',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

// Customer-declared cargo category. Drives the prohibited-items policy gate:
// RESTRICTED categories warn the customer they need supporting documents and
// give the driver context to decide whether to flag the load.
export const CargoCategorySchema = z.enum([
  'GENERAL', // ของใช้ทั่วไป / เฟอร์นิเจอร์
  'APPLIANCES', // เครื่องใช้ไฟฟ้า
  'FRAGILE', // ของแตกหักง่าย
  'DOCUMENTS', // เอกสาร
  'FOOD', // อาหาร/ของสด
  'PLANTS', // ต้นไม้
  'VALUABLES', // ของมีค่าสูง (ทอง/เพชร) — restricted
  'ALCOHOL_TOBACCO', // สุรา/บุหรี่ — restricted (ต้องมีใบอนุญาต/ใบกำกับภาษี)
  'MEDICINE', // ยา/เวชภัณฑ์ — restricted
  'CHEMICALS', // วัตถุอันตราย/เคมี — restricted
  'OTHER',
]);
export type CargoCategory = z.infer<typeof CargoCategorySchema>;

// Vehicle type is an admin-managed catalog (see VehiclePricing), not a fixed enum:
// new types can be added at runtime, so the value is a free-form slug rather than a
// closed union. VehicleTypeSchema validates the *reference* (any non-empty slug);
// VehicleTypeSlugSchema validates a *new* slug an admin coins (uppercase A–Z, 0–9, _).
export const VehicleTypeSchema = z.string().min(1).max(40);
export type VehicleType = z.infer<typeof VehicleTypeSchema>;

export const VehicleTypeSlugSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,39}$/, 'รหัสประเภทรถต้องขึ้นต้นด้วย A-Z และมีได้เฉพาะ A-Z, 0-9, _');
export type VehicleTypeSlug = z.infer<typeof VehicleTypeSlugSchema>;

export const GenderSchema = z.enum(['MALE', 'FEMALE', 'OTHER']);
export type Gender = z.infer<typeof GenderSchema>;

export const AddrChangeStatusSchema = z.enum([
  'NONE',
  'REQUESTED',
  'APPROVED_AWAITING_PAYMENT',
  'PENDING_REVIEW',
  'COMPLETED',
  'REJECTED',
]);
export type AddrChangeStatus = z.infer<typeof AddrChangeStatusSchema>;

export const DriverVerifyStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']);
export type DriverVerifyStatus = z.infer<typeof DriverVerifyStatusSchema>;

export const TransactionStatusSchema = z.enum(['PENDING', 'PAID', 'REFUNDED']);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;

// How a job is settled. PREPAID = customer transfers the full amount up-front to the
// platform (default flow). COD = cash on delivery: the customer pays the driver at the
// destination and the driver transfers the commission ("ค่าธรรมเนียม") to the platform
// before starting the job.
export const PaymentMethodSchema = z.enum(['PREPAID', 'COD']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

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

export const BlogStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);
export type BlogStatus = z.infer<typeof BlogStatusSchema>;

export const LedgerEntryTypeSchema = z.enum(['INCOME', 'EXPENSE']);
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>;
