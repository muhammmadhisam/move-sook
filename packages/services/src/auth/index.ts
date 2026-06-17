import { HTTPException } from 'hono/http-exception';
import { prisma, type Role } from '@movesook/db';
import { signJwt, verifyLineIdToken, verifyPassword, hashPassword } from '@movesook/auth';
import {
  type AdminLoginInput,
  type DevLoginInput,
  type LineLoginInput,
  type SetupInput,
  USER_JWT_TTL_SEC,
  ADMIN_JWT_TTL_SEC,
} from '@movesook/shared';
import { checkAdminLogin, recordFailure, recordSuccess } from '../support';
import { getEnv } from '../runtime/env';

// Auth domain logic (LINE / admin / dev login, setup). HTTP concerns —
// session-cookie writes, logout, and `isProd` gating — stay in the route
// (apps/api/src/routes/auth.ts). These functions verify credentials and issue
// the signed JWT; the route sets the cookie and returns the same JSON shape.

/** A minted session: the JWT to put in the cookie + the public identity to return. */
export type Session = {
  token: string;
  user: { id: string; role: Role };
};

/** USER / DRIVER login via LINE id_token (from LIFF). Returns the session to set. */
export async function lineLogin(input: LineLoginInput): Promise<Session> {
  const env = getEnv();
  const verified = await verifyLineIdToken(input.idToken, env.LINE_CHANNEL_ID);
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
    aud: 'user',
    secret: env.JWT_SECRET,
    ttlSec: USER_JWT_TTL_SEC,
  });
  return { token, user: { id: user.id, role: user.role } };
}

/** Thrown when the admin-login rate-limit gate trips. Carries the retry hint so the
 *  route can set the `Retry-After` header (an HTTP concern) before it propagates. */
export class AdminLoginRateLimited extends HTTPException {
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super(429, { message: 'Too many attempts, try again later' });
    this.retryAfterSec = retryAfterSec;
  }
}

/** ADMIN login via email + password. `rlKey` is the rate-limit bucket built by the
 *  route from request headers. On gate failure throws AdminLoginRateLimited (429);
 *  the route sets `Retry-After` from `.retryAfterSec`. */
export async function adminLogin(input: AdminLoginInput, rlKey: string): Promise<Session> {
  const env = getEnv();

  const gate = await checkAdminLogin(rlKey);
  if (!gate.allowed) {
    throw new AdminLoginRateLimited(gate.retryAfterSec);
  }

  const cred = await prisma.adminCredential.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { user: true },
  });

  // Always run a compare to keep timing uniform whether or not the email exists.
  const hash = cred?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const passwordOk = await verifyPassword(input.password, hash);

  if (!cred || !passwordOk || cred.user.role !== 'ADMIN' || cred.user.isBanned) {
    await recordFailure(rlKey);
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  await recordSuccess(rlKey);
  const token = await signJwt({
    sub: cred.user.id,
    role: 'ADMIN',
    aud: 'admin',
    secret: env.JWT_SECRET,
    ttlSec: ADMIN_JWT_TTL_SEC,
  });
  return { token, user: { id: cred.user.id, role: 'ADMIN' } };
}

/** DEV ONLY — mint a USER/DRIVER session without LINE. The production gate stays in
 *  the route (it owns `isProd`). For DRIVER this also ensures an APPROVED + available
 *  Driver row so the full accept→deliver flow is testable. */
export async function devLogin(input: DevLoginInput): Promise<Session> {
  const env = getEnv();
  const { role, lineUserId, displayName, serviceProvince } = input;
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
    aud: 'user',
    secret: env.JWT_SECRET,
    ttlSec: USER_JWT_TTL_SEC,
  });
  return { token, user: { id: user.id, role: user.role } };
}

/** Whether first-time setup is needed (no admin accounts exist). */
export async function needsSetup(): Promise<{ needsSetup: boolean }> {
  const count = await prisma.adminCredential.count();
  return { needsSetup: count === 0 };
}

/** Create the first SUPER admin — only works when no admins exist yet. */
export async function createFirstAdmin(input: SetupInput): Promise<{ ok: true }> {
  const count = await prisma.adminCredential.count();
  if (count > 0) throw new HTTPException(409, { message: 'Admin already exists' });
  const { email, displayName, password } = input;
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { displayName, role: 'ADMIN' } });
    await tx.adminCredential.create({
      data: { userId: user.id, email: email.toLowerCase(), passwordHash, adminRole: 'SUPER' },
    });
  });
  return { ok: true };
}
