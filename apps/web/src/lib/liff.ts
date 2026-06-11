import liff from '@line/liff';
import { SITE } from './site';

let initialized = false;

// LINE requires the login redirect_uri to live UNDER the registered LIFF
// endpoint URL. The endpoint is `${SITE.url}/app`, so always send the user back
// there — otherwise the code→token exchange fails (400) and login never lands.
const LIFF_REDIRECT_URI = `${SITE.url}/app`;

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
    client.login({ redirectUri: LIFF_REDIRECT_URI });
    // login() redirects; throw to halt the current flow.
    throw new Error('redirecting to LINE login');
  }
  const token = client.getIDToken();
  if (!token) throw new Error('No LINE id_token available');
  return token;
}
