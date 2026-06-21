import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { requestId } from 'hono/request-id';
import { HTTPException } from 'hono/http-exception';
import * as Sentry from '@sentry/node';
import { env } from './config';
import { logger as baseLogger } from './lib/logger';
import type { AppEnv } from './lib/context';
import { getSystemSettings, getCommissionPct } from '@movesook/services/support';
import { listPublicServiceAreas, listPublicVehiclePricing } from '@movesook/services/admin';
import { resolveProhibitedItems, type PublicSystemConfig } from '@movesook/shared';
import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { jobRoutes } from './routes/jobs';
import { driverRoutes } from './routes/drivers';
import { adminRoutes } from './routes/admin';
import { blogRoutes } from './routes/blog';
import { uploadRoutes, serveUploads } from './routes/uploads';
import { webhookRoutes } from './routes/webhooks';
import { geoRoutes } from './routes/geo';

// One chain so hc<AppType>() sees every mounted route's literal types.
const app = new Hono<AppEnv>()
  // Assign / reuse a correlation id, then bind a per-request child logger to it.
  .use('*', requestId())
  .use('*', async (c, next) => {
    const reqId = c.get('requestId');
    const log = baseLogger.child({ requestId: reqId });
    c.set('log', log);
    // Correlate Sentry events with log lines for the same request.
    Sentry.getCurrentScope().setTag('requestId', reqId);
    // Skip access logs for the health probe — load balancers / uptime monitors
    // hit GET /health constantly and would otherwise drown the logs.
    if (c.req.path === '/health') return next();
    const start = Date.now();
    await next();
    log.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - start,
      },
      'request',
    );
  })
  // Security headers (HSTS, X-Frame-Options, nosniff, no-referrer, etc.). CORP is
  // relaxed to cross-origin so the GET /uploads/* image proxy can still be
  // embedded from the app./admin. subdomains; COEP stays off for the same reason.
  .use(
    '*',
    secureHeaders({
      crossOriginResourcePolicy: 'cross-origin',
      crossOriginEmbedderPolicy: false,
    }),
  )
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
    // Real fault (not a deliberate 4xx) — report it and log it.
    Sentry.captureException(err);
    (c.var.log ?? baseLogger).error({ err }, 'unhandled error');
    return c.json({ error: 'Internal Server Error' }, 500);
  })
  .get('/health', (c) => c.json({ ok: true, service: 'movesook-api' }))
  // Public app config: maintenance banner + support contact (no auth).
  .get('/system/public', async (c) => {
    const [s, commissionPct] = await Promise.all([getSystemSettings(), getCommissionPct()]);
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
      commissionPct,
      deliveryGeofenceMeters: s.deliveryGeofenceMeters,
    };
    return c.json(body);
  })
  // Public list of active service-area provinces (marketing site, no auth).
  .get('/system/service-areas', async (c) => c.json(await listPublicServiceAreas()))
  // Public active vehicle types + per-km rates (marketing pricing page, no auth).
  .get('/system/vehicle-pricing', async (c) => c.json(await listPublicVehiclePricing()))
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
  .route('/webhooks', webhookRoutes)
  .route('/geo', geoRoutes);

export { app };
export type AppType = typeof app;
