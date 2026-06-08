import { z } from 'zod';
import { DriverVerifyStatusSchema, VehicleTypeSchema } from '../enums';
import { ProvinceNameSchema } from './province';

// POST /drivers/apply
export const DriverApplyInput = z.object({
  vehicleType: VehicleTypeSchema,
  plateNumber: z.string().min(1).max(20).optional(),
  licenseTw2: z.string().min(1).optional(), // uploaded doc reference / URL
  serviceProvince: ProvinceNameSchema, // province the driver operates in (canonical name_th)
  phone: z.string().min(6).max(20).optional(),
});
export type DriverApplyInput = z.infer<typeof DriverApplyInput>;

// POST /drivers/claim — a signed-in user claims an admin-created application by code.
export const ClaimDriverInput = z.object({
  code: z.string().min(4).max(20),
});
export type ClaimDriverInput = z.infer<typeof ClaimDriverInput>;

// PATCH /drivers/me/availability — driver toggles online/offline (on-demand)
export const DriverAvailabilityInput = z.object({
  isAvailable: z.boolean(),
});
export type DriverAvailabilityInput = z.infer<typeof DriverAvailabilityInput>;

// PATCH /drivers/me/location — driver broadcasts current GPS while on an active job.
export const UpdateDriverLocationInput = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type UpdateDriverLocationInput = z.infer<typeof UpdateDriverLocationInput>;

// PATCH /drivers/me — the driver fills in / edits their own application details.
// Only usable by an existing (admin-created, linked) driver; there is no public
// self-signup. All fields optional so the driver can complete it progressively.
export const DriverUpdateInput = z.object({
  vehicleType: VehicleTypeSchema.optional(),
  plateNumber: z.string().min(1).max(20).optional(),
  licenseTw2: z.string().min(1).optional(), // uploaded ใบขับขี่ ท.2 image URL
  serviceProvince: ProvinceNameSchema.optional(),
  phone: z.string().min(6).max(20).optional(),
  bankName: z.string().max(100).optional(),
  bankAccountName: z.string().max(120).optional(),
  bankAccountNo: z.string().max(40).optional(),
});
export type DriverUpdateInput = z.infer<typeof DriverUpdateInput>;

export const DriverDto = z.object({
  id: z.string(),
  userId: z.string().nullable(), // null = admin-added, not yet linked to an app account
  vehicleType: VehicleTypeSchema,
  plateNumber: z.string().nullable(),
  licenseTw2: z.string().nullable(),
  verifyStatus: DriverVerifyStatusSchema,
  rejectionReason: z.string().nullable(),
  serviceProvince: z.string().nullable(),
  isAvailable: z.boolean(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  bankName: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  bankAccountNo: z.string().nullable(),
  phone: z.string().nullable(),
  nationalId: z.string().nullable(),
  nationalIdUrl: z.string().nullable(),
  licenseNo: z.string().nullable(),
  licenseExpiry: z.string().datetime().nullable(),
  vehicleRegUrl: z.string().nullable(),
  vehicleRegExpiry: z.string().datetime().nullable(),
  insuranceExpiry: z.string().datetime().nullable(),
  completedCount: z.number().int(),
  cancelCount: z.number().int(),
  submittedAt: z.string().datetime().nullable(), // last application (re)submission — verify-queue SLA anchor
  lastActiveAt: z.string().datetime().nullable(), // last availability/accept/advance — idle-churn signal
  createdAt: z.string().datetime(),
  displayName: z.string().nullable(),
});
export type DriverDto = z.infer<typeof DriverDto>;

// GET /admin/drivers/queue — pending applications ordered by how long they've
// waited, so ops can clear the onboarding funnel within the verify SLA.
export const DriverQueueItem = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  vehicleType: VehicleTypeSchema,
  serviceProvince: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  waitingHours: z.number(), // hours since submission (or record creation if never explicitly submitted)
  slaBreached: z.boolean(), // waited longer than DRIVER_VERIFY_SLA_HOURS
  hasKyc: z.boolean(), // national id + license captured (completeness hint)
});
export type DriverQueueItem = z.infer<typeof DriverQueueItem>;

export const DriverQueueResponse = z.object({
  items: z.array(DriverQueueItem),
  slaHours: z.number(),
  breachedCount: z.number().int(),
});
export type DriverQueueResponse = z.infer<typeof DriverQueueResponse>;

// PATCH /admin/drivers/:id/kyc — admin records KYC docs / numbers / expiry.
export const AdminUpdateDriverKycInput = z.object({
  nationalId: z.string().max(20).nullable().optional(),
  nationalIdUrl: z.string().max(500).nullable().optional(),
  licenseNo: z.string().max(40).nullable().optional(),
  licenseExpiry: z.coerce.date().nullable().optional(),
  vehicleRegUrl: z.string().max(500).nullable().optional(),
  vehicleRegExpiry: z.coerce.date().nullable().optional(),
  insuranceExpiry: z.coerce.date().nullable().optional(),
});
export type AdminUpdateDriverKycInput = z.infer<typeof AdminUpdateDriverKycInput>;

// GET /drivers/me/earnings — the driver's own income summary.
export const DriverEarningsResponse = z.object({
  totalNet: z.number().int(), // lifetime net to driver (THB)
  paidNet: z.number().int(), // already paid out
  pendingNet: z.number().int(), // awaiting payout
  totalCommission: z.number().int(), // platform's cut so far
  jobCount: z.number().int(), // delivered jobs with commission
  recent: z.array(
    z.object({
      jobId: z.string(),
      grossAmount: z.number().int(),
      netToDriver: z.number().int(),
      status: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
});
export type DriverEarningsResponse = z.infer<typeof DriverEarningsResponse>;

// GET /drivers/me/incentives — gamified weekly progress to keep drivers engaged.
export const DriverIncentivesResponse = z.object({
  weekDelivered: z.number().int(), // delivered jobs in the current ISO week
  weekEarnings: z.number().int(), // net-to-driver THB earned this week
  weeklyGoal: z.number().int(), // target delivered jobs (DRIVER_WEEKLY_GOAL)
  goalProgress: z.number(), // weekDelivered / weeklyGoal, capped at 1
  streakDays: z.number().int(), // consecutive days up to today with >=1 delivered job
  rank: z.number().int().nullable(), // 1-based rank by week earnings among active drivers
  totalRanked: z.number().int(), // number of drivers with earnings this week
});
export type DriverIncentivesResponse = z.infer<typeof DriverIncentivesResponse>;
