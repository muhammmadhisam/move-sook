import { prisma, type Prisma } from '@movesook/db';
import {
  getCommissionPct,
  setCommissionPct,
  getPricePerKm,
  setPricePerKm,
  getFloorSurcharge,
  setFloorSurcharge,
  getHelperSurcharge,
  setHelperSurcharge,
  getSurgeEnabled,
  setSurgeEnabled,
  getSurgeMultiplier,
  setSurgeMultiplier,
  getSystemSettings,
  updateSystemSettings,
  writeAudit,
  pageArgs,
  orderByOf,
} from '@movesook/services/support';
import type {
  UpdateCommissionInput,
  UpdatePricingInput,
  UpdateSystemSettingsInput,
  AdminListAuditLogsQuery,
  CommissionSettingResponse,
  PricingSettingResponse,
  SystemSettingsResponse,
  AuditLogDto,
} from '@movesook/shared';

/** Read commission %. */
export async function getCommission(): Promise<CommissionSettingResponse> {
  return { commissionPct: await getCommissionPct() };
}

/** Update commission %. */
export async function updateCommission(
  sub: string,
  input: UpdateCommissionInput,
): Promise<CommissionSettingResponse> {
  const { commissionPct } = input;
  const previous = await getCommissionPct();
  await setCommissionPct(commissionPct);
  await writeAudit({
    actorId: sub,
    action: 'settings.commission',
    targetType: 'setting',
    targetId: 'commission_pct',
    metadata: { from: previous, to: commissionPct },
  });
  return { commissionPct };
}

/** Read delivery price per km + surcharges + surge. */
export async function getPricing(): Promise<PricingSettingResponse> {
  const [pricePerKm, floorSurcharge, helperSurcharge, surgeEnabled, surgeMultiplier] =
    await Promise.all([
      getPricePerKm(),
      getFloorSurcharge(),
      getHelperSurcharge(),
      getSurgeEnabled(),
      getSurgeMultiplier(),
    ]);
  return {
    pricePerKm,
    floorSurcharge,
    helperSurcharge,
    surgeEnabled,
    surgeMultiplier,
  };
}

/** Update delivery rate / surcharges / surge (each field optional — partial patch). */
export async function updatePricing(
  sub: string,
  input: UpdatePricingInput,
): Promise<PricingSettingResponse> {
  const [prevPrice, prevFloor, prevHelper, prevSurgeOn, prevSurgeMult] = await Promise.all([
    getPricePerKm(),
    getFloorSurcharge(),
    getHelperSurcharge(),
    getSurgeEnabled(),
    getSurgeMultiplier(),
  ]);

  const changes: Record<string, { from: number | boolean; to: number | boolean }> = {};
  if (input.pricePerKm !== undefined) {
    await setPricePerKm(input.pricePerKm);
    changes.price_per_km = { from: prevPrice, to: input.pricePerKm };
  }
  if (input.floorSurcharge !== undefined) {
    await setFloorSurcharge(input.floorSurcharge);
    changes.floor_surcharge = { from: prevFloor, to: input.floorSurcharge };
  }
  if (input.helperSurcharge !== undefined) {
    await setHelperSurcharge(input.helperSurcharge);
    changes.helper_surcharge = { from: prevHelper, to: input.helperSurcharge };
  }
  if (input.surgeEnabled !== undefined) {
    await setSurgeEnabled(input.surgeEnabled);
    changes.surge_enabled = { from: prevSurgeOn, to: input.surgeEnabled };
  }
  if (input.surgeMultiplier !== undefined) {
    await setSurgeMultiplier(input.surgeMultiplier);
    changes.surge_multiplier = { from: prevSurgeMult, to: input.surgeMultiplier };
  }
  await writeAudit({
    actorId: sub,
    action: 'settings.pricing',
    targetType: 'setting',
    targetId: 'pricing',
    metadata: changes,
  });

  return {
    pricePerKm: input.pricePerKm ?? prevPrice,
    floorSurcharge: input.floorSurcharge ?? prevFloor,
    helperSurcharge: input.helperSurcharge ?? prevHelper,
    surgeEnabled: input.surgeEnabled ?? prevSurgeOn,
    surgeMultiplier: input.surgeMultiplier ?? prevSurgeMult,
  };
}

/** System settings (misc scalars). */
export async function getSystem(): Promise<SystemSettingsResponse> {
  return getSystemSettings();
}

export async function updateSystem(
  sub: string,
  patch: UpdateSystemSettingsInput,
): Promise<SystemSettingsResponse> {
  await updateSystemSettings(patch);
  await writeAudit({
    actorId: sub,
    action: 'settings.system',
    targetType: 'setting',
    targetId: 'system',
    metadata: patch,
  });
  return getSystemSettings();
}

export type AuditLogListResponse = {
  items: AuditLogDto[];
  total: number;
  page: number;
  pageSize: number;
};

/** Audit trail of admin actions. */
export async function listAuditLogs(
  q: AdminListAuditLogsQuery,
): Promise<AuditLogListResponse> {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: q.action } : {}),
    ...(q.targetType ? { targetType: q.targetType } : {}),
    ...(q.targetId ? { targetId: q.targetId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: orderByOf(q.sortBy, q.sortDir, ['createdAt', 'action', 'targetType'], 'createdAt'),
      ...pageArgs(q),
      include: { actor: { select: { displayName: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const items: AuditLogDto[] = rows.map((r) => ({
    id: r.id,
    actorId: r.actorId,
    actorName: r.actor.displayName,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    metadata: r.metadata ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
  return { items, total, page: q.page, pageSize: q.pageSize };
}
