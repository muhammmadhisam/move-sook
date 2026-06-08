import liff from '@line/liff';

let initialized = false;

export async function ensureLiff(): Promise<typeof liff> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) throw new Error('NEXT_PUBLIC_LIFF_ID is not configured');
  if (!initialized) {
    await liff.init({ liffId });
    initialized = true;
  }
  return liff;
}

/** Run LIFF login (redirect) if needed, then return a fresh id_token. */
export async function getLineIdToken(): Promise<string> {
  const client = await ensureLiff();
  if (!client.isLoggedIn()) {
    client.login();
    // login() redirects; throw to halt the current flow.
    throw new Error('redirecting to LINE login');
  }
  const token = client.getIDToken();
  if (!token) throw new Error('No LINE id_token available');
  return token;
}
