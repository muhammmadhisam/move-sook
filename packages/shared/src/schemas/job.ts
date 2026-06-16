import { z } from 'zod';
import {
  AddrChangeStatusSchema,
  CargoCategorySchema,
  JobStatusSchema,
  PricingModeSchema,
  VehicleTypeSchema,
} from '../enums';
import { ProvinceNameSchema } from './province';

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);

// Floor number: 0 = ground, capped to keep input sane.
const floor = z.number().int().min(0).max(200);

// Max photos a customer can attach to a single item.
export const MAX_ITEM_PHOTOS = 5;

// Thai contact phone. Accepts the way people actually type it (spaces, dashes,
// parens), normalises to bare digits, then requires a 9–10 digit number starting
// with 0 (mobile = 10, e.g. Bangkok landline = 9). Clients and the API share
// this so a job always stores a clean, dial-able number.
export const ThaiPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s\-()]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^0\d{8,9}$/, { message: 'กรุณากรอกเบอร์โทรให้ถูกต้อง (เช่น 081-234-5678)' }),
  );

// One item the customer wants moved (structured "add item" table row).
export const JobItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1).max(999),
  photoUrls: z.array(z.string().url()).max(MAX_ITEM_PHOTOS).default([]), // up to 5 photos per item
});
export type JobItem = z.infer<typeof JobItemSchema>;

// POST /jobs  (USER creates a moving job). `itemDescription`/`itemCount` are
// derived server-side from `items`, so clients only send the structured list.
export const CreateJobInput = z.object({
  items: z.array(JobItemSchema).min(1).max(50), // structured list of things to move
  vehicleType: VehicleTypeSchema,
  itemCategory: CargoCategorySchema.optional(), // declared cargo category (drives the prohibited-items reminder)
  needsHelpers: z.boolean().optional(), // customer wants movers to help carry
  contactPhone: ThaiPhoneSchema, // on-site contact — required so the driver can reach the customer
  notes: z.string().trim().max(1000).optional(), // special instructions
  originAddress: z.string().min(3),
  originProvince: ProvinceNameSchema,
  originLat: latitude.optional(),
  originLng: longitude.optional(),
  originFloor: floor.optional(),
  originHasElevator: z.boolean().optional(),
  destAddress: z.string().min(3),
  destProvince: ProvinceNameSchema,
  destLat: latitude.optional(),
  destLng: longitude.optional(),
  destFloor: floor.optional(),
  destHasElevator: z.boolean().optional(),
  scheduledAt: z.coerce.date().optional(),
  pricingMode: PricingModeSchema.optional(), // เหมาลำ (default) vs คิดตามจำนวนสินค้า
  // NOTE: no priceQuoted here — the server always computes the price itself
  // (computeJobQuote + clamp); a client-sent price would be ignored anyway.
  promoCode: z.string().trim().min(2).max(40).optional(), // optional discount code applied at posting
  // Customer must accept the posting agreement; must be literally true.
  acceptedTerms: z.literal(true, {
    errorMap: () => ({ message: 'กรุณายอมรับข้อตกลงก่อนโพสต์งาน' }),
  }),
  // Customer must acknowledge the prohibited-items policy; must be literally true.
  acceptedProhibitedPolicy: z.literal(true, {
    errorMap: () => ({ message: 'กรุณายืนยันว่าสิ่งของไม่ใช่ของผิดกฎหมาย/ของต้องห้าม' }),
  }),
});
export type CreateJobInput = z.infer<typeof CreateJobInput>;

// POST /jobs/:id/flag-illegal — the assigned DRIVER reports prohibited/illegal
// cargo. Puts the job on hold (FLAGGED_ILLEGAL) for admin review; no commission.
export const FlagJobIllegalInput = z.object({
  reason: z.string().trim().min(3).max(500), // what was found / why it's prohibited
});
export type FlagJobIllegalInput = z.infer<typeof FlagJobIllegalInput>;

// POST /jobs/estimate — public, no auth. Returns an itemised price quote
// (distance base + floor/helper surcharges) and, if a promo code is supplied,
// previews the discount. Mirrors what job creation will actually charge.
export const EstimateJobInput = z.object({
  vehicleType: VehicleTypeSchema,
  pricingMode: PricingModeSchema.optional(), // defaults to CHARTER
  itemCount: z.number().int().min(0).optional(), // total quantity (used by PER_ITEM mode)
  originProvince: z.string().optional(), // enables demand-surge lookup for the quote
  originLat: latitude,
  originLng: longitude,
  destLat: latitude,
  destLng: longitude,
  originFloor: floor.optional(),
  originHasElevator: z.boolean().optional(),
  destFloor: floor.optional(),
  destHasElevator: z.boolean().optional(),
  needsHelpers: z.boolean().optional(),
  promoCode: z.string().trim().min(2).max(40).optional(),
});
export type EstimateJobInput = z.infer<typeof EstimateJobInput>;

export const EstimateJobResponse = z.object({
  pricingMode: PricingModeSchema,
  distanceKm: z.number(),
  pricePerKm: z.number(),
  base: z.number().int(), // distance × rate × surge
  flatRate: z.number().int(), // เหมาลำ flat fee (0 in PER_ITEM)
  itemsCharge: z.number().int(), // per-item total (0 in CHARTER)
  floorSurcharge: z.number().int(), // floors carried without a lift (both ends)
  helperSurcharge: z.number().int(), // flat helper fee
  surgeMultiplier: z.number(), // 1 = no surge; >1 = demand surge active in this province
  surgeActive: z.boolean(), // convenience flag for the UI (surgeMultiplier > 1)
  subtotal: z.number().int(), // base + surcharges, before discount
  promoCode: z.string().nullable(), // echoed back when a valid code was applied
  discountAmount: z.number().int(), // 0 when no/invalid promo
  total: z.number().int(), // subtotal − discount
  promoError: z.string().nullable(), // Thai reason when a supplied promo could not be applied
});
export type EstimateJobResponse = z.infer<typeof EstimateJobResponse>;

// POST /jobs/:id/payment-slip — customer uploads their bank-transfer slip for a
// PENDING_PAYMENT job. The job stays hidden from drivers until an admin approves.
export const UploadPaymentSlipInput = z.object({
  slipUrl: z.string().url(),
});
export type UploadPaymentSlipInput = z.infer<typeof UploadPaymentSlipInput>;

// POST /jobs/:id/dest-change — customer asks to re-route the job to a new
// destination mid-delivery. Allowed only while the driver holds the job
// (ACCEPTED/PICKED_UP/IN_TRANSIT) and there is no active request already.
export const RequestDestChangeInput = z.object({
  destAddress: z.string().min(3),
  destProvince: ProvinceNameSchema,
  destLat: latitude.optional(),
  destLng: longitude.optional(),
  reason: z.string().trim().max(500).optional(),
  // Optional: attach the fee transfer slip in the same step. When present the
  // request skips straight to admin payment review (PENDING_REVIEW); otherwise
  // it waits for the admin to approve the request before the customer pays.
  slipUrl: z.string().url().optional(),
});
export type RequestDestChangeInput = z.infer<typeof RequestDestChangeInput>;

// POST /jobs/:id/dest-change/slip — customer uploads the change-fee transfer slip
// (only once an admin has approved the request).
export const UploadDestChangeSlipInput = z.object({
  slipUrl: z.string().url(),
});
export type UploadDestChangeSlipInput = z.infer<typeof UploadDestChangeSlipInput>;

// POST /jobs/:id/proof — driver attaches a pickup or delivery photo.
export const SetJobProofInput = z.object({
  kind: z.enum(['PICKUP', 'DELIVERY']),
  // Full replacement list of proof photos for the given kind (max 10).
  urls: z.array(z.string().url()).max(10),
});
export type SetJobProofInput = z.infer<typeof SetJobProofInput>;

// GET /jobs query (driver browses by area / backhaul; user lists own)
export const ListJobsQuery = z.object({
  status: JobStatusSchema.optional(),
  originProvince: z.string().optional(),
  destProvince: z.string().optional(),
  vehicleType: VehicleTypeSchema.optional(),
  // DRIVER only: list jobs already assigned to me (accepted/active) instead of
  // the open feed. Ignored for USER (who always see their own posted jobs).
  mine: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  take: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ListJobsQuery = z.infer<typeof ListJobsQuery>;

// PATCH /jobs/:id/status (driver advances via state machine)
export const UpdateJobStatusInput = z.object({
  status: JobStatusSchema,
});
export type UpdateJobStatusInput = z.infer<typeof UpdateJobStatusInput>;

// Job DTO returned to clients (serialised dates as ISO strings).
export const JobDto = z.object({
  id: z.string(),
  customerId: z.string(),
  createdByAdminId: z.string().nullable(),
  driverId: z.string().nullable(),
  status: JobStatusSchema,
  itemDescription: z.string(),
  items: z.array(JobItemSchema).nullable(),
  vehicleType: VehicleTypeSchema,
  itemCategory: CargoCategorySchema.nullable(),
  prohibitedAck: z.boolean(),
  flaggedIllegalAt: z.string().datetime().nullable(),
  flaggedIllegalReason: z.string().nullable(),
  itemCount: z.number().int().nullable(),
  needsHelpers: z.boolean(),
  contactPhone: z.string().nullable(),
  notes: z.string().nullable(),
  originAddress: z.string(),
  originProvince: z.string(),
  originLat: z.number().nullable(),
  originLng: z.number().nullable(),
  originFloor: z.number().int().nullable(),
  originHasElevator: z.boolean().nullable(),
  destAddress: z.string(),
  destProvince: z.string(),
  destLat: z.number().nullable(),
  destLng: z.number().nullable(),
  destFloor: z.number().int().nullable(),
  destHasElevator: z.boolean().nullable(),
  scheduledAt: z.string().datetime().nullable(),
  termsAcceptedAt: z.string().datetime().nullable(),
  // Up-front payment (customer transfers before the job is published to drivers).
  paymentSlipUrl: z.string().nullable(),
  paymentSlipUploadedAt: z.string().datetime().nullable(),
  paymentApprovedAt: z.string().datetime().nullable(),
  paymentRejectedReason: z.string().nullable(),
  pricingMode: PricingModeSchema,
  priceQuoted: z.number().int().nullable(),
  promoCode: z.string().nullable(),
  discountAmount: z.number().int().nullable(),
  commissionPct: z.number().nullable(),
  itemPhotos: z.array(z.string()),
  pickupProofUrls: z.array(z.string()),
  deliveryProofUrls: z.array(z.string()),
  customerConfirmedAt: z.string().datetime().nullable(),
  // Destination-change request (re-route mid-delivery; admin-approved; customer pays a fee).
  destChangeStatus: AddrChangeStatusSchema,
  destChangeNewAddress: z.string().nullable(),
  destChangeNewProvince: z.string().nullable(),
  destChangeNewLat: z.number().nullable(),
  destChangeNewLng: z.number().nullable(),
  destChangeReason: z.string().nullable(),
  destChangeFee: z.number().int().nullable(),
  destChangeExtraKm: z.number().nullable(),
  destChangeRequestedAt: z.string().datetime().nullable(),
  destChangeRejectedReason: z.string().nullable(),
  destChangeSlipUrl: z.string().nullable(),
  destChangeSlipUploadedAt: z.string().datetime().nullable(),
  destChangeCompletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type JobDto = z.infer<typeof JobDto>;

export const JobListResponse = z.object({
  items: z.array(JobDto),
  nextCursor: z.string().nullable(),
});
export type JobListResponse = z.infer<typeof JobListResponse>;

// GET /jobs/:id — job + assigned-driver summary (for the tracking screen).
export const JobDriverSummary = z.object({
  displayName: z.string().nullable(),
  vehicleType: VehicleTypeSchema,
  plateNumber: z.string().nullable(),
  phone: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  lat: z.number().nullable(), // last broadcast GPS (live tracking)
  lng: z.number().nullable(),
  locationAt: z.string().datetime().nullable(),
});
export type JobDriverSummary = z.infer<typeof JobDriverSummary>;

// SSE payload pushed by GET /jobs/:id/track — job status + the assigned driver's
// live location. Clients render the driver pin and a "updated X ago" stamp.
export const JobTrackEvent = z.object({
  status: JobStatusSchema,
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  locationAt: z.string().datetime().nullable(),
});
export type JobTrackEvent = z.infer<typeof JobTrackEvent>;

export const JobDetailResponse = JobDto.extend({
  driver: JobDriverSummary.nullable(),
  // True once the job's customer has left their one allowed review — clients
  // hide the "rate driver" button instead of letting a second submit 409.
  hasReview: z.boolean(),
});
export type JobDetailResponse = z.infer<typeof JobDetailResponse>;

// GET /jobs/pricing — public, no auth. Rates per vehicle type for display in the posting summary.
export const JobPricingRate = z.object({
  vehicleType: VehicleTypeSchema,
  label: z.string().nullable(), // admin-configured display name (VehiclePricing.label); null = use enum label
  imageUrl: z.string().nullable(), // representative vehicle photo shown to customers
  pricePerKm: z.number(),
  isActive: z.boolean(),
});
export type JobPricingRate = z.infer<typeof JobPricingRate>;

export const JobPricingResponse = z.object({ rates: z.array(JobPricingRate) });
export type JobPricingResponse = z.infer<typeof JobPricingResponse>;

// GET /jobs/service-areas — public. Provinces the platform serves (origin must be
// one of them at post time). `unrestricted` = no service areas configured, so any
// province is allowed; clients then skip the origin-province filter.
export const JobServiceAreasResponse = z.object({
  unrestricted: z.boolean(),
  provinces: z.array(z.string()),
});
export type JobServiceAreasResponse = z.infer<typeof JobServiceAreasResponse>;

