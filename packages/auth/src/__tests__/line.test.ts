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
});
