import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { verifyJwt } from '@movesook/auth';
import { getRoute, reverseGeocode } from '@movesook/services/geo';
import { env } from '../config';
import type { AppEnv } from '../lib/context';

// Accept either a user (USER/DRIVER) or an admin session — customers, the
// assigned driver, and admins all open job route maps, and they use different
// cookies. Auth gates this so /geo can't be abused as an open proxy to the
// (paid) Google Directions / Geocoding APIs.
const authAny = createMiddleware<AppEnv>(async (c, next) => {
  const userToken = getCookie(c, env.USER_COOKIE_NAME);
  const adminToken = getCookie(c, env.ADMIN_COOKIE_NAME);
  const candidate = userToken
    ? ({ token: userToken, aud: 'user' as const })
    : adminToken
      ? ({ token: adminToken, aud: 'admin' as const })
      : null;
  if (!candidate) throw new HTTPException(401, { message: 'Not authenticated' });
  const result = await verifyJwt(candidate.token, env.JWT_SECRET, candidate.aud);
  if (!result.ok) throw new HTTPException(401, { message: 'Invalid session' });
  c.set('claims', result.claims);
  await next();
});

const coord = z.coerce.number().refine(Number.isFinite, 'invalid coordinate');
const routeQuery = z.object({
  fromLat: coord,
  fromLng: coord,
  toLat: coord,
  toLng: coord,
  // '1' = a live leg (moving endpoint, e.g. driver → pickup): short-TTL cache.
  live: z.enum(['1']).optional(),
});
const pointQuery = z.object({ lat: coord, lng: coord });

// Cached geo helpers — server-side Directions / reverse-Geocoding behind a Redis
// cache, so repeat views of a job route don't re-bill Google per view.
export const geoRoutes = new Hono<AppEnv>()
  // Road-following path between two points (decoded polyline).
  .get('/route', authAny, zValidator('query', routeQuery), async (c) => {
    const q = c.req.valid('query');
    const path = await getRoute(
      { lat: q.fromLat, lng: q.fromLng },
      { lat: q.toLat, lng: q.toLng },
      { live: q.live === '1' },
    );
    return c.json({ path });
  })
  // Reverse-geocode a tapped coordinate into a Thai address + canonical province.
  .get('/reverse-geocode', authAny, zValidator('query', pointQuery), async (c) => {
    const q = c.req.valid('query');
    return c.json(await reverseGeocode(q.lat, q.lng));
  });
