import { prisma, type VehicleType } from '@movesook/db';
import {
  APP_SETTING_KEYS,
  DEFAULT_COMMISSION_PCT,
  DEFAULT_FLAT_RATE,
  DEFAULT_FLOOR_SURCHARGE,
  DEFAULT_HELPER_SURCHARGE,
  DEFAULT_PER_ITEM_RATE,
  DEFAULT_PRICE_PER_KM,
  DEFAULT_SURGE_MULTIPLIER,
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettingsResponse,
  type UpdateSystemSettingsInput,
} from '@movesook/shared';

export async function getCommissionPct(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.COMMISSION_PCT },
  });
  if (!row) return DEFAULT_COMMISSION_PCT;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_COMMISSION_PCT;
}

export async function setCommissionPct(pct: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.COMMISSION_PCT },
    create: { key: APP_SETTING_KEYS.COMMISSION_PCT, value: String(pct) },
    update: { value: String(pct) },
  });
}

export async function getPricePerKm(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.PRICE_PER_KM },
  });
  if (!row) return DEFAULT_PRICE_PER_KM;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PRICE_PER_KM;
}

export async function setPricePerKm(value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.PRICE_PER_KM },
    create: { key: APP_SETTING_KEYS.PRICE_PER_KM, value: String(value) },
    update: { value: String(value) },
  });
}

/** Per-floor carry surcharge (THB) when no lift is available, per end. AppSetting-backed. */
export async function getFloorSurcharge(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.FLOOR_SURCHARGE },
  });
  if (!row) return DEFAULT_FLOOR_SURCHARGE;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_FLOOR_SURCHARGE;
}

export async function setFloorSurcharge(value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.FLOOR_SURCHARGE },
    create: { key: APP_SETTING_KEYS.FLOOR_SURCHARGE, value: String(value) },
    update: { value: String(value) },
  });
}

/** Flat helper-fee surcharge (THB) when the customer requests movers to carry. AppSetting-backed. */
export async function getHelperSurcharge(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.HELPER_SURCHARGE },
  });
  if (!row) return DEFAULT_HELPER_SURCHARGE;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_HELPER_SURCHARGE;
}

export async function setHelperSurcharge(value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.HELPER_SURCHARGE },
    create: { key: APP_SETTING_KEYS.HELPER_SURCHARGE, value: String(value) },
    update: { value: String(value) },
  });
}

/** Whether demand-based surge pricing is enabled. Default off. AppSetting-backed. */
export async function getSurgeEnabled(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.SURGE_ENABLED },
  });
  return row?.value === 'true';
}

export async function setSurgeEnabled(value: boolean): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.SURGE_ENABLED },
    create: { key: APP_SETTING_KEYS.SURGE_ENABLED, value: String(value) },
    update: { value: String(value) },
  });
}

/** Surge multiplier applied to the distance base in underserved provinces. AppSetting-backed. */
export async function getSurgeMultiplier(): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.SURGE_MULTIPLIER },
  });
  if (!row) return DEFAULT_SURGE_MULTIPLIER;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_SURGE_MULTIPLIER;
}

export async function setSurgeMultiplier(value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: APP_SETTING_KEYS.SURGE_MULTIPLIER },
    create: { key: APP_SETTING_KEYS.SURGE_MULTIPLIER, value: String(value) },
    update: { value: String(value) },
  });
}

/** Per-vehicle rate if configured & active, else the global price_per_km. */
export async function getEffectivePricePerKm(vehicleType: VehicleType): Promise<number> {
  const row = await prisma.vehiclePricing.findUnique({ where: { vehicleType } });
  if (row && row.isActive && row.pricePerKm != null) return row.pricePerKm;
  return getPricePerKm();
}

// ── เหมาลำ (flat charter) + หลายสินค้า (per-item) rates — configured per vehicle ──
// Rates live entirely on VehiclePricing; the code constants are a safe fallback
// only when a vehicle hasn't set its own (there is no central editable default).

/** Per-vehicle เหมาลำ flat fee if set, else the code default. */
export async function getEffectiveFlatRate(vehicleType: VehicleType): Promise<number> {
  const row = await prisma.vehiclePricing.findUnique({ where: { vehicleType } });
  return row?.flatRate ?? DEFAULT_FLAT_RATE;
}

/** Per-vehicle หลายสินค้า per-item fee if set, else the code default. */
export async function getEffectivePerItemRate(vehicleType: VehicleType): Promise<number> {
  const row = await prisma.vehiclePricing.findUnique({ where: { vehicleType } });
  return row?.perItemRate ?? DEFAULT_PER_ITEM_RATE;
}

/** A vehicle type is allowed unless an admin has explicitly disabled it. */
export async function isVehicleTypeActive(vehicleType: VehicleType): Promise<boolean> {
  const row = await prisma.vehiclePricing.findUnique({
    where: { vehicleType },
    select: { isActive: true },
  });
  return row ? row.isActive : true;
}

// ── Misc system settings (AppSetting-backed scalars) ──────────────────────────

export async function getSystemSettings(): Promise<SystemSettingsResponse> {
  const K = APP_SETTING_KEYS;
  const D = DEFAULT_SYSTEM_SETTINGS;
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          K.MAINTENANCE_MODE, K.MAINTENANCE_MESSAGE, K.MIN_JOB_PRICE, K.MAX_JOB_PRICE,
          K.CANCELLATION_FEE, K.FREE_CANCEL_MINUTES, K.MAX_ACTIVE_JOBS_PER_DRIVER,
          K.MAX_SCHEDULE_DAYS, K.MIN_DISTANCE_KM, K.MAX_DISTANCE_KM, K.VERIFY_SLA_HOURS,
          K.IDLE_NUDGE_DAYS, K.PENDING_PAYMENT_EXPIRE_DAYS, K.REFERRAL_REWARD, K.DRIVER_WEEKLY_GOAL, K.SUPPORT_PHONE,
          K.SUPPORT_LINE_ID, K.SUPPORT_EMAIL, K.PAY_BANK_NAME, K.PAY_ACCOUNT_NAME,
          K.PAY_ACCOUNT_NUMBER, K.PAY_QR_URL, K.COMPANY_NAME, K.COMPANY_ADDRESS,
          K.COMPANY_TAX_ID, K.COMPANY_LOGO_URL, K.TERMS_VERSION, K.PRIVACY_VERSION,
          K.PROHIBITED_ITEMS_LIST, K.ADMIN_LINE_GROUP_ID,
        ],
      },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (k: string, fallback: number) => {
    const v = map.get(k);
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const str = (k: string, fallback: string) => map.get(k) ?? fallback;
  return {
    maintenanceMode: map.get(K.MAINTENANCE_MODE) === 'true',
    maintenanceMessage: str(K.MAINTENANCE_MESSAGE, D.maintenanceMessage),
    minJobPrice: num(K.MIN_JOB_PRICE, D.minJobPrice),
    maxJobPrice: num(K.MAX_JOB_PRICE, D.maxJobPrice),
    cancellationFee: num(K.CANCELLATION_FEE, D.cancellationFee),
    freeCancelMinutes: num(K.FREE_CANCEL_MINUTES, D.freeCancelMinutes),
    maxActiveJobsPerDriver: num(K.MAX_ACTIVE_JOBS_PER_DRIVER, D.maxActiveJobsPerDriver),
    maxScheduleDays: num(K.MAX_SCHEDULE_DAYS, D.maxScheduleDays),
    minDistanceKm: num(K.MIN_DISTANCE_KM, D.minDistanceKm),
    maxDistanceKm: num(K.MAX_DISTANCE_KM, D.maxDistanceKm),
    verifySlaHours: num(K.VERIFY_SLA_HOURS, D.verifySlaHours),
    idleNudgeDays: num(K.IDLE_NUDGE_DAYS, D.idleNudgeDays),
    pendingPaymentExpireDays: num(K.PENDING_PAYMENT_EXPIRE_DAYS, D.pendingPaymentExpireDays),
    referralRewardThb: num(K.REFERRAL_REWARD, D.referralRewardThb),
    driverWeeklyGoal: num(K.DRIVER_WEEKLY_GOAL, D.driverWeeklyGoal),
    supportPhone: str(K.SUPPORT_PHONE, D.supportPhone),
    supportLineId: str(K.SUPPORT_LINE_ID, D.supportLineId),
    supportEmail: str(K.SUPPORT_EMAIL, D.supportEmail),
    payBankName: str(K.PAY_BANK_NAME, D.payBankName),
    payAccountName: str(K.PAY_ACCOUNT_NAME, D.payAccountName),
    payAccountNumber: str(K.PAY_ACCOUNT_NUMBER, D.payAccountNumber),
    payQrUrl: str(K.PAY_QR_URL, D.payQrUrl),
    companyName: str(K.COMPANY_NAME, D.companyName),
    companyAddress: str(K.COMPANY_ADDRESS, D.companyAddress),
    companyTaxId: str(K.COMPANY_TAX_ID, D.companyTaxId),
    companyLogoUrl: str(K.COMPANY_LOGO_URL, D.companyLogoUrl),
    termsVersion: str(K.TERMS_VERSION, D.termsVersion),
    privacyVersion: str(K.PRIVACY_VERSION, D.privacyVersion),
    prohibitedItemsList: str(K.PROHIBITED_ITEMS_LIST, D.prohibitedItemsList),
    adminLineGroupId: str(K.ADMIN_LINE_GROUP_ID, D.adminLineGroupId),
  };
}

/** LINE group/room/user ID the OA pushes ops alerts to. '' when not configured. */
export async function getAdminLineGroupId(): Promise<string> {
  const row = await prisma.appSetting.findUnique({
    where: { key: APP_SETTING_KEYS.ADMIN_LINE_GROUP_ID },
  });
  return row?.value ?? '';
}

export async function updateSystemSettings(patch: UpdateSystemSettingsInput): Promise<void> {
  const K = APP_SETTING_KEYS;
  const entries: Array<[string, string]> = [];
  const put = (key: string, v: string | number | boolean | undefined) => {
    if (v !== undefined) entries.push([key, String(v)]);
  };
  put(K.MAINTENANCE_MODE, patch.maintenanceMode);
  put(K.MAINTENANCE_MESSAGE, patch.maintenanceMessage);
  put(K.MIN_JOB_PRICE, patch.minJobPrice);
  put(K.MAX_JOB_PRICE, patch.maxJobPrice);
  put(K.CANCELLATION_FEE, patch.cancellationFee);
  put(K.FREE_CANCEL_MINUTES, patch.freeCancelMinutes);
  put(K.MAX_ACTIVE_JOBS_PER_DRIVER, patch.maxActiveJobsPerDriver);
  put(K.MAX_SCHEDULE_DAYS, patch.maxScheduleDays);
  put(K.MIN_DISTANCE_KM, patch.minDistanceKm);
  put(K.MAX_DISTANCE_KM, patch.maxDistanceKm);
  put(K.VERIFY_SLA_HOURS, patch.verifySlaHours);
  put(K.IDLE_NUDGE_DAYS, patch.idleNudgeDays);
  put(K.PENDING_PAYMENT_EXPIRE_DAYS, patch.pendingPaymentExpireDays);
  put(K.REFERRAL_REWARD, patch.referralRewardThb);
  put(K.DRIVER_WEEKLY_GOAL, patch.driverWeeklyGoal);
  put(K.SUPPORT_PHONE, patch.supportPhone);
  put(K.SUPPORT_LINE_ID, patch.supportLineId);
  put(K.SUPPORT_EMAIL, patch.supportEmail);
  put(K.PAY_BANK_NAME, patch.payBankName);
  put(K.PAY_ACCOUNT_NAME, patch.payAccountName);
  put(K.PAY_ACCOUNT_NUMBER, patch.payAccountNumber);
  put(K.PAY_QR_URL, patch.payQrUrl);
  put(K.COMPANY_NAME, patch.companyName);
  put(K.COMPANY_ADDRESS, patch.companyAddress);
  put(K.COMPANY_TAX_ID, patch.companyTaxId);
  put(K.COMPANY_LOGO_URL, patch.companyLogoUrl);
  put(K.TERMS_VERSION, patch.termsVersion);
  put(K.PRIVACY_VERSION, patch.privacyVersion);
  put(K.PROHIBITED_ITEMS_LIST, patch.prohibitedItemsList);
  put(K.ADMIN_LINE_GROUP_ID, patch.adminLineGroupId);
  await Promise.all(
    entries.map(([key, value]) =>
      prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
}
