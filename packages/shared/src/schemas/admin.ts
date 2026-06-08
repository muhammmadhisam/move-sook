import { z } from 'zod';
import {
  AdminRoleSchema,
  DriverVerifyStatusSchema,
  JobStatusSchema,
  RoleSchema,
  VehicleTypeSchema,
} from '../enums';
import { ProvinceNameSchema } from './province';
import { PageQuery } from './pagination';
import { DriverDto } from './driver';
import { JobDto } from './job';
import { CustomerDto, CustomerNoteDto } from './customer';
import { ReviewDto } from './review';

// GET /admin/stats
export const AdminStatsResponse = z.object({
  jobsToday: z.number().int(),
  jobsByStatus: z.record(JobStatusSchema, z.number().int()),
  commissionRevenue: z.number(), // THB, sum(priceQuoted * commissionPct/100) for delivered
  fillRate: z.number(), // accepted+ / posted, 0..1
  openJobs: z.number().int(), // POSTED, unassigned
  pendingDrivers: z.number().int(),
});
export type AdminStatsResponse = z.infer<typeof AdminStatsResponse>;

// GET /admin/drivers?status=PENDING
export const AdminListDriversQuery = PageQuery.extend({
  status: DriverVerifyStatusSchema.optional(),
});
export type AdminListDriversQuery = z.infer<typeof AdminListDriversQuery>;

// POST /admin/drivers/:id/verify
// APPROVE -> APPROVED, REJECT -> REJECTED, SUSPEND -> SUSPENDED (re-block an approved driver).
// `reason` is stored on Driver.rejectionReason and logged; recommended for REJECT/SUSPEND.
export const AdminVerifyDriverInput = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'SUSPEND']),
  reason: z.string().max(500).optional(),
});
export type AdminVerifyDriverInput = z.infer<typeof AdminVerifyDriverInput>;

// GET /admin/users
export const AdminListUsersQuery = PageQuery.extend({
  role: z.enum(['USER', 'DRIVER', 'ADMIN']).optional(),
  isBanned: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().trim().min(1).max(100).optional(), // matches displayName or phone (contains, case-insensitive)
});
export type AdminListUsersQuery = z.infer<typeof AdminListUsersQuery>;

// Row shape for GET /admin/users.
export const AdminUserListItem = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  role: RoleSchema,
  isBanned: z.boolean(),
  phone: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminUserListItem = z.infer<typeof AdminUserListItem>;

// GET /admin/jobs
export const AdminListJobsQuery = PageQuery.extend({
  status: JobStatusSchema.optional(),
  province: z.string().optional(), // matches origin OR dest
});
export type AdminListJobsQuery = z.infer<typeof AdminListJobsQuery>;

// PATCH /admin/users/:id/ban
export const AdminBanUserInput = z.object({
  isBanned: z.boolean(),
});
export type AdminBanUserInput = z.infer<typeof AdminBanUserInput>;

// PATCH /admin/jobs/:id (intervene / cancel)
export const AdminPatchJobInput = z.object({
  status: JobStatusSchema.optional(),
  driverId: z.string().nullable().optional(),
  priceQuoted: z.number().int().positive().nullable().optional(),
});
export type AdminPatchJobInput = z.infer<typeof AdminPatchJobInput>;

// GET / PUT /admin/settings/commission
export const CommissionSettingResponse = z.object({
  commissionPct: z.number().min(0).max(100),
});
export type CommissionSettingResponse = z.infer<typeof CommissionSettingResponse>;

export const UpdateCommissionInput = z.object({
  commissionPct: z.number().min(0).max(100),
});
export type UpdateCommissionInput = z.infer<typeof UpdateCommissionInput>;

// GET / PUT /admin/settings/pricing — delivery rate + job surcharges + demand surge.
export const PricingSettingResponse = z.object({
  pricePerKm: z.number().min(0),
  floorSurcharge: z.number().min(0), // per floor above ground with no lift, per end
  helperSurcharge: z.number().min(0), // flat fee when the customer wants movers to help carry
  surgeEnabled: z.boolean(), // demand-based price multiplier on/off
  surgeMultiplier: z.number().min(1), // multiplier applied to the base in underserved provinces
});
export type PricingSettingResponse = z.infer<typeof PricingSettingResponse>;

// All fields optional: the admin UI saves each card independently (partial patch).
export const UpdatePricingInput = z
  .object({
    pricePerKm: z.number().min(0).max(100000).optional(),
    floorSurcharge: z.number().min(0).max(100000).optional(),
    helperSurcharge: z.number().min(0).max(100000).optional(),
    surgeEnabled: z.boolean().optional(),
    surgeMultiplier: z.number().min(1).max(5).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'ต้องระบุค่าที่ต้องการแก้ไขอย่างน้อยหนึ่งรายการ',
  });
export type UpdatePricingInput = z.infer<typeof UpdatePricingInput>;

// GET /admin/users/:id — full customer/driver profile with history.
export const AdminUserDetailResponse = z.object({
  user: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    pictureUrl: z.string().nullable(),
    phone: z.string().nullable(),
    role: RoleSchema,
    isBanned: z.boolean(),
    anonymizedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  }),
  driver: DriverDto.nullable(),
  jobsAsCustomer: z.array(JobDto), // recent jobs the user posted
  reviewsAuthored: z.array(ReviewDto),
  counts: z.object({
    jobsTotal: z.number().int(),
    jobsDelivered: z.number().int(),
    jobsCancelled: z.number().int(),
  }),
});
export type AdminUserDetailResponse = z.infer<typeof AdminUserDetailResponse>;

// GET /admin/drivers/:id — full driver profile with jobs, reviews, earnings.
export const AdminDriverReviewItem = z.object({
  id: z.string(),
  rating: z.number().int(),
  comment: z.string().nullable(),
  createdAt: z.string().datetime(),
  customerName: z.string().nullable(),
});
export type AdminDriverReviewItem = z.infer<typeof AdminDriverReviewItem>;

export const AdminDriverDetailResponse = z.object({
  driver: DriverDto,
  recentJobs: z.array(JobDto), // jobs the driver accepted
  reviews: z.array(AdminDriverReviewItem),
  earnings: z.object({
    totalGross: z.number().int(),
    totalCommission: z.number().int(),
    totalNet: z.number().int(),
    paidCount: z.number().int(),
    pendingCount: z.number().int(),
  }),
});
export type AdminDriverDetailResponse = z.infer<typeof AdminDriverDetailResponse>;

// GET /admin/audit-logs — immutable trail of admin actions.
export const AuditLogDto = z.object({
  id: z.string(),
  actorId: z.string(),
  actorName: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  metadata: z.unknown().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditLogDto = z.infer<typeof AuditLogDto>;

export const AdminListAuditLogsQuery = PageQuery.extend({
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
});
export type AdminListAuditLogsQuery = z.infer<typeof AdminListAuditLogsQuery>;

// GET /admin/admins
export const AdminListAdminsQuery = PageQuery;
export type AdminListAdminsQuery = z.infer<typeof AdminListAdminsQuery>;

// GET /admin/customers — list / search customers (offline + linked).
export const AdminListCustomersQuery = PageQuery.extend({
  search: z.string().trim().min(1).max(100).optional(), // name or phone
});
export type AdminListCustomersQuery = z.infer<typeof AdminListCustomersQuery>;

// POST /admin/customers — admin records an offline customer.
export const AdminCreateCustomerInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(3).max(20).optional(),
  note: z.string().max(500).optional(),
});
export type AdminCreateCustomerInput = z.infer<typeof AdminCreateCustomerInput>;

// POST /admin/jobs — admin creates a job on behalf of a customer.
// Customer: pass an existing `customerId`, OR inline `customerName`(+phone) to
// create/record one. Disposition: pass `assignDriverId` to assign immediately
// (-> ACCEPTED, commission snapshotted now); omit it to post open (-> POSTED).
export const AdminCreateJobInput = z
  .object({
    customerId: z.string().optional(),
    customerName: z.string().min(1).max(120).optional(),
    customerPhone: z.string().min(3).max(20).optional(),
    customerNote: z.string().max(500).optional(),
    itemDescription: z.string().min(3).max(1000),
    vehicleType: VehicleTypeSchema,
    originAddress: z.string().min(3),
    originProvince: ProvinceNameSchema,
    destAddress: z.string().min(3),
    destProvince: ProvinceNameSchema,
    scheduledAt: z.coerce.date().optional(),
    priceQuoted: z.number().int().positive().optional(),
    promoCode: z.string().max(40).optional(),
    assignDriverId: z.string().optional(),
    paymentSlipUrl: z.string().url().optional(), // customer's transfer slip, kept on record (admin vouches for payment)
  })
  .refine((d) => Boolean(d.customerId ?? d.customerName ?? d.customerPhone), {
    message: 'Provide an existing customerId or a new customer name/phone',
  });
export type AdminCreateJobInput = z.infer<typeof AdminCreateJobInput>;

// POST /admin/jobs/:id/payment/reject — admin bounces a slip back to the customer.
export const AdminRejectPaymentInput = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type AdminRejectPaymentInput = z.infer<typeof AdminRejectPaymentInput>;

// Job row enriched with customer summary for the admin job board.
export const AdminJobListItem = JobDto.extend({
  customerName: z.string().nullable(),
  customerPhone: z.string().nullable(),
});
export type AdminJobListItem = z.infer<typeof AdminJobListItem>;

// GET /admin/jobs/:id — single job detail for the admin.
export const AdminJobDetailResponse = AdminJobListItem.extend({
  driverName: z.string().nullable(),
});
export type AdminJobDetailResponse = z.infer<typeof AdminJobDetailResponse>;

// GET /admin/customers/:id — customer profile with job history.
export const AdminCustomerDetailResponse = z.object({
  customer: CustomerDto,
  jobs: z.array(JobDto),
  notes: z.array(CustomerNoteDto),
});
export type AdminCustomerDetailResponse = z.infer<typeof AdminCustomerDetailResponse>;

// GET /admin/whoami — the signed-in admin's identity + role (drives UI nav gating).
export const AdminWhoamiResponse = z.object({
  userId: z.string(),
  displayName: z.string().nullable(),
  email: z.string(),
  adminRole: AdminRoleSchema,
});
export type AdminWhoamiResponse = z.infer<typeof AdminWhoamiResponse>;

// GET /admin/admins — list admin accounts (SUPER only).
export const AdminListItem = z.object({
  userId: z.string(),
  displayName: z.string().nullable(),
  email: z.string(),
  adminRole: AdminRoleSchema,
  createdAt: z.string().datetime(),
});
export type AdminListItem = z.infer<typeof AdminListItem>;

// POST /admin/admins — invite (create) a new admin (SUPER only).
export const AdminInviteInput = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  adminRole: AdminRoleSchema,
  password: z.string().min(8).max(100),
});
export type AdminInviteInput = z.infer<typeof AdminInviteInput>;

// POST /admin/drivers — admin pre-registers a driver (no app account yet).
export const AdminCreateDriverInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(3).max(20).optional(),
  vehicleType: VehicleTypeSchema,
  plateNumber: z.string().max(20).optional(),
  licenseTw2: z.string().max(500).optional(),
  serviceProvince: ProvinceNameSchema.optional(),
  verifyStatus: z.enum(['PENDING', 'APPROVED']).default('APPROVED'),
  bankName: z.string().max(100).optional(),
  bankAccountName: z.string().max(120).optional(),
  bankAccountNo: z.string().max(40).optional(),
});
export type AdminCreateDriverInput = z.infer<typeof AdminCreateDriverInput>;

// POST /admin/drivers/:id/connect — link a pre-registered driver to a signed-up user.
export const AdminConnectDriverInput = z.object({
  userId: z.string(),
});
export type AdminConnectDriverInput = z.infer<typeof AdminConnectDriverInput>;
