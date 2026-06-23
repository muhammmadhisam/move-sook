'use client';

import { useEffect } from 'react';
import { APIProvider, Map, Marker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { DEST_ICON, DRIVER_ICON, PICKUP_ICON } from '@/lib/marker-icons';
import { fetchRoutePath } from '@/lib/geo';

export interface LatLng {
  lat: number;
  lng: number;
}

interface JobRouteMapProps {
  origin?: LatLng | null;
  dest?: LatLng | null;
  /** The driver's current location — draws a "you → pickup" leg when present. */
  driver?: LatLng | null;
  originLabel?: string;
  destLabel?: string;
  driverLabel?: string;
  className?: string;
}

/**
 * Road-following path with a two-tier source: first the API's cached Directions
 * proxy (`fetchRoutePath`). When that returns the straight-line fallback (≤2
 * points — i.e. the server `GOOGLE_MAPS_SERVER_KEY` is unset or routing failed),
 * fall back to a client-side DirectionsService call using the browser Maps key,
 * so the route still renders as an actual road path. This client call self-
 * disables once the server key is configured (the proxy then returns >2 points).
 */
async function resolvePath(
  routes: google.maps.RoutesLibrary | null,
  from: LatLng,
  to: LatLng,
  opts?: { live?: boolean },
): Promise<LatLng[]> {
  const path = await fetchRoutePath(from, to, opts);
  if (path.length > 2 || !routes) return path;
  try {
    const result = await new routes.DirectionsService().route({
      origin: from,
      destination: to,
      travelMode: google.maps.TravelMode.DRIVING,
    });
    const overview = result.routes[0]?.overview_path;
    if (overview && overview.length > 2) {
      return overview.map((p) => ({ lat: p.lat(), lng: p.lng() }));
    }
  } catch {
    // Keep the straight-line fallback on any client-side routing error.
  }
  return path;
}

/** Fits the viewport to the available points and draws the route legs. */
function RouteOverlay({
  origin,
  dest,
  driver,
}: {
  origin?: LatLng | null;
  dest?: LatLng | null;
  driver?: LatLng | null;
}) {
  const map = useMap();
  const routes = useMapsLibrary('routes');

  useEffect(() => {
    if (!map) return;
    const points = [driver, origin, dest].filter((p): p is LatLng => p != null);
    if (points.length === 0) return;

    if (points.length === 1) {
      map.setCenter(points[0]!);
      map.setZoom(14);
      return;
    }

    let cancelled = false;
    const lines: google.maps.Polyline[] = [];

    const draw = (path: LatLng[], options: google.maps.PolylineOptions) => {
      if (cancelled) return;
      const line = new google.maps.Polyline({ ...options, path });
      line.setMap(map);
      lines.push(line);
      // Grow the viewport to include the actual road geometry, not just the endpoints.
      const bounds = new google.maps.LatLngBounds();
      lines.forEach((l) => l.getPath().forEach((p) => bounds.extend(p)));
      points.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 64);
    };

    // Fit to the endpoints immediately; routes refine the bounds as they arrive.
    const initial = new google.maps.LatLngBounds();
    points.forEach((p) => initial.extend(p));
    map.fitBounds(initial, 64);

    // Driver → pickup leg (dashed, the "go pick up" segment). The driver endpoint
    // moves with live tracking, so this leg uses the short-TTL `live` cache.
    if (driver && origin) {
      void resolvePath(routes, driver, origin, { live: true }).then((path) =>
        draw(path, {
          geodesic: true,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, scale: 3 },
              offset: '0',
              repeat: '12px',
            },
          ],
          strokeColor: '#2E90FA', // blue-500
        }),
      );
    }

    // Pickup → dropoff leg (solid, the delivery segment).
    if (origin && dest) {
      void resolvePath(routes, origin, dest).then((path) =>
        draw(path, {
          geodesic: true,
          strokeColor: '#E0202A', // brand-600 (logo red)
          strokeOpacity: 0.9,
          strokeWeight: 3,
        }),
      );
    }

    return () => {
      cancelled = true;
      lines.forEach((l) => l.setMap(null));
    };
  }, [map, origin, dest, driver, routes]);

  return null;
}

export function JobRouteMap({
  origin,
  dest,
  driver,
  originLabel = 'จุดรับของ',
  destLabel = 'ปลายทาง',
  driverLabel = 'ตำแหน่งของคุณ',
  className,
}: JobRouteMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted p-4 text-center text-sm text-muted-foreground">
        ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      </div>
    );
  }

  if (!origin && !dest) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted p-4 text-center text-sm text-muted-foreground">
        งานนี้ยังไม่มีพิกัดแผนที่
      </div>
    );
  }

  const center = origin ?? dest!;

  return (
    <div className={className}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          style={{ width: '100%', height: '100%' }}
        >
          {driver && <Marker position={driver} title={driverLabel} icon={DRIVER_ICON} />}
          {origin && <Marker position={origin} title={originLabel} icon={PICKUP_ICON} />}
          {dest && <Marker position={dest} title={destLabel} icon={DEST_ICON} />}
          <RouteOverlay origin={origin} dest={dest} driver={driver} />
        </Map>
      </APIProvider>
    </div>
  );
}
