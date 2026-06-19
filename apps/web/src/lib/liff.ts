import liff from '@line/liff';

// Memoize the init PROMISE (not a boolean) so concurrent callers share a single
// liff.init() call. With a boolean flag set after `await`, two effects mounting
// at once both pass the guard and call liff.init() twice — each tries to redeem
// the same single-use authorization code, and the second exchange 400s.
let liffReady: Promise<typeof liff> | null = null;

// Two LIFF apps under different channels: a LINE Login LIFF for desktop browsers
// (standard OAuth redirect) and a LINE MINI App for mobile (native inside LINE).
// A Mini App container rejects init() with a foreign liffId ("Invalid LIFF ID"),
// so on mobile we MUST init with the Mini App's own id; desktop has no Mini App
// container and uses the Login LIFF. Pick by device.
function resolveLiffId(): string | undefined {
  const login = process.env.NEXT_PUBLIC_LIFF_ID;
  const miniApp = process.env.NEXT_PUBLIC_LIFF_ID_MINIAPP;
  const isMobile =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  // Fall back to whichever is configured if the preferred one is unset.
  return (isMobile ? miniApp ?? login : login ?? miniApp) || undefined;
}

export function ensureLiff(): Promise<typeof liff> {
  const liffId = resolveLiffId();
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

// LINE requires the login redirect_uri to live UNDER the registered LIFF
// endpoint, so we always return to `<domain>/login` (register that as the
// endpoint; landing elsewhere makes the code→token exchange 400). We preserve
// the post-login destination in `?next=` across the redirect: if we're already
// on /login keep its existing param, otherwise carry the current page (e.g. a
// stale-token re-login fired on /driver/apply returns there, not the generic feed).
function loginRedirectUri(): string {
  const { origin, pathname, search } = window.location;
  if (pathname === '/login') return `${origin}/login${search}`;
  const next = encodeURIComponent(`${pathname}${search}`);
  return `${origin}/login?next=${next}`;
}

/** Run LIFF login (redirect) if needed, then return a fresh id_token. */
export async function getLineIdToken(): Promise<string> {
  const client = await ensureLiff();

  // Re-login when there's no session OR the cached id_token is stale/expired.
  // logout() first so login() actually redirects (when already "logged in" it
  // can short-circuit and never mint a fresh token).
  if (!client.isLoggedIn() || !isIdTokenUsable(client)) {
    if (client.isLoggedIn()) client.logout();
    client.login({ redirectUri: loginRedirectUri() });
    // login() redirects; throw to halt the current flow.
    throw new Error('redirecting to LINE login');
  }

  const token = client.getIDToken();
  if (!token) throw new Error('No LINE id_token available');
  return token;
}
