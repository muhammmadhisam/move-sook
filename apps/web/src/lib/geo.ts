import type { LatLng } from '@/components/job-route-map';

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
