// App-wide constants shared across api / web / admin.

/** AppSetting keys (DB table `AppSetting.key`). */
export const APP_SETTING_KEYS = {
  COMMISSION_PCT: 'commission_pct',
  PRICE_PER_KM: 'price_per_km',
  MAINTENANCE_MODE: 'maintenance_mode',
  MIN_JOB_PRICE: 'min_job_price',
  MAX_JOB_PRICE: 'max_job_price',
  CANCELLATION_FEE: 'cancellation_fee',
  TERMS_VERSION: 'terms_version',
  PRIVACY_VERSION: 'privacy_version',
  FLOOR_SURCHARGE: 'floor_surcharge', // THB per floor above ground when no elevator (per end)
  HELPER_SURCHARGE: 'helper_surcharge', // flat THB when the customer wants movers to help carry
  SURGE_ENABLED: 'surge_enabled', // 'true'/'false' — demand-based price multiplier on/off
  SURGE_MULTIPLIER: 'surge_multiplier', // multiplier applied to the distance base in underserved provinces
  MAINTENANCE_MESSAGE: 'maintenance_message', // text shown to users while maintenance mode is on
  FREE_CANCEL_MINUTES: 'free_cancel_minutes', // minutes after posting that a customer may cancel free
  MAX_ACTIVE_JOBS_PER_DRIVER: 'max_active_jobs_per_driver', // cap on in-hand jobs a driver can hold
  MAX_SCHEDULE_DAYS: 'max_schedule_days', // furthest a job may be scheduled ahead (days)
  MIN_DISTANCE_KM: 'min_distance_km', // reject jobs shorter than this (0 = no min)
  MAX_DISTANCE_KM: 'max_distance_km', // reject jobs longer than this (0 = no max)
  VERIFY_SLA_HOURS: 'verify_sla_hours', // driver-verification SLA window
  IDLE_NUDGE_DAYS: 'idle_nudge_days', // days of inactivity before an idle-driver nudge
  REFERRAL_REWARD: 'referral_reward', // two-sided referral reward (THB)
  DRIVER_WEEKLY_GOAL: 'driver_weekly_goal', // weekly delivered-jobs target for the incentive bar
  SUPPORT_PHONE: 'support_phone',
  SUPPORT_LINE_ID: 'support_line_id',
  SUPPORT_EMAIL: 'support_email',
  PAY_BANK_NAME: 'pay_bank_name', // company receiving-account bank (shown on the customer payment page)
  PAY_ACCOUNT_NAME: 'pay_account_name', // account holder name
  PAY_ACCOUNT_NUMBER: 'pay_account_number', // account number
  PAY_QR_URL: 'pay_qr_url', // PromptPay/bank QR image URL
} as const;

/** Defaults for the misc system settings. */
export const DEFAULT_SYSTEM_SETTINGS = {
  maintenanceMode: false,
  maintenanceMessage: 'ระบบปิดปรับปรุงชั่วคราว กรุณาลองใหม่ภายหลัง',
  minJobPrice: 0,
  maxJobPrice: 1_000_000,
  cancellationFee: 0,
  freeCancelMinutes: 60,
  maxActiveJobsPerDriver: 3,
  maxScheduleDays: 14,
  minDistanceKm: 0, // 0 = no minimum
  maxDistanceKm: 0, // 0 = no maximum
  verifySlaHours: 24,
  idleNudgeDays: 7,
  referralRewardThb: 50,
  driverWeeklyGoal: 20,
  supportPhone: '',
  supportLineId: '',
  supportEmail: '',
  payBankName: '',
  payAccountName: '',
  payAccountNumber: '',
  payQrUrl: '',
  termsVersion: '1.0',
  privacyVersion: '1.0',
} as const;

/** Clamp a computed price into the configured [min, max] window. max=0 means no cap. */
export function clampJobPrice(total: number, minJobPrice: number, maxJobPrice: number): number {
  let v = total;
  if (maxJobPrice > 0) v = Math.min(v, maxJobPrice);
  return Math.max(v, minJobPrice);
}

/** Posting-agreement bullet points the customer must accept on /jobs/new (Thai UI copy). */
export const JOB_POSTING_TERMS = [
  'ข้อมูลงานและที่อยู่ที่กรอกเป็นความจริงและถูกต้อง',
  'ราคาที่เสนอเป็นเพียงราคาเริ่มต้น อาจมีค่าใช้จ่ายเพิ่มตามจริง (เช่น ชั้น ลิฟต์ คนช่วยยก)',
  'ยินยอมให้ผู้ขับที่รับงานติดต่อตามเบอร์ที่ให้ไว้ และเข้าถึงข้อมูลงานที่จำเป็น',
  'รับทราบนโยบายการยกเลิกงานและอาจมีค่าธรรมเนียมการยกเลิก',
] as const;

/** Fallback commission % if AppSetting row is missing. */
export const DEFAULT_COMMISSION_PCT = 12;

/** Fallback delivery price per kilometre (THB) if AppSetting row is missing. */
export const DEFAULT_PRICE_PER_KM = 20;

/** Fallback per-floor surcharge (THB) charged for each floor above ground with no elevator, per end. */
export const DEFAULT_FLOOR_SURCHARGE = 40;

/** Fallback flat surcharge (THB) when the customer requests movers to help carry. */
export const DEFAULT_HELPER_SURCHARGE = 300;

/** Suggested job price from distance × rate (THB, rounded). Single source of truth. */
export function estimateJobPrice(distanceKm: number, pricePerKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  return Math.round(distanceKm * pricePerKm);
}

/** Default demand-surge multiplier applied to the distance base in underserved provinces. */
export const DEFAULT_SURGE_MULTIPLIER = 1.2;

/** Fallback เหมาลำ flat per-vehicle fee (THB) when a vehicle type has no `flatRate`. */
export const DEFAULT_FLAT_RATE = 0;

/** Fallback หลายสินค้า per-item fee (THB) when a vehicle type has no `perItemRate`. */
export const DEFAULT_PER_ITEM_RATE = 50;

/** Inputs to the full quote calculator. Floors/elevators are per-end; null = unknown (no surcharge). */
export type JobQuoteInput = {
  pricingMode?: 'CHARTER' | 'PER_ITEM'; // how to price (defaults to CHARTER)
  distanceKm: number;
  pricePerKm: number;
  originFloor?: number | null;
  originHasElevator?: boolean | null;
  destFloor?: number | null;
  destHasElevator?: boolean | null;
  needsHelpers?: boolean | null;
  floorSurcharge?: number; // per-floor rate (defaults to DEFAULT_FLOOR_SURCHARGE)
  helperSurcharge?: number; // flat helper fee (defaults to DEFAULT_HELPER_SURCHARGE)
  surgeMultiplier?: number; // applied to the distance base only (defaults to 1 = no surge)
  flatRate?: number; // CHARTER add-on: flat per-vehicle fee (defaults to DEFAULT_FLAT_RATE)
  perItemRate?: number; // PER_ITEM: fee per item unit (defaults to DEFAULT_PER_ITEM_RATE)
  itemCount?: number; // PER_ITEM: total quantity of items (defaults to 0)
};

/** Itemised quote breakdown (THB). `subtotal` excludes any promo discount. */
export type JobQuote = {
  pricingMode: 'CHARTER' | 'PER_ITEM';
  distanceKm: number;
  base: number; // distance × rate × surge (both modes)
  flatRate: number; // เหมาลำ flat fee (0 in PER_ITEM mode)
  itemsCharge: number; // perItemRate × itemCount (0 in CHARTER mode)
  floorSurcharge: number; // origin + dest floors carried without a lift
  helperSurcharge: number; // flat fee when helpers requested
  surgeMultiplier: number; // 1 = no surge; >1 = demand surge applied to base
  subtotal: number; // base + mode charge + surcharges
};

/** Surcharge for one end: floors above ground carried by hand (no lift). 0 if a lift is available or floor unknown. */
function endFloorSurcharge(
  floor: number | null | undefined,
  hasElevator: boolean | null | undefined,
  perFloor: number,
): number {
  if (hasElevator) return 0; // a lift removes the carry surcharge
  if (floor == null || floor <= 0) return 0; // ground floor / unknown
  return floor * perFloor;
}

/**
 * Full job price quote: distance base + floor-carry surcharges + helper fee.
 * Single source of truth used by the public estimate endpoint, job creation,
 * and the web posting summary — keep clients and API in lock-step.
 */
export function computeJobQuote(input: JobQuoteInput): JobQuote {
  const mode = input.pricingMode ?? 'CHARTER';
  const perFloor = input.floorSurcharge ?? DEFAULT_FLOOR_SURCHARGE;
  const helperFee = input.helperSurcharge ?? DEFAULT_HELPER_SURCHARGE;
  const surge = input.surgeMultiplier && input.surgeMultiplier > 0 ? input.surgeMultiplier : 1;
  const base = Math.round(estimateJobPrice(input.distanceKm, input.pricePerKm) * surge);

  // Mode-specific charge (not surged):
  // CHARTER = flat per-vehicle booking fee; PER_ITEM = per-item rate × quantity.
  const flatRate = mode === 'CHARTER' ? (input.flatRate ?? DEFAULT_FLAT_RATE) : 0;
  const itemsCharge =
    mode === 'PER_ITEM'
      ? (input.perItemRate ?? DEFAULT_PER_ITEM_RATE) * Math.max(0, input.itemCount ?? 0)
      : 0;

  const floorSurcharge =
    endFloorSurcharge(input.originFloor, input.originHasElevator, perFloor) +
    endFloorSurcharge(input.destFloor, input.destHasElevator, perFloor);
  const helperSurcharge = input.needsHelpers ? helperFee : 0;

  return {
    pricingMode: mode,
    distanceKm: input.distanceKm,
    base,
    flatRate,
    itemsCharge,
    floorSurcharge,
    helperSurcharge,
    surgeMultiplier: surge,
    subtotal: base + flatRate + itemsCharge + floorSurcharge + helperSurcharge,
  };
}

/** Two-sided referral reward (THB) issued as a single-use promo code to referrer + referee. */
export const REFERRAL_REWARD_THB = 50;

/** Weekly delivered-jobs target used for the driver incentive progress bar. */
export const DRIVER_WEEKLY_GOAL = 20;

/** Hours an admin has to action a pending driver application before it counts as an SLA breach. */
export const DRIVER_VERIFY_SLA_HOURS = 24;

/** Days of inactivity after which an approved driver is considered idle and eligible for a re-engagement nudge. */
export const DRIVER_IDLE_NUDGE_DAYS = 7;

/** Straight-line distance between two lat/lng points using the Haversine formula (km). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth radius km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


/** Admin login brute-force protection. */
export const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
export const ADMIN_LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/** JWT lifetime (seconds). */
export const USER_JWT_TTL_SEC = 60 * 60 * 24 * 30; // 30 days (LIFF sessions)
export const ADMIN_JWT_TTL_SEC = 60 * 60 * 8; // 8 hours

/** Header carrying the SYSTEM static API key. */
export const SYSTEM_KEY_HEADER = 'x-system-key';
