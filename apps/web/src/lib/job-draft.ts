// Shared shape + storage for the "new job" draft autosaved in localStorage.
// Owned here (not in the page) so other entry points — e.g. the public pricing
// fare calculator — can pre-seed the same draft and the post-job wizard restores
// it on mount with zero extra logic.
import type { CargoCategory, JobItem, PricingMode, VehicleType } from '@movesook/shared';
import type { LatLng } from '@/components/job-route-map';

export const DRAFT_KEY = 'movesook:new-job-draft';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

// Tri-state for "has elevator": unknown keeps the field null on the server.
export type Lift = 'unknown' | 'yes' | 'no';

// What we autosave. Consent checkboxes are intentionally excluded so the customer
// always re-acknowledges the terms before posting.
export type JobDraft = {
  form: {
    vehicleType: VehicleType;
    contactPhone: string;
    notes: string;
    originAddress: string;
    originProvince: string;
    originFloor: string;
    destAddress: string;
    destProvince: string;
    destFloor: string;
    scheduledAt: string;
  };
  items: JobItem[];
  needsHelpers: boolean;
  originLift: Lift;
  destLift: Lift;
  origin: LatLng | null;
  dest: LatLng | null;
  scheduled: boolean;
  itemCategory: CargoCategory;
  pricingMode: PricingMode;
  promoCode: string;
  step: number;
};

/** Persist a draft (with TTL stamp) to localStorage; best-effort, never throws. */
export function saveJobDraft(draft: JobDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), draft }));
  } catch {
    // storage full / disabled — drafting is best-effort, never block the flow.
  }
}

/** The subset of a draft a completed fare estimate can fill in. */
export interface EstimatePrefill {
  vehicleType: VehicleType;
  pricingMode: PricingMode;
  needsHelpers: boolean;
  origin: LatLng | null;
  dest: LatLng | null;
  originAddress: string;
  originProvince: string;
  destAddress: string;
  destProvince: string;
}

/**
 * Build a new-job draft from a completed fare estimate so /app/jobs/new opens
 * with the route + vehicle already filled. Starts at step 1 (the items step,
 * which the calculator can't fill) so the customer only adds what's left.
 */
export function buildEstimatePrefill(p: EstimatePrefill): JobDraft {
  return {
    form: {
      vehicleType: p.vehicleType,
      contactPhone: '',
      notes: '',
      originAddress: p.originAddress,
      originProvince: p.originProvince,
      originFloor: '',
      destAddress: p.destAddress,
      destProvince: p.destProvince,
      destFloor: '',
      scheduledAt: '',
    },
    items: [],
    needsHelpers: p.needsHelpers,
    originLift: 'unknown',
    destLift: 'unknown',
    origin: p.origin,
    dest: p.dest,
    scheduled: false,
    itemCategory: 'GENERAL',
    pricingMode: p.pricingMode,
    promoCode: '',
    step: 1,
  };
}
