import { api } from './api';

export interface LatLng {
  lat: number;
  lng: number;
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
