import { describe, it, expect } from 'vitest';
import { hasRole, assertRole, ForbiddenError, isValidSystemKey } from '../rbac';

describe('rbac', () => {
  it('allows listed roles', () => {
    expect(hasRole('ADMIN', ['ADMIN'])).toBe(true);
    expect(hasRole('DRIVER', ['USER', 'DRIVER'])).toBe(true);
  });

  it('does not grant ADMIN driver access implicitly', () => {
    expect(hasRole('ADMIN', ['DRIVER'])).toBe(false);
  });

  it('assertRole throws ForbiddenError', () => {
    expect(() => assertRole('USER', ['ADMIN'])).toThrow(ForbiddenError);
    expect(() => assertRole('ADMIN', ['ADMIN'])).not.toThrow();
  });

  it('validates system key by constant compare', () => {
    expect(isValidSystemKey('abc123', 'abc123')).toBe(true);
    expect(isValidSystemKey('abc123', 'abc124')).toBe(false);
    expect(isValidSystemKey('', 'abc')).toBe(false);
    expect(isValidSystemKey(undefined, 'abc')).toBe(false);
    expect(isValidSystemKey('short', 'longerkey')).toBe(false);
  });
});
