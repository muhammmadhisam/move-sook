import { serve } from '@hono/node-server';
import { app } from './app';
import { env } from './config';

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`🚚 MoveSook API listening on http://localhost:${info.port}`);
});
