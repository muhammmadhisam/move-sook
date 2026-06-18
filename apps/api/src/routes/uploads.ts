import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { verifyJwt } from '@movesook/auth';
import type { DocStore } from '@movesook/services/runtime';
import { env, r2Enabled } from '../config';
import type { AppEnv } from '../lib/context';

// Accept either a user (USER/DRIVER) or an admin session — both audiences upload
// images (item/proof photos vs payout slips), and they use different cookies.
const authAny = createMiddleware<AppEnv>(async (c, next) => {
  // Resolve which cookie is present and verify the token against its matching
  // audience (a user token can't satisfy the admin audience and vice-versa).
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

// Image store. With R2_* env vars set, objects live in Cloudflare R2 and are
// served either from R2_PUBLIC_URL (if set) or proxied via GET /uploads/*.
// Without them (dev), files land in ./uploads (relative to apps/api cwd).
export const UPLOAD_DIR = 'uploads';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB — receipts/documents can be larger

// Images (proof photos, slips, blog covers) and documents (receipts, invoices)
// are both accepted; the ledger feature attaches either kind to an entry.
const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};
const DOC_EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const r2 = r2Enabled
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

// Object keys are `<folder>/<yyyy-mm-dd>/<uuid>.<ext>` (the optional prefix
// buckets uploads by context + day); legacy flat `<uuid>.<ext>` keys are still
// accepted for objects stored before foldering. Anything else is rejected on
// read so the proxy can never be used for path traversal.
const KEY_RE = /^([a-z][a-z0-9-]{0,31}\/\d{4}-\d{2}-\d{2}\/)?[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i;

// Folder is a client-supplied context slug (e.g. `slip`, `proof`, `driver`).
// Reject anything that isn't a plain lowercase slug to keep keys traversal-free;
// fall back to `misc` so an unset/invalid value never breaks the upload.
const FOLDER_RE = /^[a-z][a-z0-9-]{0,31}$/;
const resolveFolder = (raw: unknown): string =>
  typeof raw === 'string' && FOLDER_RE.test(raw) ? raw : 'misc';

// yyyy-mm-dd in Asia/Bangkok so the day-bucket matches local operations.
const dateSegment = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

// Serves GET /uploads/<key>: streams from R2 when configured, otherwise
// falls back to static files on local disk. Mounted in app.ts.
export const serveUploads = r2
  ? createMiddleware<AppEnv>(async (c, next) => {
      if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return next();
      const key = c.req.path.slice(`/${UPLOAD_DIR}/`.length);
      if (!KEY_RE.test(key)) return next();
      try {
        const out = await r2.send(new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
        if (!out.Body) return next();
        return c.body(out.Body.transformToWebStream(), 200, {
          'Content-Type': out.ContentType ?? 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
      } catch (err) {
        if ((err as { name?: string }).name === 'NoSuchKey') return next();
        c.var.log.error({ err }, '[uploads] R2 read failed');
        throw new HTTPException(502, { message: 'Upload storage unavailable' });
      }
    })
  : serveStatic({ root: './' });

async function store(name: string, buffer: Buffer, contentType: string): Promise<void> {
  if (r2) {
    await r2.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET!,
        Key: name,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return;
  }
  const dest = join(UPLOAD_DIR, name);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
}

// Blob cache for server-generated documents (rendered PDFs). Same R2/disk backend
// as user uploads, but objects live under a `doc/` prefix and are read internally
// (never via the public /uploads proxy, so they're out of KEY_RE's scope). Injected
// into @movesook/services at boot via configureDocStore so the PDF builders can
// skip re-rendering on a cache hit. Keeps all storage logic inside this module.
export const docStore: DocStore = {
  async get(key) {
    if (r2) {
      try {
        const out = await r2.send(new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
        if (!out.Body) return null;
        return Buffer.from(await out.Body.transformToByteArray());
      } catch (err) {
        if ((err as { name?: string }).name === 'NoSuchKey') return null;
        throw err;
      }
    }
    try {
      return await readFile(join(UPLOAD_DIR, key));
    } catch {
      return null; // ENOENT (cache miss) or unreadable — render fresh upstream.
    }
  },
  put(key, bytes, contentType) {
    return store(key, bytes, contentType);
  },
};

export const uploadRoutes = new Hono<AppEnv>()
  // Any authenticated user or admin may upload an image; returns an absolute URL.
  .post('/', authAny, async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: 'Missing "file" field' });
    }
    const isImage = file.type in IMAGE_EXT_BY_MIME;
    const ext = IMAGE_EXT_BY_MIME[file.type] ?? DOC_EXT_BY_MIME[file.type];
    if (!ext) {
      throw new HTTPException(415, {
        message: 'Only JPEG/PNG/WebP/HEIC images or PDF/DOC/XLS documents allowed',
      });
    }
    const maxBytes = isImage ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
    if (file.size > maxBytes) {
      throw new HTTPException(413, {
        message: isImage ? 'Image exceeds 5MB' : 'Document exceeds 10MB',
      });
    }

    const folder = resolveFolder(body['folder']);
    const key = `${folder}/${dateSegment()}/${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await store(key, buffer, file.type);

    // Original filename + mime travel back so callers can label document
    // attachments (images just use the URL). Absolute URL so web/admin
    // (different origin) can render/link it.
    const meta = { name: file.name || key, type: file.type };
    if (r2 && env.R2_PUBLIC_URL) {
      return c.json({ url: `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`, ...meta }, 201);
    }
    const origin = new URL(c.req.url).origin;
    return c.json({ url: `${origin}/${UPLOAD_DIR}/${key}`, ...meta }, 201);
  });
