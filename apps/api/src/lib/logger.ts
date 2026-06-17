import { createRequire } from 'node:module';
import pino from 'pino';
import { env, isProd } from '../config';

// pino-pretty is a devDependency and is absent from the production image. Only
// use the pretty transport when it actually resolves — so a prod/Docker run
// (where NODE_ENV may not be "production" but pino-pretty isn't installed) falls
// back to plain JSON instead of crashing on an unresolvable transport target.
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}
const usePretty = !isProd && prettyAvailable();

// Single pino instance for the API process. In prod it emits newline-delimited
// JSON (ingestible by any log shipper); in dev it pretty-prints via pino-pretty.
// PII is redacted at the log layer too (defense-in-depth for PDPA) so a stray
// `log.info({ req })` can never leak a cookie/token/auth header.
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      '*.password',
      '*.token',
      '*.idToken',
      '*.accessToken',
    ],
    remove: true,
  },
  ...(usePretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export type Logger = typeof logger;
