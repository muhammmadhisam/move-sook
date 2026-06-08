import { setCookie, deleteCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { env, isProd } from '../config';

// Cross-subdomain (app. / admin.) cookies in production; lax+localhost in dev.
function baseOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    path: '/',
    maxAge: maxAgeSec,
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setSessionCookie(
  c: Context,
  name: string,
  token: string,
  maxAgeSec: number,
): void {
  setCookie(c, name, token, baseOptions(maxAgeSec));
}

export function clearSessionCookie(c: Context, name: string): void {
  deleteCookie(c, name, {
    path: '/',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  });
}
