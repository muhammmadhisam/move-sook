import liff from '@line/liff';

// Memoize the init PROMISE (not a boolean) so concurrent callers share a single
// liff.init() call. With a boolean flag set after `await`, two effects mounting
// at once both pass the guard and call liff.init() twice — each tries to redeem
// the same single-use authorization code, and the second exchange 400s.
let liffReady: Promise<typeof liff> | null = null;

export function ensureLiff(): Promise<typeof liff> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) return Promise.reject(new Error('NEXT_PUBLIC_LIFF_ID is not configured'));
  if (!liffReady) {
    liffReady = liff.init({ liffId }).then(() => liff);
  }
  return liffReady;
}

// LIFF keeps the session alive (isLoggedIn() === true) far longer than the
// id_token's own `exp`. A returning user therefore passes the isLoggedIn() guard
// but getIDToken() hands back a STALE token; the server verify then 401s with
// `expired` ("เข้าสู่ระบบไม่สำเร็จ"), and because the session is still "logged in"
// every retry resends the same dead token — the user is stuck until LIFF itself
// expires. Treat the token as unusable slightly before its real expiry to dodge
// clock-skew/in-flight races.
const ID_TOKEN_SKEW_MS = 60_000;

function isIdTokenUsable(client: typeof liff): boolean {
  if (!client.getIDToken()) return false;
  let decoded: ReturnType<typeof liff.getDecodedIDToken>;
  try {
    decoded = client.getDecodedIDToken();
  } catch {
    return false; // can't decode → re-login to be safe
  }
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 > Date.now() + ID_TOKEN_SKEW_MS;
}

/** Run LIFF login (redirect) if needed, then return a fresh id_token. */
export async function getLineIdToken(): Promise<string> {
  const client = await ensureLiff();

  // Re-login when there's no session OR the cached id_token is stale/expired.
  // logout() first so login() actually redirects (when already "logged in" it
  // can short-circuit and never mint a fresh token).
  if (!client.isLoggedIn() || !isIdTokenUsable(client)) {
    if (client.isLoggedIn()) client.logout();
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
