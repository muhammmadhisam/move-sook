'use client';

import { useEffect } from 'react';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';
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

    // Driver → pickup leg (dashed, the "go pick up" segment).
    // Driver endpoint moves with live tracking → short-TTL `live` cache.
    if (driver && origin) {
      void fetchRoutePath(driver, origin, { live: true }).then((path) =>
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
      void fetchRoutePath(origin, dest).then((path) =>
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
  }, [map, origin, dest, driver]);

  return null;
}

export function JobRouteMap({
  origin,
  dest,
  driver,
  originLabel = 'จุดรับของ',
  destLabel = 'ปลายทาง',
  driverLabel = 'ตำแหน่งคนขับ',
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

  if (!origin && !dest && !driver) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted p-4 text-center text-sm text-muted-foreground">
        งานนี้ยังไม่มีพิกัดแผนที่
      </div>
    );
  }

  const center = driver ?? origin ?? dest!;

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
