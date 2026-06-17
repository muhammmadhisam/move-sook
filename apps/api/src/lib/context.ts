import type { JwtClaims } from '@movesook/shared';
import type { RequestIdVariables } from 'hono/request-id';
import type { Logger } from './logger';

// Hono context variables populated by auth + logging middleware.
export type AppVariables = RequestIdVariables & {
  claims: JwtClaims;
  // Per-request child logger, bound with the requestId so every line for one
  // request shares a correlation id. Set by the logging middleware in app.ts.
  log: Logger;
};

export type AppEnv = { Variables: AppVariables };
