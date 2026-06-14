import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { verifyJwt, signJwt, hasRole, isValidSystemKey } from '@movesook/auth';
import {
  SYSTEM_KEY_HEADER,
  USER_JWT_TTL_SEC,
  ADMIN_JWT_TTL_SEC,
  type AdminRole,
  type Role,
} from '@movesook/shared';
import { prisma } from '@movesook/db';
import { env } from '../config';
import { setSessionCookie } from '../lib/cookies';
import type { AppEnv } from '../lib/context';

type CookieKind = 'user' | 'admin';

/**
 * Verify the JWT from the appropriate cookie and attach claims.
 * `user` and `admin` sessions live in separate cookies so they never collide.
 *
 * Sliding refresh: once a valid token has aged past a quarter of its lifetime,
 * mint a fresh one and re-set the cookie. Refreshing eagerly (rather than only
 * past half-life) means even a client that mostly serves cached reads keeps the
 * cookie rolling on the few requests it does make. Active sessions never expire
 * mid-use; idle ones still lapse after the full TTL since the last request. No
 * separate refresh token — the self-signed JWT in the httpOnly cookie rolls
 * forward on its own.
 */
export function authenticate(kind: CookieKind) {
  const cookieName = kind === 'admin' ? env.ADMIN_COOKIE_NAME : env.USER_COOKIE_NAME;
  const ttlSec = kind === 'admin' ? ADMIN_JWT_TTL_SEC : USER_JWT_TTL_SEC;
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, cookieName);
    if (!token) throw new HTTPException(401, { message: 'Not authenticated' });

    const result = await verifyJwt(token, env.JWT_SECRET);
    if (!result.ok) {
      throw new HTTPException(401, {
        message: result.reason === 'expired' ? 'Session expired' : 'Invalid session',
      });
    }
    const { claims } = result;

    // Roll the session forward once it has aged past a quarter of its lifetime.
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp !== undefined && claims.exp - now < (ttlSec * 3) / 4) {
      const fresh = await signJwt({
        sub: claims.sub,
        role: claims.role,
        secret: env.JWT_SECRET,
        ttlSec,
      });
      setSessionCookie(c, cookieName, fresh, ttlSec);
    }

    c.set('claims', claims);
    await next();
  });
}

/** Assert the authenticated user holds one of the allowed roles (else 403). */
export function requireRole(...allowed: Role[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const claims = c.get('claims');
    if (!claims || !hasRole(claims.role, allowed)) {
      throw new HTTPException(403, { message: 'Forbidden' });
    }
    await next();
  });
}

/**
 * Assert the authenticated admin holds one of the allowed admin tiers.
 * Reads `AdminCredential.adminRole` (the JWT only carries the coarse Role).
 * Must run after `authenticate('admin')` + `requireRole('ADMIN')`.
 */
export function requireAdminRole(...allowed: AdminRole[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const claims = c.get('claims');
    const cred = await prisma.adminCredential.findUnique({
      where: { userId: claims.sub },
      select: { adminRole: true },
    });
    if (!cred || !allowed.includes(cred.adminRole)) {
      throw new HTTPException(403, { message: 'Insufficient admin role' });
    }
    await next();
  });
}

/** Static-key guard for SYSTEM (webhooks / cron). Never uses a JWT. */
export const requireSystem = createMiddleware<AppEnv>(async (c, next) => {
  const provided = c.req.header(SYSTEM_KEY_HEADER);
  if (!isValidSystemKey(provided, env.SYSTEM_API_KEY)) {
    throw new HTTPException(401, { message: 'Invalid system key' });
  }
  await next();
});
