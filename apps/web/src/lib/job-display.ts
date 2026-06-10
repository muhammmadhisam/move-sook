import type { JobDto, JobStatus } from '@movesook/shared';
import type { LatLng } from '@/components/job-route-map';

// Thai enum labels are centralised in @movesook/shared; re-export so existing
// imports from this module keep working.
export { JOB_STATUS_LABEL } from '@movesook/shared';

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning';

export const JOB_STATUS_VARIANT: Record<JobStatus, BadgeVariant> = {
  DRAFT: 'secondary',
  PENDING_PAYMENT: 'warning',
  POSTED: 'warning',
  ACCEPTED: 'default',
  PICKED_UP: 'default',
  IN_TRANSIT: 'default',
  PENDING_CONFIRMATION: 'warning',
  DELIVERED: 'success',
  FLAGGED_ILLEGAL: 'destructive',
  CANCELLED: 'destructive',
};

/**
 * Next forward status a driver advances a job to, or null at a terminal/forward end.
 * Drivers stop at PENDING_CONFIRMATION — an admin confirms DELIVERED.
 */
export function nextForwardStatus(status: JobStatus): JobStatus | null {
  switch (status) {
    case 'ACCEPTED':
      return 'PICKED_UP';
    case 'PICKED_UP':
      return 'IN_TRANSIT';
    case 'IN_TRANSIT':
      return 'PENDING_CONFIRMATION';
    default:
      return null;
  }
}

export function toLatLng(lat: number | null, lng: number | null): LatLng | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

export function jobOrigin(job: JobDto): LatLng | null {
  return toLatLng(job.originLat, job.originLng);
}

export function jobDest(job: JobDto): LatLng | null {
  return toLatLng(job.destLat, job.destLng);
}
