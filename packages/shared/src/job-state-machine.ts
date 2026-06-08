import type { JobStatus } from './enums';

// Single source of truth for legal job status transitions.
// The API enforces this on PATCH /jobs/:id/status; the client uses it to
// decide which action buttons to show. Prevents illegal jumps such as
// POSTED -> DELIVERED.
export const JOB_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  DRAFT: ['PENDING_PAYMENT', 'POSTED', 'CANCELLED'],
  // Customer uploads a transfer slip; an admin approves payment (-> POSTED, public)
  // or the customer cancels. Drivers never see a job in this state.
  PENDING_PAYMENT: ['POSTED', 'CANCELLED'],
  POSTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['PENDING_CONFIRMATION', 'CANCELLED'],
  // Driver claims delivery; admin confirms (-> DELIVERED) or sends back (-> IN_TRANSIT).
  PENDING_CONFIRMATION: ['DELIVERED', 'IN_TRANSIT', 'CANCELLED'],
  DELIVERED: [], // terminal
  CANCELLED: [], // terminal
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

/**
 * Statuses a driver is allowed to advance a job to (excludes CANCELLED admin paths).
 * Note: DELIVERED is intentionally NOT here — only an admin confirms delivery success.
 * A driver advances up to PENDING_CONFIRMATION.
 */
export const DRIVER_ADVANCEABLE: readonly JobStatus[] = [
  'ACCEPTED',
  'PICKED_UP',
  'IN_TRANSIT',
  'PENDING_CONFIRMATION',
];

export function isTerminalStatus(status: JobStatus): boolean {
  return JOB_TRANSITIONS[status].length === 0;
}

/**
 * Statuses where a job is actively "in the driver's hands" — they have accepted
 * it and are collecting/transporting. A driver may NOT go off-duty (พักงาน) while
 * holding such a job. PENDING_CONFIRMATION is excluded: the driver has already
 * delivered and is only awaiting admin confirmation, so they're free to rest.
 */
export const DRIVER_IN_HAND: readonly JobStatus[] = ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT'];

export function isInHand(status: JobStatus): boolean {
  return DRIVER_IN_HAND.includes(status);
}
