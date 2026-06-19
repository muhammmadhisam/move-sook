import { z } from 'zod';

const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';

// Subset of the LINE id_token verify response we rely on.
const LineVerifyResponse = z.object({
  iss: z.string(),
  sub: z.string(), // stable LINE user id
  aud: z.string(),
  exp: z.number(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

export interface LineProfile {
  lineUserId: string;
  displayName?: string;
  pictureUrl?: string;
}

export type VerifyLineResult =
  | { ok: true; profile: LineProfile }
  | { ok: false; reason: string };

/** Read the `aud` claim from an id_token WITHOUT verifying it — used only to pick
 *  which allowed channel to verify against. The real validation is LINE's /verify
 *  call below (client_id must equal aud or it 400s), so this peek is not trusted. */
function peekAud(idToken: string): string | null {
  const parts = idToken.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const aud = (payload as { aud?: unknown }).aud;
    return typeof aud === 'string' ? aud : null;
  } catch {
    return null;
  }
}

/**
 * Verify a LINE id_token against LINE's endpoint.
 * Validates aud === channelId and iss === https://access.line.me.
 * `channelId` may be a single id, an array, or a comma-separated string to allow
 * tokens from more than one LIFF/Mini App channel (e.g. desktop LIFF + mobile
 * Mini App). `fetchImpl` is injectable for unit tests.
 */
export async function verifyLineIdToken(
  idToken: string,
  channelId: string | string[],
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyLineResult> {
  const allowed = (Array.isArray(channelId) ? channelId : channelId.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return { ok: false, reason: 'missing_channel_id' };

  // /verify requires client_id to equal the token's aud. With one channel we send
  // it directly (preserves old behaviour); with several, peek the aud and pick the
  // matching allowed channel — an aud outside the allowlist is rejected up front.
  let clientId: string;
  if (allowed.length === 1) {
    clientId = allowed[0]!;
  } else {
    const aud = peekAud(idToken);
    if (!aud) return { ok: false, reason: 'malformed_response' };
    if (!allowed.includes(aud)) return { ok: false, reason: 'aud_mismatch' };
    clientId = aud;
  }

  const body = new URLSearchParams({ id_token: idToken, client_id: clientId });
  let res: Response;
  try {
    res = await fetchImpl(LINE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return { ok: false, reason: 'network_error' };
  }

  if (!res.ok) return { ok: false, reason: `line_status_${res.status}` };

  const json: unknown = await res.json();
  const parsed = LineVerifyResponse.safeParse(json);
  if (!parsed.success) return { ok: false, reason: 'malformed_response' };

  const claims = parsed.data;
  if (claims.iss !== 'https://access.line.me') return { ok: false, reason: 'bad_iss' };
  if (claims.aud !== clientId) return { ok: false, reason: 'aud_mismatch' };
  if (claims.exp * 1000 < Date.now()) return { ok: false, reason: 'expired' };

  return {
    ok: true,
    profile: {
      lineUserId: claims.sub,
      displayName: claims.name,
      pictureUrl: claims.picture,
    },
  };
}
