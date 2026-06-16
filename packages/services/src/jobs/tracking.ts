import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import type { JobTrackEvent } from '@movesook/shared';

// Data helpers for the SSE live-tracking stream. The streamSSE() HTTP wiring stays
// in the route (apps/api/src/routes/jobs.ts); these own the authorization check and
// the per-tick snapshot so the route handler holds no business logic.

/** Authorize a tracking subscription: only the job's customer or its assigned
 *  driver may watch. Throws 404/403 like the rest of the jobs surface. */
export async function authorizeTrack(sub: string, id: string): Promise<void> {
  const gate = await prisma.job.findUnique({
    where: { id },
    select: {
      customer: { select: { userId: true } },
      driver: { select: { userId: true } },
    },
  });
  if (!gate) throw new HTTPException(404, { message: 'Job not found' });
  if (gate.customer.userId !== sub && gate.driver?.userId !== sub) {
    throw new HTTPException(403, { message: 'Not your job' });
  }
}

/** Fetch the current track event (status + assigned driver location). Returns null
 *  when the job no longer exists, so the stream can break out of its loop. */
export async function getTrackSnapshot(id: string): Promise<JobTrackEvent | null> {
  const snap = await prisma.job.findUnique({
    where: { id },
    select: {
      status: true,
      driver: { select: { lastLat: true, lastLng: true, locationAt: true } },
    },
  });
  if (!snap) return null;
  return {
    status: snap.status,
    lat: snap.driver?.lastLat ?? null,
    lng: snap.driver?.lastLng ?? null,
    locationAt: snap.driver?.locationAt ? snap.driver.locationAt.toISOString() : null,
  };
}
