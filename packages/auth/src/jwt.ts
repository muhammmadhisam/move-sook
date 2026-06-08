import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { JwtClaims, type Role } from '@movesook/shared';

const ALG = 'HS256';

function key(secret: string): Uint8Array {
  if (!secret) throw new Error('JWT secret is empty');
  return new TextEncoder().encode(secret);
}

export interface SignJwtArgs {
  sub: string;
  role: Role;
  secret: string;
  /** Time-to-live in seconds. */
  ttlSec: number;
}

export async function signJwt({ sub, role, secret, ttlSec }: SignJwtArgs): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .sign(key(secret));
}

export type VerifyJwtResult =
  | { ok: true; claims: JwtClaims }
  | { ok: false; reason: 'expired' | 'invalid' };

export async function verifyJwt(token: string, secret: string): Promise<VerifyJwtResult> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALG] });
    const parsed = JwtClaims.safeParse(payload);
    if (!parsed.success) return { ok: false, reason: 'invalid' };
    return { ok: true, claims: parsed.data };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}
