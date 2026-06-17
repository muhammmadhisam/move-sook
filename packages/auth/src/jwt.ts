import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { JwtClaims, type Role } from '@movesook/shared';

const ALG = 'HS256';

/** Session audience. USER/DRIVER and ADMIN tokens are signed for distinct
 *  audiences so an admin-cookie token can never be a user token (or vice-versa),
 *  even though both share one secret. The cookie name alone no longer separates
 *  them — `aud` is cryptographically bound and verified. */
export type JwtAudience = 'user' | 'admin';

function key(secret: string): Uint8Array {
  if (!secret) throw new Error('JWT secret is empty');
  return new TextEncoder().encode(secret);
}

export interface SignJwtArgs {
  sub: string;
  role: Role;
  /** Which session audience this token is minted for. */
  aud: JwtAudience;
  secret: string;
  /** Time-to-live in seconds. */
  ttlSec: number;
}

export async function signJwt({ sub, role, aud, secret, ttlSec }: SignJwtArgs): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(sub)
    .setAudience(aud)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .sign(key(secret));
}

// ── Document-access tokens ────────────────────────────────────────────────────
// A scoped, signed token that grants read-only access to a single job document
// (e.g. a receipt PDF) without a session cookie — so it can ride in a LINE Flex
// button that opens in an external browser. It carries only a jobId + doc type
// and is purpose-tagged so it can never be mistaken for a session JWT.

export type DocTokenType = 'receipt' | 'delivery';

export interface SignDocTokenArgs {
  jobId: string;
  type: DocTokenType;
  secret: string;
  /** Time-to-live in seconds. */
  ttlSec: number;
}

export async function signDocToken({
  jobId,
  type,
  secret,
  ttlSec,
}: SignDocTokenArgs): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ purpose: 'doc', jid: jobId, typ: type })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSec)
    .sign(key(secret));
}

export type VerifyDocTokenResult =
  | { ok: true; jobId: string; type: DocTokenType }
  | { ok: false };

export async function verifyDocToken(
  token: string,
  secret: string,
): Promise<VerifyDocTokenResult> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALG] });
    const { purpose, jid, typ } = payload as Record<string, unknown>;
    if (purpose !== 'doc' || typeof jid !== 'string') return { ok: false };
    if (typ !== 'receipt' && typ !== 'delivery') return { ok: false };
    return { ok: true, jobId: jid, type: typ };
  } catch {
    return { ok: false };
  }
}

export type VerifyJwtResult =
  | { ok: true; claims: JwtClaims }
  | { ok: false; reason: 'expired' | 'invalid' };

export async function verifyJwt(
  token: string,
  secret: string,
  audience: JwtAudience,
): Promise<VerifyJwtResult> {
  try {
    // `audience` makes jose reject a token minted for the other audience (a user
    // token presented in the admin cookie, or vice-versa) — defence in depth on
    // top of the separate cookie names.
    const { payload } = await jwtVerify(token, key(secret), { algorithms: [ALG], audience });
    const parsed = JwtClaims.safeParse(payload);
    if (!parsed.success) return { ok: false, reason: 'invalid' };
    return { ok: true, claims: parsed.data };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}
