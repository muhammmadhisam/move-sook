'use client';

import { useQuery } from '@tanstack/react-query';
import { vehicleTypeLabel, type JobPricingResponse } from '@movesook/shared';
import { api } from '@/lib/api';

/**
 * Vehicle types are an admin-managed catalog (VehiclePricing) whose display name lives in
 * `label`, NOT the built-in VEHICLE_TYPE_LABEL map — so custom slugs (e.g. "TRUCK_4W_JB")
 * render raw unless we pass that label as the `vehicleTypeLabel` override. This hook fetches
 * the public pricing catalog once (react-query dedupes the `['jobs','pricing']` query) and
 * returns a resolver for showing the Thai label.
 */
export function useVehicleLabels() {
  const pricing = useQuery({
    queryKey: ['jobs', 'pricing'],
    queryFn: async (): Promise<JobPricingResponse> => {
      const res = await api.jobs.pricing.$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as JobPricingResponse;
    },
  });

  const vehicleLabelOf = (vehicleType: string) =>
    vehicleTypeLabel(vehicleType, pricing.data?.rates.find((r) => r.vehicleType === vehicleType)?.label);

  return { pricing, vehicleLabelOf };
}
