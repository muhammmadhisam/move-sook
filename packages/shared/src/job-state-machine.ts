import type { JobStatus, PaymentMethod } from './enums';

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
  // From any in-hand state a driver may raise an illegal-cargo flag (-> FLAGGED_ILLEGAL).
  ACCEPTED: ['PICKED_UP', 'FLAGGED_ILLEGAL', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'FLAGGED_ILLEGAL', 'CANCELLED'],
  IN_TRANSIT: ['PENDING_CONFIRMATION', 'FLAGGED_ILLEGAL', 'CANCELLED'],
  // Driver claims delivery; admin confirms (-> DELIVERED) or sends back (-> IN_TRANSIT).
  PENDING_CONFIRMATION: ['DELIVERED', 'IN_TRANSIT', 'CANCELLED'],
  DELIVERED: [], // terminal
  // An admin reviews a flagged job and cancels it (no commission). Not driver-advanceable.
  FLAGGED_ILLEGAL: ['CANCELLED'],
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
 * Statuses from which a CUSTOMER may cancel their own job. The rule depends on the
 * payment method, because "the customer is now financially committed" lands at a
 * different point for each:
 *
 * - PREPAID: the customer transfers the full amount up-front, so once the slip is
 *   approved and the job is POSTED the money is already in the platform's hands.
 *   They may only bail out *before* paying — i.e. while still DRAFT / PENDING_PAYMENT.
 *   A POSTED or driver-assigned (ACCEPTED) prepaid job is no longer self-cancellable.
 * - COD: the customer never pays through the app (cash to the driver at the
 *   destination), so there is nothing to lose by cancelling right up until the
 *   goods are collected. They may cancel through POSTED and ACCEPTED, but not once
 *   the driver has PICKED_UP.
 *
 * Cancellations past these points are admin-driven.
 */
export const CUSTOMER_CANCELLABLE_PREPAID: readonly JobStatus[] = ['DRAFT', 'PENDING_PAYMENT'];
export const CUSTOMER_CANCELLABLE_COD: readonly JobStatus[] = ['DRAFT', 'POSTED', 'ACCEPTED'];

export function isCustomerCancellable(status: JobStatus, paymentMethod: PaymentMethod): boolean {
  const allowed =
    paymentMethod === 'COD' ? CUSTOMER_CANCELLABLE_COD : CUSTOMER_CANCELLABLE_PREPAID;
  return allowed.includes(status);
}

/**
 * Statuses where a CUSTOMER may confirm receipt of the goods. Only meaningful
 * once delivery is underway / has been claimed by the driver.
 */
export const CUSTOMER_CONFIRMABLE: readonly JobStatus[] = ['IN_TRANSIT', 'PENDING_CONFIRMATION'];

export function isCustomerConfirmable(status: JobStatus): boolean {
  return CUSTOMER_CONFIRMABLE.includes(status);
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
