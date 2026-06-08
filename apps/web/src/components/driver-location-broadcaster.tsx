'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

const BROADCAST_MS = 15_000; // send at most once per 15s (battery + server load)

/**
 * While mounted and enabled, watches the driver's GPS and broadcasts it to the
 * API (throttled). Renders nothing. Mounted app-wide in AppShell and enabled only
 * for a DRIVER with an in-progress job, so tracking survives page navigation.
 * Web GPS only runs while the app is foreground — the inherent limit of
 * browser/LIFF tracking (lock screen / app-switch pauses it).
 */
export function DriverLocationBroadcaster({ enabled }: { enabled: boolean }) {
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent.current < BROADCAST_MS) return; // throttle by time
        lastSent.current = now;
        void api.drivers.me.location
          .$patch({ json: { lat: pos.coords.latitude, lng: pos.coords.longitude } })
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  return null;
}
