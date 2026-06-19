import { matchProvinceName } from '@movesook/thailand-provinces/province';
import { cached } from '../support/cache';
import { getEnv, getLogger } from '../runtime/env';

// Server-side, Redis-cached Directions / reverse-Geocoding.
//
// Both the customer, the assigned driver, and admins open the SAME job route
// map, and route geometry between two fixed points never changes — yet every
// view used to fire its own client-side Google Directions call, billing per
// view. These helpers compute once via the server key and cache the result in
// Redis keyed by the rounded endpoints, collapsing N views onto one upstream
// call. Fully best-effort: a missing key or any upstream error yields a
// straight-line path / null geocode so the map still renders.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  address: string;
  /** Canonical Thai province name (matched against the official list), or ''. */
  province: string;
}

// Round to ~11 m so near-identical pins collapse onto one cache entry.
const k = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

const ROUTE_TTL = 30 * 24 * 60 * 60; // 30 days — road geometry between fixed points is stable
// A *live* leg (driver → pickup) tracks the moving driver: each ~11 m cell is
// near-single-use, so a long TTL would just pile up stale keys. Keep it short so
// concurrent viewers of the same position still share a call, then it evaporates.
const LIVE_TTL = 60; // 60 s
const GEOCODE_TTL = 7 * 24 * 60 * 60; // 7 days — addresses move rarely

/**
 * Road-following driving path between two points, as a decoded polyline.
 * Cached (30d by default; 60s for a `live` leg whose endpoint moves). Returns
 * the straight `[from, to]` fallback when the key is unset or routing fails.
 *
 * Cache policy: a successful route and a *stable* ZERO_RESULTS (genuinely no
 * road route, e.g. across water) are both cached; a *transient* failure
 * (quota / denied / network) throws so cached() stores nothing and we retry.
 */
export async function getRoute(
  from: LatLng,
  to: LatLng,
  opts?: { live?: boolean },
): Promise<LatLng[]> {
  const key = getEnv().GOOGLE_MAPS_SERVER_KEY;
  if (!key) return [from, to];
  const ttl = opts?.live ? LIVE_TTL : ROUTE_TTL;
  try {
    return await cached(`geo:route:${k(from.lat, from.lng)}:${k(to.lat, to.lng)}`, ttl, async () => {
      const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
      url.searchParams.set('origin', k(from.lat, from.lng));
      url.searchParams.set('destination', k(to.lat, to.lng));
      url.searchParams.set('mode', 'driving');
      url.searchParams.set('key', key);
      const res = await fetch(url);
      const data = (await res.json()) as {
        status?: string;
        routes?: { overview_polyline?: { points?: string } }[];
      };
      // Stable "no road route" — cache the straight line so we don't re-bill it.
      if (data.status === 'ZERO_RESULTS') return [from, to];
      const encoded = data.routes?.[0]?.overview_polyline?.points;
      // Transient failure — throw so cached() stores nothing and we retry later.
      if (!encoded) throw new Error(`directions: no route (status=${data.status ?? 'unknown'})`);
      return decodePolyline(encoded);
    });
  } catch (err) {
    getLogger().error({ err }, '[geo] route unavailable — straight-line fallback');
    return [from, to];
  }
}

/**
 * Reverse-geocode a coordinate into a Thai formatted address + canonical
 * province. Cached 7d. Returns null when the key is unset or lookup fails.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const key = getEnv().GOOGLE_MAPS_SERVER_KEY;
  if (!key) return null;
  try {
    return await cached(`geo:rev:${k(lat, lng)}`, GEOCODE_TTL, async () => {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('latlng', k(lat, lng));
      url.searchParams.set('language', 'th');
      url.searchParams.set('key', key);
      const res = await fetch(url);
      const data = (await res.json()) as {
        status?: string;
        results?: {
          formatted_address: string;
          address_components: { long_name: string; types: string[] }[];
        }[];
      };
      const best = data.results?.[0];
      if (!best) throw new Error(`geocode: no result (status=${data.status ?? 'unknown'})`);
      const provinceComp = best.address_components.find((c) =>
        c.types.includes('administrative_area_level_1'),
      );
      const province = provinceComp ? (matchProvinceName(provinceComp.long_name) ?? '') : '';
      return { address: best.formatted_address, province };
    });
  } catch (err) {
    getLogger().error({ err }, '[geo] reverse geocode failed');
    return null;
  }
}

/** Decode a Google encoded-polyline string into lat/lng points. */
function decodePolyline(str: string): LatLng[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const out: LatLng[] = [];
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}
