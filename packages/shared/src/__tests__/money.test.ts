import { describe, expect, it } from 'vitest';
import { computeCommission } from '../schemas/transaction';
import { computeDiscount } from '../schemas/promo';
import {
  DEFAULT_COMMISSION_PCT,
  clampJobPrice,
  computeJobQuote,
  estimateJobPrice,
} from '../constants';

describe('computeCommission', () => {
  it('splits gross into commission + net with rounding', () => {
    const { commissionAmount, netToDriver } = computeCommission(900, DEFAULT_COMMISSION_PCT);
    expect(commissionAmount).toBe(108); // 12% of 900
    expect(netToDriver).toBe(792);
  });

  it('always reconstructs the gross exactly (no satang lost)', () => {
    for (const gross of [1, 99, 333, 1001, 999_999]) {
      for (const pct of [0, 5, 12, 12.5, 100]) {
        const { commissionAmount, netToDriver } = computeCommission(gross, pct);
        expect(commissionAmount + netToDriver).toBe(gross);
      }
    }
  });

  it('rounds the commission to whole THB', () => {
    // 12% of 333 = 39.96 → 40
    expect(computeCommission(333, 12).commissionAmount).toBe(40);
  });
});

describe('computeDiscount', () => {
  it('PERCENT discounts round to whole THB', () => {
    expect(computeDiscount(900, 'PERCENT', 10)).toBe(90);
    expect(computeDiscount(333, 'PERCENT', 10)).toBe(33);
  });

  it('FIXED discounts are capped at the price', () => {
    expect(computeDiscount(100, 'FIXED', 50)).toBe(50);
    expect(computeDiscount(100, 'FIXED', 500)).toBe(100);
  });

  it('zero / negative price yields no discount', () => {
    expect(computeDiscount(0, 'PERCENT', 50)).toBe(0);
    expect(computeDiscount(-10, 'FIXED', 50)).toBe(0);
  });
});

describe('clampJobPrice', () => {
  it('clamps into [min, max]', () => {
    expect(clampJobPrice(50, 100, 1000)).toBe(100);
    expect(clampJobPrice(5000, 100, 1000)).toBe(1000);
    expect(clampJobPrice(500, 100, 1000)).toBe(500);
  });

  it('max = 0 means no upper cap', () => {
    expect(clampJobPrice(5_000_000, 0, 0)).toBe(5_000_000);
  });
});

describe('estimateJobPrice', () => {
  it('distance × rate, rounded', () => {
    expect(estimateJobPrice(30, 20)).toBe(600);
    expect(estimateJobPrice(10.26, 20)).toBe(205);
  });

  it('non-positive or non-finite distance → 0', () => {
    expect(estimateJobPrice(0, 20)).toBe(0);
    expect(estimateJobPrice(-5, 20)).toBe(0);
    expect(estimateJobPrice(Number.NaN, 20)).toBe(0);
  });
});

describe('computeJobQuote', () => {
  const base = { distanceKm: 30, pricePerKm: 20 };

  it('CHARTER mode: distance base + flat rate, no per-item charge', () => {
    const q = computeJobQuote({ ...base, pricingMode: 'CHARTER', flatRate: 500 });
    expect(q.base).toBe(600);
    expect(q.flatRate).toBe(500);
    expect(q.itemsCharge).toBe(0);
    expect(q.subtotal).toBe(1100);
  });

  it('PER_ITEM mode: per-item rate × count, no flat rate', () => {
    const q = computeJobQuote({
      ...base,
      pricingMode: 'PER_ITEM',
      perItemRate: 50,
      itemCount: 4,
    });
    expect(q.itemsCharge).toBe(200);
    expect(q.flatRate).toBe(0);
    expect(q.subtotal).toBe(800);
  });

  it('floor surcharge applies per end, only without an elevator', () => {
    const q = computeJobQuote({
      ...base,
      floorSurcharge: 40,
      originFloor: 3,
      originHasElevator: false,
      destFloor: 5,
      destHasElevator: true, // lift removes the carry surcharge
    });
    expect(q.floorSurcharge).toBe(120); // origin only: 3 × 40
  });

  it('helper surcharge is a flat add-on', () => {
    const q = computeJobQuote({ ...base, needsHelpers: true, helperSurcharge: 300 });
    expect(q.helperSurcharge).toBe(300);
  });

  it('surge multiplies ONLY the distance base, not surcharges', () => {
    const q = computeJobQuote({
      ...base,
      surgeMultiplier: 1.2,
      needsHelpers: true,
      helperSurcharge: 300,
      originFloor: 2,
      floorSurcharge: 40,
    });
    expect(q.base).toBe(720); // 600 × 1.2
    expect(q.helperSurcharge).toBe(300); // not surged
    expect(q.floorSurcharge).toBe(80); // not surged
    expect(q.subtotal).toBe(720 + 300 + 80);
  });

  it('subtotal is always the sum of its parts', () => {
    const q = computeJobQuote({
      ...base,
      pricingMode: 'PER_ITEM',
      perItemRate: 50,
      itemCount: 3,
      surgeMultiplier: 1.5,
      needsHelpers: true,
    });
    expect(q.subtotal).toBe(
      q.base + q.flatRate + q.itemsCharge + q.floorSurcharge + q.helperSurcharge,
    );
  });
});
