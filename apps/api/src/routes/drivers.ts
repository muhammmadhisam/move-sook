import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ClaimDriverInput,
  DriverAppealInput,
  DriverApplyInput,
  DriverAvailabilityInput,
  DriverUpdateInput,
  UpdateDriverLocationInput,
  USER_JWT_TTL_SEC,
} from '@movesook/shared';
import {
  appealDriver,
  applyAsDriver,
  claimDriver,
  getEarnings,
  getIncentives,
  getMyDriver,
  setAvailability,
  updateLocation,
  updateMyDriver,
} from '@movesook/services/drivers';
import { env } from '../config';
import type { AppEnv } from '../lib/context';
import { authenticate, requireRole } from '../middleware/auth';
import { setSessionCookie } from '../lib/cookies';

// Driver self-service surface. Handlers are thin wrappers over
// @movesook/services/drivers; the two role-promoting endpoints write the freshly
// minted DRIVER session token to the USER cookie (cookie naming is a route concern).
export const driverRoutes = new Hono<AppEnv>()
  // Public self-signup: a signed-in user applies to become a driver themselves
  // (no admin-issued invite code needed). Creates a PENDING application and
  // promotes USER -> DRIVER so they can complete the rest of their profile and
  // wait for admin verification before they may accept jobs.
  .post('/apply', authenticate('user'), zValidator('json', DriverApplyInput), async (c) => {
    const { dto, token } = await applyAsDriver(c.get('claims').sub, c.req.valid('json'));
    // Refresh the session cookie so the new DRIVER role takes effect immediately.
    setSessionCookie(c, env.USER_COOKIE_NAME, token, USER_JWT_TTL_SEC);
    return c.json(dto, 201);
  })

  // A signed-in user claims an admin-created driver application via its invite code.
  // Links the pending (unlinked) Driver to this user and promotes them to DRIVER.
  .post('/claim', authenticate('user'), zValidator('json', ClaimDriverInput), async (c) => {
    const { dto, token } = await claimDriver(c.get('claims').sub, c.req.valid('json'));
    // Refresh the session cookie so the new DRIVER role takes effect immediately
    // (otherwise the JWT still says USER until the next login).
    setSessionCookie(c, env.USER_COOKIE_NAME, token, USER_JWT_TTL_SEC);
    return c.json(dto, 201);
  })

  // The driver's own record (prefills the edit form).
  .get('/me', authenticate('user'), requireRole('DRIVER'), async (c) =>
    c.json(await getMyDriver(c.get('claims').sub)),
  )

  // Driver fills in / edits their own application (admin creates the record first;
  // there is no public self-signup). Re-submitting moves a REJECTED app back to PENDING.
  .patch('/me', authenticate('user'), requireRole('DRIVER'), zValidator('json', DriverUpdateInput), async (c) =>
    c.json(await updateMyDriver(c.get('claims').sub, c.req.valid('json'))),
  )

  // A REJECTED / SUSPENDED driver appeals the decision with a message to admins.
  // REJECTED → goes back to PENDING for re-review; SUSPENDED stays suspended (only
  // an admin may lift it) but the appeal + message are recorded and admins notified.
  .post('/me/appeal', authenticate('user'), requireRole('DRIVER'), zValidator('json', DriverAppealInput), async (c) =>
    c.json(await appealDriver(c.get('claims').sub, c.req.valid('json'))),
  )

  // Driver toggles online/offline for the on-demand feed.
  .patch('/me/availability', authenticate('user'), requireRole('DRIVER'), zValidator('json', DriverAvailabilityInput), async (c) =>
    c.json(await setAvailability(c.get('claims').sub, c.req.valid('json'))),
  )

  // Driver broadcasts their current GPS (throttled client-side) for live tracking.
  .patch('/me/location', authenticate('user'), requireRole('DRIVER'), zValidator('json', UpdateDriverLocationInput), async (c) =>
    c.json(await updateLocation(c.get('claims').sub, c.req.valid('json'))),
  )

  // Driver's own earnings summary (from the commission ledger).
  .get('/me/earnings', authenticate('user'), requireRole('DRIVER'), async (c) =>
    c.json(await getEarnings(c.get('claims').sub)),
  )

  // Gamified weekly progress: deliveries, earnings, streak, and rank — keeps
  // drivers engaged (retention). Derived from the commission ledger; no new schema.
  .get('/me/incentives', authenticate('user'), requireRole('DRIVER'), async (c) =>
    c.json(await getIncentives(c.get('claims').sub)),
  );
