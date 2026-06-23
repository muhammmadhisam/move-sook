import { z } from 'zod';
import { VehicleTypeSchema, VehicleTypeSlugSchema } from '../enums';
import { ProvinceNameSchema } from './province';

// ── Service areas (which provinces the platform serves) ──────────────────────
export const ServiceAreaDto = z.object({
  province: z.string(),
  isActive: z.boolean(),
});
export type ServiceAreaDto = z.infer<typeof ServiceAreaDto>;

export const AdminSetServiceAreaInput = z.object({
  province: ProvinceNameSchema,
  isActive: z.boolean(),
});
export type AdminSetServiceAreaInput = z.infer<typeof AdminSetServiceAreaInput>;

// ── Vehicle-type config: join criteria/specs + per-type rate ──────────────────
export const VehiclePricingDto = z.object({
  vehicleType: VehicleTypeSchema,
  label: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageUrls: z.array(z.string()), // แกลเลอรีรูปตัวอย่างเพิ่มเติม
  requirements: z.string().nullable(),
  maxWeightKg: z.number().int().nullable(),
  pricePerKm: z.number().int().nullable(), // เหมาลำ per-km rate
  pricePerKmShared: z.number().int().nullable(), // ไม่เหมาลำ (PER_ITEM) per-km rate
  flatRate: z.number().int().nullable(), // เหมาลำ per-vehicle fee
  perItemRate: z.number().int().nullable(), // หลายสินค้า per-item fee
  maxActiveJobs: z.number().int().nullable(), // concurrent in-hand cap (null = global max_active_jobs_per_driver)
  isActive: z.boolean(),
});
export type VehiclePricingDto = z.infer<typeof VehiclePricingDto>;

/** Slim public view of an active vehicle type's rates (marketing /pricing page). */
export const PublicVehicleRate = z.object({
  vehicleType: VehicleTypeSchema,
  label: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  imageUrls: z.array(z.string()), // แกลเลอรีรูปตัวอย่างเพิ่มเติม (โชว์ให้ลูกค้าเห็น)
  pricePerKm: z.number().int().nullable(),
  pricePerKmShared: z.number().int().nullable(),
});
export type PublicVehicleRate = z.infer<typeof PublicVehicleRate>;

export const AdminUpsertVehiclePricingInput = z.object({
  // Slug-validated: an admin coining a new type must use a clean UPPER_SNAKE slug.
  vehicleType: VehicleTypeSlugSchema,
  label: z.string().max(80).nullable().optional(),
  description: z.string().max(300).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  imageUrls: z.array(z.string().url()).max(10).optional(), // แกลเลอรีรูปตัวอย่างเพิ่มเติม (สูงสุด 10)
  requirements: z.string().max(500).nullable().optional(),
  maxWeightKg: z.number().int().min(0).max(100000).nullable().optional(),
  pricePerKm: z.number().int().min(0).max(100000).nullable().optional(),
  pricePerKmShared: z.number().int().min(0).max(100000).nullable().optional(),
  flatRate: z.number().int().min(0).max(1000000).nullable().optional(),
  perItemRate: z.number().int().min(0).max(1000000).nullable().optional(),
  maxActiveJobs: z.number().int().min(1).max(100).nullable().optional(),
  isActive: z.boolean(),
});
export type AdminUpsertVehiclePricingInput = z.infer<typeof AdminUpsertVehiclePricingInput>;

// ── Misc system settings (AppSetting-backed scalars) ──────────────────────────
export const SystemSettingsResponse = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string(),
  minJobPrice: z.number().int().min(0),
  maxJobPrice: z.number().int().min(0),
  cancellationFee: z.number().int().min(0),
  addressChangeFee: z.number().int().min(0), // flat base fee for a destination-change request
  freeCancelMinutes: z.number().int().min(0),
  maxActiveJobsPerDriver: z.number().int().min(0),
  maxScheduleDays: z.number().int().min(0),
  minDistanceKm: z.number().int().min(0),
  maxDistanceKm: z.number().int().min(0),
  verifySlaHours: z.number().int().min(1),
  idleNudgeDays: z.number().int().min(1),
  pendingPaymentExpireDays: z.number().int().min(0), // 0 = never auto-expire
  referralRewardThb: z.number().int().min(0),
  driverWeeklyGoal: z.number().int().min(1),
  // ── COD (cash-on-delivery / เก็บเงินปลายทาง) ──
  codEnabled: z.boolean(), // master switch: offer COD as a payment option to customers
  codMinPrice: z.number().int().min(0), // job price floor to allow COD (0 = no floor)
  codMaxPrice: z.number().int().min(0), // job price ceiling to allow COD (0 = no ceiling)
  supportPhone: z.string(),
  supportLineId: z.string(),
  supportEmail: z.string(),
  payBankName: z.string(),
  payAccountName: z.string(),
  payAccountNumber: z.string(),
  payQrUrl: z.string(),
  companyName: z.string(),
  companyAddress: z.string(),
  companyTaxId: z.string(),
  companyLogoUrl: z.string(),
  termsVersion: z.string(),
  privacyVersion: z.string(),
  prohibitedItemsList: z.string(), // banned cargo, one item per line ('' = use default list)
  adminLineGroupId: z.string(), // LINE group/room/user ID for ops push alerts ('' = disabled)
  deliveryGeofenceMeters: z.number().int().min(0), // radius (m) to mark a delivery done (0 = no geofence)
});
export type SystemSettingsResponse = z.infer<typeof SystemSettingsResponse>;

export const UpdateSystemSettingsInput = z.object({
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(300).optional(),
  minJobPrice: z.number().int().min(0).max(10_000_000).optional(),
  maxJobPrice: z.number().int().min(0).max(10_000_000).optional(),
  cancellationFee: z.number().int().min(0).max(1_000_000).optional(),
  addressChangeFee: z.number().int().min(0).max(1_000_000).optional(),
  freeCancelMinutes: z.number().int().min(0).max(10_000).optional(),
  maxActiveJobsPerDriver: z.number().int().min(0).max(100).optional(),
  maxScheduleDays: z.number().int().min(0).max(365).optional(),
  minDistanceKm: z.number().int().min(0).max(10_000).optional(),
  maxDistanceKm: z.number().int().min(0).max(10_000).optional(),
  verifySlaHours: z.number().int().min(1).max(720).optional(),
  idleNudgeDays: z.number().int().min(1).max(365).optional(),
  pendingPaymentExpireDays: z.number().int().min(0).max(365).optional(),
  referralRewardThb: z.number().int().min(0).max(100_000).optional(),
  driverWeeklyGoal: z.number().int().min(1).max(1000).optional(),
  codEnabled: z.boolean().optional(),
  codMinPrice: z.number().int().min(0).max(10_000_000).optional(),
  codMaxPrice: z.number().int().min(0).max(10_000_000).optional(),
  supportPhone: z.string().max(40).optional(),
  supportLineId: z.string().max(80).optional(),
  supportEmail: z.string().max(120).optional(),
  payBankName: z.string().max(80).optional(),
  payAccountName: z.string().max(120).optional(),
  payAccountNumber: z.string().max(40).optional(),
  payQrUrl: z.string().max(500).optional(),
  companyName: z.string().max(120).optional(),
  companyAddress: z.string().max(300).optional(),
  companyTaxId: z.string().max(40).optional(),
  companyLogoUrl: z.string().max(500).optional(),
  termsVersion: z.string().min(1).max(40).optional(),
  privacyVersion: z.string().min(1).max(40).optional(),
  prohibitedItemsList: z.string().max(5000).optional(),
  adminLineGroupId: z.string().max(120).optional(),
  deliveryGeofenceMeters: z.number().int().min(0).max(50_000).optional(),
});
export type UpdateSystemSettingsInput = z.infer<typeof UpdateSystemSettingsInput>;

// GET /system/public — non-auth subset the apps read (maintenance banner + support contact).
export const PublicSystemConfig = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string(),
  supportPhone: z.string(),
  supportLineId: z.string(),
  supportEmail: z.string(),
  payBankName: z.string(),
  payAccountName: z.string(),
  payAccountNumber: z.string(),
  payQrUrl: z.string(),
  baseFare: z.number().int().min(0), // flat starting fare added to every quote before per-km (shown on the marketing pricing page)
  addressChangeFee: z.number().int().min(0), // flat base fee for a destination-change request (client previews the total)
  prohibitedItems: z.array(z.string()), // resolved banned-cargo list shown on the posting form
  // COD availability — the posting form offers the COD option only when enabled and
  // the quoted price falls within [codMinPrice, codMaxPrice] (0 = unbounded on that side).
  codEnabled: z.boolean(),
  codMinPrice: z.number().int().min(0),
  codMaxPrice: z.number().int().min(0),
  commissionPct: z.number().min(0).max(100), // current platform commission rate (display on marketing pages)
  deliveryGeofenceMeters: z.number().int().min(0), // driver geofence (m) for marking a delivery done (0 = off); drives the driver UI gate
});
export type PublicSystemConfig = z.infer<typeof PublicSystemConfig>;
