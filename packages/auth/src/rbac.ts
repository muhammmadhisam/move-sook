import type { Role } from '@movesook/shared';

/**
 * Framework-agnostic RBAC core. The Hono middleware in apps/api wraps these
 * (requireRole / requireSystem); keeping the logic here makes it unit-testable
 * and reusable by clients deciding what to render.
 *
 * No implicit hierarchy: ADMIN is NOT automatically a DRIVER. Each route
 * declares exactly which roles may pass. (SYSTEM is handled by a separate
 * static-key path, never via JWT role checks.)
 */
export function hasRole(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}

export class ForbiddenError extends Error {
  constructor(
    public readonly role: Role,
    public readonly allowed: readonly Role[],
  ) {
    super(`role ${role} not in [${allowed.join(', ')}]`);
    this.name = 'ForbiddenError';
  }
}

export function assertRole(role: Role, allowed: readonly Role[]): void {
  if (!hasRole(role, allowed)) throw new ForbiddenError(role, allowed);
}

/** Constant-time-ish compare for the SYSTEM static API key. */
export function isValidSystemKey(provided: string | undefined, expected: string): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
