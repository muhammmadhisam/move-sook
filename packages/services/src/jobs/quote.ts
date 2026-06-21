import { prisma } from '@movesook/db';
import {
  clampJobPrice,
  computeJobQuote,
  haversineKm,
  type EstimateJobInput,
  type EstimateJobResponse,
  type JobPricingResponse,
  type JobServiceAreasResponse,
} from '@movesook/shared';
import {
  evaluatePromo,
  getBaseFare,
  getEffectiveFlatRate,
  getEffectivePerItemRate,
  getEffectivePricePerKm,
  getEffectivePricePerKmShared,
  getFloorSurcharge,
  getHelperSurcharge,
  getSurge,
  getSystemSettings,
} from '@movesook/services/support';

// Public, read-only pricing / quoting surface for the jobs domain.
// HTTP routing lives in apps/api/src/routes/jobs.ts — these take validated input
// and return wire DTOs (or throw HTTPException).

/** Price-per-km per vehicle type — used by the web summary screen (read-only display).
 *  The catalog drives the list: one rate per VehiclePricing row. Inactive rows are
 *  still returned so clients can surface a closed type's label. */
export async function getPricing(): Promise<JobPricingResponse> {
  const rows = await prisma.vehiclePricing.findMany({
    orderBy: [{ isActive: 'desc' }, { vehicleType: 'asc' }],
  });
  const rates = await Promise.all(
    rows.map(async (row) => ({
      vehicleType: row.vehicleType,
      label: row.label ?? null,
      imageUrl: row.imageUrl ?? null,
      pricePerKm: await getEffectivePricePerKm(row.vehicleType),
      isActive: row.isActive,
    })),
  );
  return { rates };
}

/** Provinces the platform serves — used by the posting form to constrain the
 *  origin-province picker. When no ServiceArea rows are configured, every
 *  province is allowed (unrestricted=true). */
export async function getServiceAreas(): Promise<JobServiceAreasResponse> {
  const rows = await prisma.serviceArea.findMany({ orderBy: { province: 'asc' } });
  return {
    unrestricted: rows.length === 0,
    provinces: rows.filter((r) => r.isActive).map((r) => r.province),
  };
}

/** Full itemised quote for a specific trip (distance base + floor/helper surcharges)
 *  plus an optional promo-code preview. Mirrors what POST /jobs charges so the
 *  customer sees the real price before posting. */
export async function estimateJob(
  input: EstimateJobInput,
  userId?: string | null,
): Promise<EstimateJobResponse> {
  const [baseFare, pricePerKm, pricePerKmShared, floorSurcharge, helperSurcharge, surge, flatRate, perItemRate, sys] =
    await Promise.all([
      getBaseFare(),
      getEffectivePricePerKm(input.vehicleType),
      getEffectivePricePerKmShared(input.vehicleType),
      getFloorSurcharge(),
      getHelperSurcharge(),
      getSurge(input.originProvince),
      getEffectiveFlatRate(input.vehicleType),
      getEffectivePerItemRate(input.vehicleType),
      getSystemSettings(),
    ]);
  const distanceKm = haversineKm(input.originLat, input.originLng, input.destLat, input.destLng);
  const quote = computeJobQuote({
    pricingMode: input.pricingMode,
    distanceKm,
    baseFare,
    pricePerKm,
    pricePerKmShared,
    originFloor: input.originFloor,
    originHasElevator: input.originHasElevator,
    destFloor: input.destFloor,
    destHasElevator: input.destHasElevator,
    needsHelpers: input.needsHelpers,
    floorSurcharge,
    helperSurcharge,
    surgeMultiplier: surge.multiplier,
    flatRate,
    perItemRate,
    itemCount: input.itemCount,
  });

  // Promo is preview-only here — usedCount is incremented only at job creation.
  // Pass the (optional) session user so a logged-in customer sees a discount from a
  // code restricted to them; anonymous callers can't preview customer-locked codes.
  const promo = await evaluatePromo(input.promoCode, quote.subtotal, userId);
  const discountAmount = promo?.ok ? promo.discount : 0;

  return {
    pricingMode: quote.pricingMode,
    distanceKm: Number(distanceKm.toFixed(2)),
    // Report the per-km rate actually applied to the base: the cheaper non-charter
    // rate for PER_ITEM, the full charter rate otherwise.
    pricePerKm: quote.pricingMode === 'PER_ITEM' ? pricePerKmShared : pricePerKm,
    baseFare: quote.baseFare,
    base: quote.base,
    flatRate: quote.flatRate,
    itemsCharge: quote.itemsCharge,
    floorSurcharge: quote.floorSurcharge,
    helperSurcharge: quote.helperSurcharge,
    surgeMultiplier: quote.surgeMultiplier,
    surgeActive: surge.active,
    subtotal: quote.subtotal,
    promoCode: promo?.ok ? input.promoCode!.trim().toUpperCase() : null,
    discountAmount,
    total: clampJobPrice(
      Math.max(0, quote.subtotal - discountAmount),
      sys.minJobPrice,
      sys.maxJobPrice,
    ),
    promoError: promo && !promo.ok ? promo.reason : null,
  };
}
