import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_CANCELLABLE,
  DRIVER_ADVANCEABLE,
  DRIVER_IN_HAND,
  JOB_TRANSITIONS,
  canTransition,
  isCustomerCancellable,
  isCustomerConfirmable,
  isInHand,
  isTerminalStatus,
} from '../job-state-machine';
import { JobStatusSchema } from '../enums';

const ALL = JobStatusSchema.options;

describe('canTransition', () => {
  it('allows the happy-path delivery flow', () => {
    expect(canTransition('DRAFT', 'PENDING_PAYMENT')).toBe(true);
    expect(canTransition('PENDING_PAYMENT', 'POSTED')).toBe(true);
    expect(canTransition('POSTED', 'ACCEPTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'PICKED_UP')).toBe(true);
    expect(canTransition('PICKED_UP', 'IN_TRANSIT')).toBe(true);
    expect(canTransition('IN_TRANSIT', 'PENDING_CONFIRMATION')).toBe(true);
    expect(canTransition('PENDING_CONFIRMATION', 'DELIVERED')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('POSTED', 'DELIVERED')).toBe(false);
    expect(canTransition('PENDING_PAYMENT', 'ACCEPTED')).toBe(false);
    expect(canTransition('ACCEPTED', 'DELIVERED')).toBe(false);
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransition('CANCELLED', 'POSTED')).toBe(false);
  });

  it('allows admin send-back from PENDING_CONFIRMATION', () => {
    expect(canTransition('PENDING_CONFIRMATION', 'IN_TRANSIT')).toBe(true);
  });

  it('allows FLAGGED_ILLEGAL only from in-hand states, resolving only to CANCELLED', () => {
    for (const from of ALL) {
      expect(canTransition(from, 'FLAGGED_ILLEGAL')).toBe(DRIVER_IN_HAND.includes(from));
    }
    expect(JOB_TRANSITIONS.FLAGGED_ILLEGAL).toEqual(['CANCELLED']);
  });

  it('PENDING_PAYMENT jobs can be cancelled (auto-expiry path)', () => {
    expect(canTransition('PENDING_PAYMENT', 'CANCELLED')).toBe(true);
  });
});

describe('terminal statuses', () => {
  it('DELIVERED and CANCELLED are the only terminals', () => {
    expect(ALL.filter(isTerminalStatus)).toEqual(['DELIVERED', 'CANCELLED']);
  });
});

describe('driver permissions', () => {
  it('a driver can never advance to DELIVERED — that is admin-only', () => {
    expect(DRIVER_ADVANCEABLE).not.toContain('DELIVERED');
  });

  it('every driver-advanceable target is a legal transition from some state', () => {
    for (const to of DRIVER_ADVANCEABLE) {
      expect(ALL.some((from) => canTransition(from, to))).toBe(true);
    }
  });

  it('in-hand excludes PENDING_CONFIRMATION (driver may rest while awaiting admin)', () => {
    expect(DRIVER_IN_HAND).toEqual(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);
    expect(isInHand('PENDING_CONFIRMATION')).toBe(false);
  });
});

describe('customer permissions', () => {
  it('customer may cancel only before pickup', () => {
    expect(CUSTOMER_CANCELLABLE).toEqual(['DRAFT', 'PENDING_PAYMENT', 'POSTED', 'ACCEPTED']);
    expect(isCustomerCancellable('PICKED_UP')).toBe(false);
    expect(isCustomerCancellable('DELIVERED')).toBe(false);
  });

  it('customer may confirm receipt only while delivery is underway', () => {
    expect(isCustomerConfirmable('IN_TRANSIT')).toBe(true);
    expect(isCustomerConfirmable('PENDING_CONFIRMATION')).toBe(true);
    expect(isCustomerConfirmable('ACCEPTED')).toBe(false);
    expect(isCustomerConfirmable('DELIVERED')).toBe(false);
  });

  it('every customer-cancellable state can legally transition to CANCELLED', () => {
    for (const from of CUSTOMER_CANCELLABLE) {
      expect(canTransition(from, 'CANCELLED')).toBe(true);
    }
  });
});
