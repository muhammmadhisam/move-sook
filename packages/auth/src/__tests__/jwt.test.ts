import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from '../jwt';

const SECRET = 'test-secret-at-least-32-chars-long-xxxxx';

describe('jwt', () => {
  it('signs and verifies a valid token', async () => {
    const token = await signJwt({ sub: 'user_1', role: 'DRIVER', aud: 'user', secret: SECRET, ttlSec: 60 });
    const result = await verifyJwt(token, SECRET, 'user');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe('user_1');
      expect(result.claims.role).toBe('DRIVER');
    }
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signJwt({ sub: 'u', role: 'USER', aud: 'user', secret: SECRET, ttlSec: 60 });
    const result = await verifyJwt(token, 'a-completely-different-secret-value-1234', 'user');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token presented for the wrong audience', async () => {
    const token = await signJwt({ sub: 'u', role: 'USER', aud: 'user', secret: SECRET, ttlSec: 60 });
    const result = await verifyJwt(token, SECRET, 'admin');
    expect(result).toEqual({ ok: false, reason: 'invalid' });
  });

  it('reports expired tokens', async () => {
    const token = await signJwt({ sub: 'u', role: 'USER', aud: 'user', secret: SECRET, ttlSec: -10 });
    const result = await verifyJwt(token, SECRET, 'user');
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects garbage', async () => {
    const result = await verifyJwt('not-a-jwt', SECRET, 'user');
    expect(result.ok).toBe(false);
  });
});
