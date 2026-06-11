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
    // LINE requires the login redirect_uri to live UNDER the registered LIFF
    // endpoint. /login is the universal entry (login button + the AppShell auth
    // bounce both land here), so register `<domain>/login` as the endpoint and
    // return there. Landing elsewhere makes the code→token exchange fail (400).
    // Once the session resolves, useAuth/login redirect onward to /app.
    client.login({ redirectUri: `${window.location.origin}/login` });
    // login() redirects; throw to halt the current flow.
    throw new Error('redirecting to LINE login');
  }
  const token = client.getIDToken();
  if (!token) throw new Error('No LINE id_token available');
  return token;
}
