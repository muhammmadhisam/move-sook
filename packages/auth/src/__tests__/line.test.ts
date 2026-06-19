import { describe, it, expect } from 'vitest';
import { verifyLineIdToken } from '../line';

const CHANNEL = '1234567890';

function mockFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

// Minimal unsigned JWT carrying just an `aud` claim — exercises the multi-channel
// path where verifyLineIdToken peeks aud to choose which allowed channel to use.
function jwtWithAud(aud: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ aud })}.sig`;
}

describe('verifyLineIdToken', () => {
  const future = Math.floor(Date.now() / 1000) + 3600;

  it('accepts a valid token', async () => {
    const fetchImpl = mockFetch(200, {
      iss: 'https://access.line.me',
      sub: 'Uabc',
      aud: CHANNEL,
      exp: future,
      name: 'Somchai',
      picture: 'https://x/y.jpg',
    });
    const res = await verifyLineIdToken('token', CHANNEL, fetchImpl);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.profile.lineUserId).toBe('Uabc');
      expect(res.profile.displayName).toBe('Somchai');
    }
  });

  it('rejects audience mismatch', async () => {
    const fetchImpl = mockFetch(200, {
      iss: 'https://access.line.me',
      sub: 'Uabc',
      aud: 'other-channel',
      exp: future,
    });
    const res = await verifyLineIdToken('token', CHANNEL, fetchImpl);
    expect(res).toEqual({ ok: false, reason: 'aud_mismatch' });
  });

  it('rejects expired token', async () => {
    const fetchImpl = mockFetch(200, {
      iss: 'https://access.line.me',
      sub: 'Uabc',
      aud: CHANNEL,
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    const res = await verifyLineIdToken('token', CHANNEL, fetchImpl);
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });

  it('propagates LINE error status', async () => {
    const res = await verifyLineIdToken('token', CHANNEL, mockFetch(400, { error: 'bad' }));
    expect(res).toEqual({ ok: false, reason: 'line_status_400' });
  });

  it('accepts a token whose aud matches one of several allowed channels', async () => {
    const fetchImpl = mockFetch(200, {
      iss: 'https://access.line.me',
      sub: 'Uabc',
      aud: 'mini-app',
      exp: future,
    });
    const res = await verifyLineIdToken(jwtWithAud('mini-app'), [CHANNEL, 'mini-app'], fetchImpl);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.profile.lineUserId).toBe('Uabc');
  });

  it('rejects a token whose aud is outside the allowlist (comma-separated)', async () => {
    // Should not even reach LINE — aud peek fails the allowlist first.
    const res = await verifyLineIdToken(
      jwtWithAud('stranger'),
      `${CHANNEL},mini-app`,
      mockFetch(200, { iss: 'https://access.line.me', sub: 'U', aud: 'stranger', exp: future }),
    );
    expect(res).toEqual({ ok: false, reason: 'aud_mismatch' });
  });
});
