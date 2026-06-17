import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  ApplyReferralInput,
  ListNotificationsQuery,
  UpdateCustomerProfileInput,
} from '@movesook/shared';
import {
  applyReferral,
  countUnreadNotifications,
  getMe,
  getProfile,
  getReferral,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateProfile,
} from '@movesook/services/me';
import type { AppEnv } from '../lib/context';
import { authenticate } from '../middleware/auth';

// USER/DRIVER session surface. Handlers are thin wrappers over @movesook/services/me.
export const meRoutes = new Hono<AppEnv>()
  // GET /me — current user + role. Reads the USER cookie (LIFF audience).
  .get('/', authenticate('user'), async (c) => c.json(await getMe(c.get('claims').sub)))

  // GET /me/profile — the customer's own editable profile (name, gender, address, …).
  .get('/profile', authenticate('user'), async (c) => c.json(await getProfile(c.get('claims').sub)))

  // PATCH /me/profile — the customer updates their own profile. All fields optional.
  .patch('/profile', authenticate('user'), zValidator('json', UpdateCustomerProfileInput), async (c) =>
    c.json(await updateProfile(c.get('claims').sub, c.req.valid('json'))),
  )

  // The customer's referral status + share code (generated lazily on first read).
  .get('/referral', authenticate('user'), async (c) => c.json(await getReferral(c.get('claims').sub)))

  // Apply a friend's referral code (once). The reward fires when this customer's
  // first job is confirmed DELIVERED (see maybeIssueReferralReward).
  .post('/referral/apply', authenticate('user'), zValidator('json', ApplyReferralInput), async (c) =>
    c.json(await applyReferral(c.get('claims').sub, c.req.valid('json').code), 201),
  )

  // List the current user's notifications.
  .get(
    '/notifications',
    authenticate('user'),
    zValidator('query', ListNotificationsQuery),
    async (c) => c.json(await listNotifications(c.get('claims').sub, c.req.valid('query'))),
  )

  // Count of unread notifications (for a badge).
  .get('/notifications/unread-count', authenticate('user'), async (c) =>
    c.json(await countUnreadNotifications(c.get('claims').sub)),
  )

  // Mark one notification read.
  .post('/notifications/:id/read', authenticate('user'), async (c) =>
    c.json(await markNotificationRead(c.get('claims').sub, c.req.param('id'))),
  )

  // Mark all read.
  .post('/notifications/read-all', authenticate('user'), async (c) =>
    c.json(await markAllNotificationsRead(c.get('claims').sub)),
  );
