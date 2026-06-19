// Public vehicle pricing for the marketing /pricing page. Rates are managed in
// the admin app (VehiclePricing table) and served by the API's public
// /system/vehicle-pricing route, so the page reflects live admin changes.
import { api } from './api';
import type { VehiclePricingDto } from '@movesook/shared';

// Narrowed shape the page renders: a label and both per-km rates are guaranteed
// present (rows missing them are dropped in getVehicleRates).
export type VehicleRate = {
  vehicleType: VehiclePricingDto['vehicleType'];
  label: string;
  description: string | null;
  pricePerKm: number;
  pricePerKmShared: number;
};

/**
 * Active vehicle types + per-km rates, cheapest-first. Drops rows missing a
 * label or either rate. Returns [] if the API is unreachable so the page can
 * fall back to a static notice.
 */
export async function getVehicleRates(): Promise<VehicleRate[]> {
  try {
    const res = await api.system['vehicle-pricing'].$get();
    if (!res.ok) return [];
    const data = (await res.json()) as { items: VehiclePricingDto[] };
    return data.items.flatMap((v) =>
      v.label != null && v.pricePerKm != null && v.pricePerKmShared != null
        ? [
            {
              vehicleType: v.vehicleType,
              label: v.label,
              description: v.description,
              pricePerKm: v.pricePerKm,
              pricePerKmShared: v.pricePerKmShared,
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}
