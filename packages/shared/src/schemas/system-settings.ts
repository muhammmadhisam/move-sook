import { z } from 'zod';
import { VehicleTypeSchema } from '../enums';
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
  requirements: z.string().nullable(),
  maxWeightKg: z.number().int().nullable(),
  pricePerKm: z.number().int().nullable(),
  flatRate: z.number().int().nullable(), // เหมาลำ per-vehicle fee
  perItemRate: z.number().int().nullable(), // หลายสินค้า per-item fee
  isActive: z.boolean(),
});
export type VehiclePricingDto = z.infer<typeof VehiclePricingDto>;

export const AdminUpsertVehiclePricingInput = z.object({
  vehicleType: VehicleTypeSchema,
  label: z.string().max(80).nullable().optional(),
  description: z.string().max(300).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  requirements: z.string().max(500).nullable().optional(),
  maxWeightKg: z.number().int().min(0).max(100000).nullable().optional(),
  pricePerKm: z.number().int().min(0).max(100000).nullable().optional(),
  flatRate: z.number().int().min(0).max(1000000).nullable().optional(),
  perItemRate: z.number().int().min(0).max(1000000).nullable().optional(),
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
});
export type SystemSettingsResponse = z.infer<typeof SystemSettingsResponse>;

export const UpdateSystemSettingsInput = z.object({
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(300).optional(),
  minJobPrice: z.number().int().min(0).max(10_000_000).optional(),
  maxJobPrice: z.number().int().min(0).max(10_000_000).optional(),
  cancellationFee: z.number().int().min(0).max(1_000_000).optional(),
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
  prohibitedItems: z.array(z.string()), // resolved banned-cargo list shown on the posting form
});
export type PublicSystemConfig = z.infer<typeof PublicSystemConfig>;
