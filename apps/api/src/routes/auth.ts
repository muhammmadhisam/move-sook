import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import { signJwt, verifyLineIdToken, verifyPassword } from '@movesook/auth';
import {
  AdminLoginInput,
  DevLoginInput,
  LineLoginInput,
  USER_JWT_TTL_SEC,
  ADMIN_JWT_TTL_SEC,
} from '@movesook/shared';
import { env, isProd } from '../config';
import type { AppEnv } from '../lib/context';
import { setSessionCookie, clearSessionCookie } from '../lib/cookies';
import { checkAdminLogin, recordFailure, recordSuccess } from '../lib/rate-limit';

export const authRoutes = new Hono<AppEnv>()
  // USER / DRIVER login via LINE id_token (from LIFF).
  .post('/line', zValidator('json', LineLoginInput), async (c) => {
    const { idToken } = c.req.valid('json');
    const verified = await verifyLineIdToken(idToken, env.LINE_CHANNEL_ID);
    if (!verified.ok) {
      throw new HTTPException(401, { message: `LINE verify failed: ${verified.reason}` });
    }

    const { lineUserId, displayName, pictureUrl } = verified.profile;
    const user = await prisma.user.upsert({
      where: { lineUserId },
      create: { lineUserId, displayName, pictureUrl },
      update: { displayName, pictureUrl },
    });

    if (user.isBanned) throw new HTTPException(403, { message: 'Account banned' });

    const token = await signJwt({
      sub: user.id,
      role: user.role,
      secret: env.JWT_SECRET,
      ttlSec: USER_JWT_TTL_SEC,
    });
    setSessionCookie(c, env.USER_COOKIE_NAME, token, USER_JWT_TTL_SEC);
    return c.json({ id: user.id, role: user.role });
  })

  // ADMIN login via email + password (separate cookie, rate-limited).
  .post('/admin/login', zValidator('json', AdminLoginInput), async (c) => {
    const { email, password } = c.req.valid('json');
    const rlKey = `${c.req.header('x-forwarded-for') ?? 'local'}:${email.toLowerCase()}`;

    const gate = checkAdminLogin(rlKey);
    if (!gate.allowed) {
      c.header('Retry-After', String(gate.retryAfterSec));
      throw new HTTPException(429, { message: 'Too many attempts, try again later' });
    }

    const cred = await prisma.adminCredential.findUnique({
      where: { email: email.toLowerCase() },
      include: { user: true },
    });

    // Always run a compare to keep timing uniform whether or not the email exists.
    const hash = cred?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const passwordOk = await verifyPassword(password, hash);

    if (!cred || !passwordOk || cred.user.role !== 'ADMIN' || cred.user.isBanned) {
      recordFailure(rlKey);
      throw new HTTPException(401, { message: 'Invalid credentials' });
    }

    recordSuccess(rlKey);
    const token = await signJwt({
      sub: cred.user.id,
      role: 'ADMIN',
      secret: env.JWT_SECRET,
      ttlSec: ADMIN_JWT_TTL_SEC,
    });
    setSessionCookie(c, env.ADMIN_COOKIE_NAME, token, ADMIN_JWT_TTL_SEC);
    return c.json({ id: cred.user.id, role: 'ADMIN' as const });
  })

  // DEV ONLY — mint a USER/DRIVER session without LINE. 403 in production.
  // For DRIVER it also ensures an APPROVED + available Driver row so the full
  // accept→deliver flow is testable.
  .post('/dev/login', zValidator('json', DevLoginInput), async (c) => {
    if (isProd) throw new HTTPException(403, { message: 'Dev login disabled in production' });

    const { role, lineUserId, displayName, serviceProvince } = c.req.valid('json');
    const luid = lineUserId ?? (role === 'DRIVER' ? 'dev-driver' : 'dev-user');
    const name = displayName ?? (role === 'DRIVER' ? 'Dev Driver' : 'Dev User');

    const user = await prisma.user.upsert({
      where: { lineUserId: luid },
      create: { lineUserId: luid, displayName: name, role },
      update: { role, displayName: name },
    });

    if (role === 'DRIVER') {
      await prisma.driver.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          vehicleType: 'PICKUP',
          serviceProvince: serviceProvince ?? 'สงขลา',
          verifyStatus: 'APPROVED',
          isAvailable: true,
        },
        update: {
          verifyStatus: 'APPROVED',
          isAvailable: true,
          ...(serviceProvince ? { serviceProvince } : {}),
        },
      });
    }

    const token = await signJwt({
      sub: user.id,
      role: user.role,
      secret: env.JWT_SECRET,
      ttlSec: USER_JWT_TTL_SEC,
    });
    setSessionCookie(c, env.USER_COOKIE_NAME, token, USER_JWT_TTL_SEC);
    return c.json({ id: user.id, role: user.role });
  })

  // Logout for both audiences (clears whichever cookie is named).
  .post('/logout', async (c) => {
    clearSessionCookie(c, env.USER_COOKIE_NAME);
    clearSessionCookie(c, env.ADMIN_COOKIE_NAME);
    return c.json({ ok: true });
  });
