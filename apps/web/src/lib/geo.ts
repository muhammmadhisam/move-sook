import type { LatLng } from '@/components/job-route-map';
import { api } from './api';

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two points, in kilometres (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Thai-friendly distance label, e.g. "~850 ม." or "~5.2 กม." */
export function formatDistance(km: number): string {
  if (km < 1) return `~${Math.round(km * 1000)} ม.`;
  return `~${km.toFixed(1)} กม.`;
}

/** Google Maps directions deep-link from an optional origin to a destination. */
export function directionsUrl(dest: LatLng, origin?: LatLng | null): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${dest.lat},${dest.lng}`,
    travelmode: 'driving',
  });
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Road-following path between two points via the API's cached Directions proxy
 * (GET /geo/route) instead of a per-view client-side Google call. The server
 * caches by rounded endpoints, so every viewer of the same route shares one
 * upstream call. Always resolves — falls back to a straight `[from, to]` line.
 */
export async function fetchRoutePath(
  from: LatLng,
  to: LatLng,
  opts?: { live?: boolean },
): Promise<LatLng[]> {
  try {
    const res = await api.geo.route.$get({
      query: {
        fromLat: String(from.lat),
        fromLng: String(from.lng),
        toLat: String(to.lat),
        toLng: String(to.lng),
        ...(opts?.live ? { live: '1' as const } : {}),
      },
    });
    if (!res.ok) return [from, to];
    const { path } = await res.json();
    return path.length > 0 ? path : [from, to];
  } catch {
    return [from, to];
  }
}

/** Reverse-geocode a coordinate via the API's cached Geocoding proxy. */
export async function reverseGeocodeRemote(
  lat: number,
  lng: number,
): Promise<{ address: string; province: string } | null> {
  try {
    const res = await api.geo['reverse-geocode'].$get({
      query: { lat: String(lat), lng: String(lng) },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
