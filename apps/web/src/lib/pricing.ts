// Public vehicle pricing for the marketing /pricing page. Rates are managed in
// the admin app (VehiclePricing table) and served by the API's public
// /system/vehicle-pricing route, so the page reflects live admin changes.
import { api } from './api';
import type { PublicVehicleRate } from '@movesook/shared';

// What the page renders: the real active catalog. A label is guaranteed; per-km
// rates may be null when an admin hasn't set them yet (shown as "ask us").
export type VehicleRate = {
  vehicleType: PublicVehicleRate['vehicleType'];
  label: string;
  description: string | null;
  pricePerKm: number | null;
  pricePerKmShared: number | null;
};

/**
 * Active vehicle types, cheapest-first, exactly as configured in admin. Drops
 * only rows with no label. Returns [] if the API is unreachable so the page can
 * show a graceful notice (we never invent rates the operator didn't set).
 */
export async function getVehicleRates(): Promise<VehicleRate[]> {
  try {
    const res = await api.system['vehicle-pricing'].$get();
    if (!res.ok) return [];
    const data = (await res.json()) as { items: PublicVehicleRate[] };
    return data.items.flatMap((v) =>
      v.label != null
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
