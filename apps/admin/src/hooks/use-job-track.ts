'use client';

import { useEffect, useState } from 'react';
import type { JobTrackEvent } from '@movesook/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

/**
 * Subscribes to the admin live-tracking SSE stream for a job and returns the
 * latest event (driver location + status). EventSource auto-reconnects; the admin
 * session cookie is sent via withCredentials. Pass enabled=false to close the stream.
 */
export function useJobTrack(jobId: string, enabled: boolean): JobTrackEvent | null {
  const [event, setEvent] = useState<JobTrackEvent | null>(null);

  useEffect(() => {
    if (!enabled || !jobId) {
      setEvent(null);
      return;
    }
    const es = new EventSource(`${API_BASE}/admin/jobs/${jobId}/track`, {
      withCredentials: true,
    });
    const onTrack = (e: MessageEvent) => {
      try {
        setEvent(JSON.parse(e.data) as JobTrackEvent);
      } catch {
        // ignore malformed frames
      }
    };
    es.addEventListener('track', onTrack);
    // Swallow transient errors — EventSource reconnects on its own.
    es.onerror = () => {};

    return () => {
      es.removeEventListener('track', onTrack);
      es.close();
    };
  }, [jobId, enabled]);

  return event;
}
