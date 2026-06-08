'use client';

import { useEffect, useState } from 'react';
import type { LatLng } from '@/components/job-route-map';

type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unsupported';

interface GeolocationState {
  position: LatLng | null;
  status: GeoStatus;
}

/**
 * Watches the device's current position (the driver's location) so the jobs feed
 * can show how far each pickup point is and pre-fill navigation.
 */
export function useGeolocation(): GeolocationState {
  const [state, setState] = useState<GeolocationState>({ position: null, status: 'idle' });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ position: null, status: 'unsupported' });
      return;
    }

    setState((s) => ({ ...s, status: 'locating' }));
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          status: 'ready',
        });
      },
      (err) => {
        setState({
          position: null,
          status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unsupported',
        });
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return state;
}
