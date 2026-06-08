import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyJwt } from '@movesook/auth';
import { env } from '../config';
import type { AppEnv } from '../lib/context';

// Accept either a user (USER/DRIVER) or an admin session — both audiences upload
// images (item/proof photos vs payout slips), and they use different cookies.
const authAny = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, env.USER_COOKIE_NAME) ?? getCookie(c, env.ADMIN_COOKIE_NAME);
  if (!token) throw new HTTPException(401, { message: 'Not authenticated' });
  const result = await verifyJwt(token, env.JWT_SECRET);
  if (!result.ok) throw new HTTPException(401, { message: 'Invalid session' });
  c.set('claims', result.claims);
  await next();
});

// Local-disk image store. Files land in ./uploads (relative to apps/api cwd)
// and are served back at GET /uploads/*. Swap for S3/MinIO later by changing
// only this module + the static mount in app.ts.
export const UPLOAD_DIR = 'uploads';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export const uploadRoutes = new Hono<AppEnv>()
  // Any authenticated user or admin may upload an image; returns an absolute URL.
  .post('/', authAny, async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: 'Missing "file" field' });
    }
    const ext = EXT_BY_MIME[file.type];
    if (!ext) {
      throw new HTTPException(415, { message: 'Only JPEG/PNG/WebP/HEIC images allowed' });
    }
    if (file.size > MAX_BYTES) {
      throw new HTTPException(413, { message: 'Image exceeds 5MB' });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(UPLOAD_DIR, name), buffer);

    // Absolute URL so the web/admin apps (different origin) can render it.
    const origin = new URL(c.req.url).origin;
    return c.json({ url: `${origin}/${UPLOAD_DIR}/${name}` }, 201);
  });
