import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { env } from './config';
import type { AppEnv } from './lib/context';
import { getSystemSettings } from './lib/settings';
import { resolveProhibitedItems, type PublicSystemConfig } from '@movesook/shared';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { jobRoutes } from './routes/jobs';
import { driverRoutes } from './routes/drivers';
import { adminRoutes } from './routes/admin';
import { blogRoutes } from './routes/blog';
import { uploadRoutes, serveUploads } from './routes/uploads';
import { webhookRoutes } from './routes/webhooks';

// Skip request logging for the health probe — load balancers / uptime monitors
// hit GET /health constantly and would otherwise drown the logs.
const httpLogger = logger();

// One chain so hc<AppType>() sees every mounted route's literal types.
const app = new Hono<AppEnv>()
  .use('*', (c, next) => (c.req.path === '/health' ? next() : httpLogger(c, next)))
  .use(
    '*',
    cors({
      origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
      credentials: true,
    }),
  )
  .onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error: err.message }, err.status);
    }
    console.error('[unhandled]', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  })
  .get('/health', (c) => c.json({ ok: true, service: 'movesook-api' }))
  // Public app config: maintenance banner + support contact (no auth).
  .get('/system/public', async (c) => {
    const s = await getSystemSettings();
    const body: PublicSystemConfig = {
      maintenanceMode: s.maintenanceMode,
      maintenanceMessage: s.maintenanceMessage,
      supportPhone: s.supportPhone,
      supportLineId: s.supportLineId,
      supportEmail: s.supportEmail,
      payBankName: s.payBankName,
      payAccountName: s.payAccountName,
      payAccountNumber: s.payAccountNumber,
      payQrUrl: s.payQrUrl,
      addressChangeFee: s.addressChangeFee,
      prohibitedItems: resolveProhibitedItems(s.prohibitedItemsList),
      codEnabled: s.codEnabled,
      codMinPrice: s.codMinPrice,
      codMaxPrice: s.codMaxPrice,
    };
    return c.json(body);
  })
  // Serve uploaded images (GET /uploads/<file>) from R2 or local disk;
  // POST /uploads is handled by the router below.
  .use('/uploads/*', serveUploads)
  .route('/auth', authRoutes)
  .route('/me', meRoutes)
  .route('/jobs', jobRoutes)
  .route('/blog', blogRoutes)
  .route('/drivers', driverRoutes)
  .route('/uploads', uploadRoutes)
  .route('/admin', adminRoutes)
  .route('/webhooks', webhookRoutes);

export { app };
export type AppType = typeof app;
