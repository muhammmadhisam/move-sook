import { z } from 'zod';
import { DriverVerifyStatusSchema, GenderSchema, VehicleTypeSchema } from '../enums';
import { ProvinceNameSchema } from './province';

// Thai national ID: exactly 13 digits.
const NationalIdSchema = z.string().regex(/^\d{13}$/, 'เลขบัตรประชาชนต้องมี 13 หลัก');
// Date-only string (YYYY-MM-DD); server coerces to a Date.
const DateOnlySchema = z.string().date();

// ── Driver screening questionnaire ──────────────────────────────────────────
// Basic multiple-choice questions answered during self-signup. Stored as JSON on
// the Driver and shown to admins to help decide whether to approve the applicant.
// Keep option values in sync with DriverScreeningSchema below.
export const DRIVER_SCREENING_QUESTIONS = [
  {
    key: 'ownVehicle',
    question: 'คุณมีรถสำหรับรับงานหรือไม่?',
    options: [
      { value: 'OWN', label: 'มีรถเป็นของตัวเอง' },
      { value: 'FINANCING', label: 'กำลังผ่อน / เช่า' },
      { value: 'NONE', label: 'ยังไม่มีรถ' },
    ],
  },
  {
    key: 'experience',
    question: 'ประสบการณ์ขับรถขนส่ง / ขนย้าย',
    options: [
      { value: 'LT1', label: 'น้อยกว่า 1 ปี' },
      { value: 'Y1_3', label: '1 – 3 ปี' },
      { value: 'Y3_5', label: '3 – 5 ปี' },
      { value: 'GT5', label: 'มากกว่า 5 ปี' },
    ],
  },
  {
    key: 'commitment',
    question: 'รูปแบบการรับงานที่ต้องการ',
    options: [
      { value: 'FULLTIME', label: 'เต็มเวลา' },
      { value: 'PARTTIME', label: 'พาร์ทไทม์ / งานเสริม' },
    ],
  },
  {
    key: 'availability',
    question: 'ช่วงเวลาที่สะดวกรับงาน',
    options: [
      { value: 'ANYTIME', label: 'ได้ทุกวัน' },
      { value: 'WEEKDAY', label: 'วันธรรมดา' },
      { value: 'WEEKEND', label: 'วันหยุดสุดสัปดาห์' },
      { value: 'EVENING', label: 'ช่วงเย็น / กลางคืน' },
    ],
  },
  {
    key: 'lifting',
    question: 'การยกของหนัก',
    options: [
      { value: 'SELF', label: 'ยกเองได้' },
      { value: 'HELPER', label: 'มีผู้ช่วยยก' },
      { value: 'NO', label: 'ยกของหนักไม่ได้' },
    ],
  },
  {
    key: 'smartphone',
    question: 'คุณมีสมาร์ทโฟนสำหรับใช้แอปรับงานหรือไม่?',
    options: [
      { value: 'YES', label: 'มี' },
      { value: 'NO', label: 'ไม่มี' },
    ],
  },
] as const;

export const DriverScreeningSchema = z.object({
  ownVehicle: z.enum(['OWN', 'FINANCING', 'NONE']),
  experience: z.enum(['LT1', 'Y1_3', 'Y3_5', 'GT5']),
  commitment: z.enum(['FULLTIME', 'PARTTIME']),
  availability: z.enum(['ANYTIME', 'WEEKDAY', 'WEEKEND', 'EVENING']),
  lifting: z.enum(['SELF', 'HELPER', 'NO']),
  smartphone: z.enum(['YES', 'NO']),
});
export type DriverScreening = z.infer<typeof DriverScreeningSchema>;

// Personal-detail fields shared by apply (create) and PATCH /me (edit).
const driverPersonalFields = {
  firstName: z.string().min(1).max(80).optional(), // ชื่อจริง
  lastName: z.string().min(1).max(80).optional(), // นามสกุล
  birthDate: DateOnlySchema.optional(), // วันเกิด
  gender: GenderSchema.optional(), // เพศ
  email: z.string().email().max(120).optional(), // อีเมล
  emergencyContactName: z.string().min(1).max(120).optional(), // ผู้ติดต่อฉุกเฉิน
  emergencyContactPhone: z.string().min(6).max(20).optional(), // เบอร์ผู้ติดต่อฉุกเฉิน
  nationalId: NationalIdSchema.optional(), // เลขบัตรประชาชน
  nationalIdUrl: z.string().min(1).optional(), // รูปบัตรประชาชน
  address: z.string().min(1).max(300).optional(), // ที่อยู่คนขับ
  licenseNo: z.string().min(1).max(40).optional(), // เลขใบขับขี่
  licenseExpiry: DateOnlySchema.optional(), // วันหมดอายุใบขับขี่
  screening: DriverScreeningSchema.optional(), // คำตอบแบบสอบถามคัดกรอง
  // ── Vehicle photos (uploaded URLs) ──
  vehiclePhotoFront: z.string().min(1).optional(), // รูปรถ ด้านหน้า
  vehiclePhotoBack: z.string().min(1).optional(), // รูปรถ ด้านหลัง
  vehiclePhotoLeft: z.string().min(1).optional(), // รูปรถ ด้านซ้าย
  vehiclePhotoRight: z.string().min(1).optional(), // รูปรถ ด้านขวา
  vehiclePhotoPlate: z.string().min(1).optional(), // รูปป้ายทะเบียน
} as const;

// POST /drivers/apply — self-signup. Identity + contact + service area are
// REQUIRED here (overriding the optional personal fields) so an application can
// actually be verified; the rest can be completed later via PATCH /me.
export const DriverApplyInput = z.object({
  vehicleType: VehicleTypeSchema,
  plateNumber: z.string().min(1).max(20).optional(),
  licenseTw2: z.string().min(1).optional(), // uploaded doc reference / URL
  serviceProvince: ProvinceNameSchema, // province the driver operates in (canonical name_th)
  ...driverPersonalFields,
  // ── required for self-signup ──
  firstName: z.string().min(1, 'กรุณากรอกชื่อ').max(80),
  lastName: z.string().min(1, 'กรุณากรอกนามสกุล').max(80),
  phone: z.string().min(6, 'กรุณากรอกเบอร์โทร').max(20),
  nationalId: NationalIdSchema, // เลขบัตรประชาชน (13 หลัก)
  screening: DriverScreeningSchema, // ต้องตอบแบบสอบถามคัดกรองให้ครบ
});
export type DriverApplyInput = z.infer<typeof DriverApplyInput>;

// POST /drivers/claim — a signed-in user claims an admin-created application by code.
export const ClaimDriverInput = z.object({
  code: z.string().min(4).max(20),
});
export type ClaimDriverInput = z.infer<typeof ClaimDriverInput>;

// POST /drivers/me/appeal — a REJECTED / SUSPENDED driver appeals the decision
// with a message to the admin. A rejected application returns to PENDING review.
export const DriverAppealInput = z.object({
  message: z.string().min(1, 'กรุณากรอกข้อความถึงทีมงาน').max(1000),
});
export type DriverAppealInput = z.infer<typeof DriverAppealInput>;

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
// Usable by an existing (linked) driver — whether self-signed-up via /drivers/apply
// or admin-created. All fields optional so the driver can complete it progressively.
export const DriverUpdateInput = z.object({
  vehicleType: VehicleTypeSchema.optional(),
  plateNumber: z.string().min(1).max(20).optional(),
  licenseTw2: z.string().min(1).optional(), // uploaded ใบขับขี่ ท.2 image URL
  serviceProvince: ProvinceNameSchema.optional(),
  phone: z.string().min(6).max(20).optional(),
  ...driverPersonalFields,
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
  appealMessage: z.string().nullable(),
  appealAt: z.string().datetime().nullable(),
  serviceProvince: z.string().nullable(),
  isAvailable: z.boolean(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  bankName: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  bankAccountNo: z.string().nullable(),
  phone: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  birthDate: z.string().datetime().nullable(),
  gender: GenderSchema.nullable(),
  email: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  nationalId: z.string().nullable(),
  nationalIdUrl: z.string().nullable(),
  address: z.string().nullable(),
  screening: DriverScreeningSchema.nullable(),
  licenseNo: z.string().nullable(),
  licenseExpiry: z.string().datetime().nullable(),
  vehicleRegUrl: z.string().nullable(),
  vehicleRegExpiry: z.string().datetime().nullable(),
  insuranceExpiry: z.string().datetime().nullable(),
  vehiclePhotoFront: z.string().nullable(),
  vehiclePhotoBack: z.string().nullable(),
  vehiclePhotoLeft: z.string().nullable(),
  vehiclePhotoRight: z.string().nullable(),
  vehiclePhotoPlate: z.string().nullable(),
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
