import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password';

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toContain('correct horse');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('s3cret-password');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
