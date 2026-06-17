import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { getConnInfo } from '@hono/node-server/conninfo';
import {
  AdminLoginInput,
  DevLoginInput,
  LineLoginInput,
  SetupInput,
  USER_JWT_TTL_SEC,
  ADMIN_JWT_TTL_SEC,
} from '@movesook/shared';
import {
  AdminLoginRateLimited,
  adminLogin,
  createFirstAdmin,
  devLogin,
  lineLogin,
  needsSetup,
} from '@movesook/services/auth';
import { env, isProd } from '../config';
import type { AppEnv } from '../lib/context';
import { setSessionCookie, clearSessionCookie } from '../lib/cookies';

// Auth surface. Handlers are thin wrappers over @movesook/services/auth; the
// route owns the HTTP concerns — session-cookie writes, logout, the `isProd`
// dev-login gate, and the rate-limit `Retry-After` header.
export const authRoutes = new Hono<AppEnv>()
  // USER / DRIVER login via LINE id_token (from LIFF).
  .post('/line', zValidator('json', LineLoginInput), async (c) => {
    const { token, user } = await lineLogin(c.req.valid('json'));
    setSessionCookie(c, env.USER_COOKIE_NAME, token, USER_JWT_TTL_SEC);
    return c.json({ id: user.id, role: user.role });
  })

  // ADMIN login via email + password (separate cookie, rate-limited).
  .post('/admin/login', zValidator('json', AdminLoginInput), async (c) => {
    const input = c.req.valid('json');
    // Key the lockout on the email (the meaningful per-account brute-force bound)
    // plus the TCP peer address from the socket. The peer is the immediate client
    // (or the trusted reverse proxy) and cannot be spoofed by an attacker-supplied
    // `x-forwarded-for` header — which the old key trusted, letting an attacker
    // mint a fresh bucket per request and bypass the IP side of the limiter.
    const peer = getConnInfo(c).remote.address ?? 'unknown';
    const rlKey = `${peer}:${input.email.toLowerCase()}`;
    try {
      const { token, user } = await adminLogin(input, rlKey);
      setSessionCookie(c, env.ADMIN_COOKIE_NAME, token, ADMIN_JWT_TTL_SEC);
      return c.json({ id: user.id, role: 'ADMIN' as const });
    } catch (err) {
      if (err instanceof AdminLoginRateLimited) {
        c.header('Retry-After', String(err.retryAfterSec));
        throw new HTTPException(429, { message: err.message });
      }
      throw err;
    }
  })

  // DEV ONLY — mint a USER/DRIVER session without LINE. 403 in production.
  // For DRIVER it also ensures an APPROVED + available Driver row so the full
  // accept→deliver flow is testable.
  .post('/dev/login', zValidator('json', DevLoginInput), async (c) => {
    if (isProd) throw new HTTPException(403, { message: 'Dev login disabled in production' });
    const { token, user } = await devLogin(c.req.valid('json'));
    setSessionCookie(c, env.USER_COOKIE_NAME, token, USER_JWT_TTL_SEC);
    return c.json({ id: user.id, role: user.role });
  })

  // Logout for both audiences (clears whichever cookie is named).
  .post('/logout', async (c) => {
    clearSessionCookie(c, env.USER_COOKIE_NAME);
    clearSessionCookie(c, env.ADMIN_COOKIE_NAME);
    return c.json({ ok: true });
  })

  // Check whether first-time setup is needed (no admin accounts exist).
  .get('/setup', async (c) => c.json(await needsSetup()))

  // Create the first SUPER admin — only works when no admins exist yet.
  .post('/setup', zValidator('json', SetupInput), async (c) =>
    c.json(await createFirstAdmin(c.req.valid('json')), 201),
  );
