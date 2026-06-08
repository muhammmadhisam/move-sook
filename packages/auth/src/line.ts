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

/**
 * Verify a LINE id_token against LINE's endpoint.
 * Validates aud === channelId and iss === https://access.line.me.
 * `fetchImpl` is injectable for unit tests.
 */
export async function verifyLineIdToken(
  idToken: string,
  channelId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifyLineResult> {
  if (!channelId) return { ok: false, reason: 'missing_channel_id' };

  const body = new URLSearchParams({ id_token: idToken, client_id: channelId });
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
  if (claims.aud !== channelId) return { ok: false, reason: 'aud_mismatch' };
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
