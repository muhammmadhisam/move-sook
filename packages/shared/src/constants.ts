// App-wide constants shared across api / web / admin.

/** AppSetting keys (DB table `AppSetting.key`). */
export const APP_SETTING_KEYS = {
  COMMISSION_PCT: 'commission_pct',
  PRICE_PER_KM: 'price_per_km',
  MAINTENANCE_MODE: 'maintenance_mode',
  MIN_JOB_PRICE: 'min_job_price',
  MAX_JOB_PRICE: 'max_job_price',
  CANCELLATION_FEE: 'cancellation_fee',
  ADDRESS_CHANGE_FEE: 'address_change_fee', // flat THB base fee for a customer destination-change request (extra-distance added on top)
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
  PENDING_PAYMENT_EXPIRE_DAYS: 'pending_payment_expire_days', // auto-cancel unpaid jobs after N days (0 = never)
  REFERRAL_REWARD: 'referral_reward', // two-sided referral reward (THB)
  DRIVER_WEEKLY_GOAL: 'driver_weekly_goal', // weekly delivered-jobs target for the incentive bar
  SUPPORT_PHONE: 'support_phone',
  SUPPORT_LINE_ID: 'support_line_id',
  SUPPORT_EMAIL: 'support_email',
  PAY_BANK_NAME: 'pay_bank_name', // company receiving-account bank (shown on the customer payment page)
  PAY_ACCOUNT_NAME: 'pay_account_name', // account holder name
  PAY_ACCOUNT_NUMBER: 'pay_account_number', // account number
  PAY_QR_URL: 'pay_qr_url', // PromptPay/bank QR image URL
  COMPANY_NAME: 'company_name', // document header — legal/brand name
  COMPANY_ADDRESS: 'company_address',
  COMPANY_TAX_ID: 'company_tax_id',
  COMPANY_LOGO_URL: 'company_logo_url',
  PROHIBITED_ITEMS_LIST: 'prohibited_items_list', // admin-editable list of banned cargo (one item per line)
  ADMIN_LINE_GROUP_ID: 'admin_line_group_id', // LINE group/room/user ID the OA pushes ops alerts to (e.g. new payment slips)
} as const;

/** Defaults for the misc system settings. */
export const DEFAULT_SYSTEM_SETTINGS = {
  maintenanceMode: false,
  maintenanceMessage: 'ระบบปิดปรับปรุงชั่วคราว กรุณาลองใหม่ภายหลัง',
  minJobPrice: 0,
  maxJobPrice: 1_000_000,
  cancellationFee: 0,
  addressChangeFee: 100, // flat base; extra straight-line distance × price/km is added at request time
  freeCancelMinutes: 60,
  maxActiveJobsPerDriver: 3,
  maxScheduleDays: 14,
  minDistanceKm: 0, // 0 = no minimum
  maxDistanceKm: 0, // 0 = no maximum
  verifySlaHours: 24,
  idleNudgeDays: 7,
  pendingPaymentExpireDays: 3, // 0 = never auto-expire
  referralRewardThb: 50,
  driverWeeklyGoal: 20,
  supportPhone: '',
  supportLineId: '',
  supportEmail: '',
  payBankName: '',
  payAccountName: '',
  payAccountNumber: '',
  payQrUrl: '',
  companyName: 'MoveSook',
  companyAddress: '',
  companyTaxId: '',
  companyLogoUrl: '',
  termsVersion: '1.0',
  privacyVersion: '1.0',
  prohibitedItemsList: '', // '' = fall back to DEFAULT_PROHIBITED_ITEMS
  adminLineGroupId: '', // '' = no ops LINE alerts (in-app notifications still fire)
} as const;

/**
 * Default list of items the platform refuses to move (Thai). Admin-editable via
 * the `prohibited_items_list` AppSetting (one item per line). Shown to customers
 * on the posting form and to drivers as flag context.
 */
export const DEFAULT_PROHIBITED_ITEMS = [
  'ยาเสพติดทุกชนิด และสารตั้งต้น',
  'อาวุธปืน กระสุน วัตถุระเบิด และดอกไม้เพลิงผิดกฎหมาย',
  'สัตว์ป่าคุ้มครอง ซากสัตว์ งาช้าง',
  'สินค้าหนีภาษี/ผิดศุลกากร และสินค้าละเมิดลิขสิทธิ์',
  'สื่อลามกอนาจารที่ผิดกฎหมาย',
  'สารกัมมันตรังสี วัตถุอันตรายร้ายแรง',
  'ของผิดกฎหมายอื่น ๆ หรือสิ่งของที่ได้มาโดยมิชอบ',
] as const;

/** Resolve the effective prohibited-items list: admin override (newline list) or the default. */
export function resolveProhibitedItems(raw: string | null | undefined): string[] {
  const lines = (raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : [...DEFAULT_PROHIBITED_ITEMS];
}

/** Cargo categories the customer picks at post time (value -> Thai label). */
export const CARGO_CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'ของใช้ทั่วไป / เฟอร์นิเจอร์',
  APPLIANCES: 'เครื่องใช้ไฟฟ้า',
  FRAGILE: 'ของแตกหักง่าย',
  DOCUMENTS: 'เอกสาร',
  FOOD: 'อาหาร / ของสด',
  PLANTS: 'ต้นไม้',
  VALUABLES: 'ของมีค่าสูง (ทอง/เพชร)',
  ALCOHOL_TOBACCO: 'สุรา / บุหรี่',
  MEDICINE: 'ยา / เวชภัณฑ์',
  CHEMICALS: 'วัตถุอันตราย / เคมีภัณฑ์',
  OTHER: 'อื่น ๆ',
};

/**
 * Categories that are legal to move but need supporting documents (license / tax
 * invoice / permit). The posting form surfaces a reminder; not a hard block.
 */
export const RESTRICTED_CARGO_CATEGORIES: readonly string[] = [
  'VALUABLES',
  'ALCOHOL_TOBACCO',
  'MEDICINE',
  'CHEMICALS',
];

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
  'สิ่งของที่ส่งไม่ใช่ของผิดกฎหมายหรือของต้องห้าม และข้าพเจ้ารับผิดชอบแต่เพียงผู้เดียวหากฝ่าฝืน',
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

/** Default flat base fee (THB) for a customer destination-change request. */
export const DEFAULT_ADDRESS_CHANGE_FEE = 100;

export type AddressChangeFeeInput = {
  origin: { lat: number; lng: number } | null; // job origin coords (null = unknown)
  oldDest: { lat: number; lng: number } | null; // current destination coords
  newDest: { lat: number; lng: number } | null; // requested new destination coords
  baseFee: number; // flat base fee (THB), from the address_change_fee setting
  pricePerKm: number; // per-km rate for the job's vehicle type
};

export type AddressChangeFee = {
  baseFee: number;
  extraKm: number; // straight-line distance the new destination adds to the route (>= 0)
  distanceFee: number; // round(extraKm × pricePerKm)
  total: number; // baseFee + distanceFee
};

/**
 * Fee for re-routing a job to a new destination: a flat base plus the *extra*
 * straight-line distance the new drop-off adds to the trip (origin→newDest minus
 * origin→oldDest, clamped at 0 so a closer destination never discounts the base).
 * Returns base-only when any coordinate is missing (can't measure the delta).
 * Single source of truth shared by the API (snapshot) and clients (preview).
 */
export function computeAddressChangeFee(input: AddressChangeFeeInput): AddressChangeFee {
  const baseFee = Math.max(0, Math.round(input.baseFee));
  const { origin, oldDest, newDest } = input;
  let extraKm = 0;
  if (origin && oldDest && newDest) {
    const oldKm = haversineKm(origin.lat, origin.lng, oldDest.lat, oldDest.lng);
    const newKm = haversineKm(origin.lat, origin.lng, newDest.lat, newDest.lng);
    extraKm = Math.max(0, newKm - oldKm);
  }
  const distanceFee = Math.round(extraKm * Math.max(0, input.pricePerKm));
  return { baseFee, extraKm, distanceFee, total: baseFee + distanceFee };
}


/** Admin login brute-force protection. */
export const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
export const ADMIN_LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/** JWT lifetime (seconds). */
export const USER_JWT_TTL_SEC = 60 * 60 * 24 * 30; // 30 days (LIFF sessions)
export const ADMIN_JWT_TTL_SEC = 60 * 60 * 24; // 24 hours

/** Header carrying the SYSTEM static API key. */
export const SYSTEM_KEY_HEADER = 'x-system-key';
