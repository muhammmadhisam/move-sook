import type { JwtClaims } from '@movesook/shared';

// Hono context variables populated by auth middleware.
export type AppVariables = {
  claims: JwtClaims;
};

export type AppEnv = { Variables: AppVariables };
