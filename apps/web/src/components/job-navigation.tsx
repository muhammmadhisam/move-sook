'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  Loader2,
  Navigation,
  RotateCw,
  TriangleAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import { fetchRoutePath } from '@/lib/geo';
import { DEST_ICON, DRIVER_ICON, PICKUP_ICON } from '@/lib/marker-icons';

export interface LatLng {
  lat: number;
  lng: number;
}

interface JobNavigationProps {
  /** Pickup point (yellow box pin). */
  origin?: LatLng | null;
  /** Dropoff point (green box pin). */
  dest?: LatLng | null;
  /** The leg to navigate right now — pickup while heading to collect, dropoff while delivering. */
  target: LatLng;
  targetLabel: string;
  /** Push the driver's live GPS to the API so the customer can track them. */
  broadcast?: boolean;
  className?: string;
}

const BROADCAST_MS = 15_000; // match DriverLocationBroadcaster throttle
const REROUTE_MS = 20_000; // refresh the route (and ETA) at least this often
const REROUTE_MOVE_M = 70; // …or sooner if the driver drifts this far from the last route
const STEP_ARRIVE_M = 25; // advance to the next maneuver within this radius
const GPS_WAIT_MS = 8_000; // show the overview route if no GPS fix arrives this fast

/** Haversine distance in metres. */
function distM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fmtDist(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} ม.`;
  return `${(m / 1000).toFixed(1)} กม.`;
}

/** Google step.instructions is HTML ("Turn <b>right</b> onto…"); flatten to plain text. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ManeuverIcon({ maneuver }: { maneuver?: string }) {
  const cls = 'h-7 w-7 shrink-0';
  if (!maneuver) return <ArrowUp className={cls} />;
  if (maneuver.startsWith('uturn')) return <RotateCw className={cls} />;
  if (maneuver.includes('left')) return <CornerUpLeft className={cls} />;
  if (maneuver.includes('right')) return <CornerUpRight className={cls} />;
  return <ArrowUp className={cls} />;
}

type NavMode = 'locating' | 'nav' | 'fallback';

interface NavState {
  mode: NavMode;
  instruction?: string;
  maneuver?: string;
  distToStep?: number;
  remainingText?: string;
  etaText?: string;
  arrived?: boolean;
}

/** Imperatively draws the route + driver car, follows the driver, and reports nav state up. */
function NavOverlay({
  origin,
  dest,
  target,
  broadcast,
  onState,
}: {
  origin?: LatLng | null;
  dest?: LatLng | null;
  target: LatLng;
  broadcast: boolean;
  onState: (s: NavState) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');

  const stepsRef = useRef<google.maps.DirectionsStep[]>([]);
  const stepIdxRef = useRef(0);
  const lastRouteAt = useRef(0);
  const lastRoutePos = useRef<LatLng | null>(null);
  const lastSent = useRef(0);
  const followRef = useRef(true);
  const fittedRef = useRef(false);
  const fixRef = useRef(false); // have we ever had a GPS fix?

  const routeLine = useRef<google.maps.Polyline | null>(null); // live leg (blue)
  const fallbackLine = useRef<google.maps.Polyline | null>(null); // overview trip (red)
  const meMarker = useRef<google.maps.Marker | null>(null);
  const svc = useRef<google.maps.DirectionsService | null>(null);

  // Endpoint markers (yellow box pickup / green box dropoff).
  useEffect(() => {
    if (!map) return;
    const markers: google.maps.Marker[] = [];
    if (origin)
      markers.push(new google.maps.Marker({ map, position: origin, icon: PICKUP_ICON }));
    if (dest) markers.push(new google.maps.Marker({ map, position: dest, icon: DEST_ICON }));
    return () => markers.forEach((m) => m.setMap(null));
  }, [map, origin, dest]);

  // Pause auto-follow once the user pans the map themselves.
  useEffect(() => {
    if (!map) return;
    const l = map.addListener('dragstart', () => {
      followRef.current = false;
    });
    return () => l.remove();
  }, [map]);

  // Re-frame (and resume follow) when the navigated leg changes, e.g. pickup → dropoff.
  useEffect(() => {
    fittedRef.current = false;
    followRef.current = true;
  }, [target]);

  const drawActiveLeg = useCallback(
    (pts: LatLng[]) => {
      if (routeLine.current) routeLine.current.setMap(null);
      routeLine.current = new google.maps.Polyline({
        map,
        path: pts,
        strokeColor: '#2E90FA', // active leg you're driving now (blue)
        strokeOpacity: 0.9,
        strokeWeight: 6,
      });
    },
    [map],
  );

  const clearFallback = useCallback(() => {
    if (fallbackLine.current) {
      fallbackLine.current.setMap(null);
      fallbackLine.current = null;
    }
  }, []);

  // Overview trip route (pickup → dropoff) — shown when we can't get the driver's GPS, so
  // the screen always shows *something* instead of hanging.
  const drawTripFallback = useCallback(() => {
    if (!map || !routesLib || !origin || !dest || fixRef.current || fallbackLine.current) return;
    onState({ mode: 'fallback' });
    const place = (pts: LatLng[]) => {
      if (fixRef.current) return;
      fallbackLine.current = new google.maps.Polyline({
        map,
        path: pts,
        strokeColor: '#E0202A', // overview trip (brand red)
        strokeOpacity: 0.9,
        strokeWeight: 5,
      });
      const b = new google.maps.LatLngBounds();
      pts.forEach((p) => b.extend(p));
      map.fitBounds(b, 64);
    };
    // Static origin→dest overview — served from the API's cached route proxy
    // (the live turn-by-turn leg below still uses Google directly for steps).
    void fetchRoutePath(origin, dest).then(place);
  }, [map, routesLib, origin, dest, onState]);

  const recompute = useCallback(
    (from: LatLng) => {
      if (!svc.current) return;
      // Straight-line fallback so the active leg still shows if routing is unavailable.
      const fallback = () => {
        stepsRef.current = [];
        drawActiveLeg([from, target]);
        const d = distM(from, target);
        onState({
          mode: 'nav',
          instruction: 'มุ่งหน้าสู่เป้าหมาย',
          distToStep: d,
          remainingText: fmtDist(d),
          arrived: d < STEP_ARRIVE_M,
        });
      };
      void svc.current
        .route({ origin: from, destination: target, travelMode: google.maps.TravelMode.DRIVING })
        .then((res) => {
          const leg = res.routes[0]?.legs[0];
          const path = res.routes[0]?.overview_path;
          if (!leg || !path) {
            fallback();
            return;
          }
          stepsRef.current = leg.steps;
          stepIdxRef.current = 0;
          drawActiveLeg(path.map((p) => ({ lat: p.lat(), lng: p.lng() })));
          const first = leg.steps[0];
          onState({
            mode: 'nav',
            instruction: first ? stripHtml(first.instructions) : 'เริ่มเดินทาง',
            maneuver: first?.maneuver,
            distToStep: first ? distM(from, first.end_location.toJSON()) : 0,
            etaText: leg.duration?.text ?? '',
            remainingText: leg.distance?.text ?? '',
            arrived: false,
          });
        })
        .catch(fallback);
    },
    [target, onState, drawActiveLeg],
  );

  // Advance the highlighted maneuver as the driver passes each step.
  const refreshStep = useCallback(
    (me: LatLng) => {
      const steps = stepsRef.current;
      if (steps.length === 0) return;
      let idx = stepIdxRef.current;
      while (idx < steps.length - 1) {
        const end = steps[idx]!.end_location.toJSON();
        if (distM(me, end) < STEP_ARRIVE_M) idx += 1;
        else break;
      }
      stepIdxRef.current = idx;
      const step = steps[idx]!;
      const toTarget = distM(me, target);
      onState({
        mode: 'nav',
        instruction: stripHtml(step.instructions),
        maneuver: step.maneuver,
        distToStep: distM(me, step.end_location.toJSON()),
        remainingText: fmtDist(toTarget),
        arrived: toTarget < STEP_ARRIVE_M,
      });
    },
    [target, onState],
  );

  // Geolocation watch: drive the car, follow, broadcast, (re)route — with graceful fallback.
  useEffect(() => {
    if (!map || !routesLib) return;
    svc.current = new routesLib.DirectionsService();
    fixRef.current = false;
    onState({ mode: 'locating' });

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      drawTripFallback();
      return;
    }

    // If no fix arrives promptly (e.g. desktop, denied, kCLErrorLocationUnknown), show the
    // overview route so navigation never hangs on a blank map.
    const waitTimer = window.setTimeout(() => {
      if (!fixRef.current) drawTripFallback();
    }, GPS_WAIT_MS);

    const onPos = (pos: GeolocationPosition) => {
      const me: LatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      fixRef.current = true;
      clearFallback();

      // Driver car marker.
      if (!meMarker.current) {
        meMarker.current = new google.maps.Marker({
          map,
          position: me,
          icon: DRIVER_ICON,
          zIndex: 999,
        });
      } else {
        meMarker.current.setPosition(me);
      }

      // First fix: frame the whole leg (driver → target) once. After that, just follow.
      if (!fittedRef.current) {
        fittedRef.current = true;
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(me);
        bounds.extend(target);
        map.fitBounds(bounds, 80);
      } else if (followRef.current) {
        map.panTo(me);
      }

      // Reroute on a timer, on first fix, or when drifting off the planned line.
      const now = Date.now();
      const moved = lastRoutePos.current ? distM(me, lastRoutePos.current) : Infinity;
      if (
        stepsRef.current.length === 0 ||
        now - lastRouteAt.current > REROUTE_MS ||
        moved > REROUTE_MOVE_M
      ) {
        lastRouteAt.current = now;
        lastRoutePos.current = me;
        recompute(me);
      } else {
        refreshStep(me);
      }

      // Best-effort broadcast so the customer's live tracking stays fresh.
      if (broadcast && now - lastSent.current > BROADCAST_MS) {
        lastSent.current = now;
        void api.drivers.me.location.$patch({ json: { lat: me.lat, lng: me.lng } }).catch(() => {});
      }
    };

    const onErr = () => {
      if (!fixRef.current) drawTripFallback();
    };

    const watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    });

    return () => {
      window.clearTimeout(waitTimer);
      navigator.geolocation.clearWatch(watchId);
      if (routeLine.current) routeLine.current.setMap(null);
      clearFallback();
      if (meMarker.current) meMarker.current.setMap(null);
      routeLine.current = null;
      meMarker.current = null;
    };
  }, [
    map,
    routesLib,
    target,
    broadcast,
    recompute,
    refreshStep,
    onState,
    clearFallback,
    drawTripFallback,
  ]);

  return null;
}

export function JobNavigation({
  origin,
  dest,
  target,
  targetLabel,
  broadcast = false,
  className,
}: JobNavigationProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [nav, setNav] = useState<NavState>({ mode: 'locating' });

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted p-4 text-center text-sm text-muted-foreground">
        ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      </div>
    );
  }

  const banner = (() => {
    if (nav.mode === 'locating') {
      return {
        icon: <Loader2 className="h-7 w-7 shrink-0 animate-spin" />,
        title: 'กำลังค้นหาตำแหน่งของคุณ…',
        sub: 'อนุญาตการเข้าถึงตำแหน่งเพื่อเริ่มนำทาง',
      };
    }
    if (nav.mode === 'fallback') {
      return {
        icon: <TriangleAlert className="h-7 w-7 shrink-0" />,
        title: 'ใช้ตำแหน่ง GPS ไม่ได้',
        sub: `แสดงเส้นทางรวมไป${targetLabel}แทน`,
      };
    }
    return {
      icon: nav.arrived ? <Flag className="h-7 w-7 shrink-0" /> : <ManeuverIcon maneuver={nav.maneuver} />,
      title: nav.arrived ? `ถึง${targetLabel}แล้ว` : (nav.instruction ?? `กำลังนำทางไป${targetLabel}…`),
      sub: !nav.arrived && nav.distToStep != null ? `อีก ${fmtDist(nav.distToStep)}` : null,
    };
  })();

  return (
    <div className={className}>
      <div className="relative h-full w-full">
        {/* Turn / status banner */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
          <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-brand-600 px-4 py-3 text-white shadow-lg">
            {banner.icon}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{banner.title}</p>
              {banner.sub && <p className="truncate text-xs text-white/80">{banner.sub}</p>}
            </div>
          </div>
        </div>

        <APIProvider apiKey={apiKey}>
          <Map
            defaultCenter={target}
            defaultZoom={13}
            gestureHandling="greedy"
            disableDefaultUI
            clickableIcons={false}
            style={{ width: '100%', height: '100%' }}
          >
            <NavOverlay
              origin={origin}
              dest={dest}
              target={target}
              broadcast={broadcast}
              onState={setNav}
            />
          </Map>
        </APIProvider>

        {/* Remaining-distance strip */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
          <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl bg-background px-4 py-2.5 shadow-lg">
            <div className="flex items-center gap-2 text-sm">
              <Navigation className="h-4 w-4 text-brand-600" />
              <span className="font-medium">{targetLabel}</span>
            </div>
            <div className="text-right text-sm">
              {nav.remainingText && <span className="font-semibold">{nav.remainingText}</span>}
              {nav.etaText && <span className="text-muted-foreground"> · {nav.etaText}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
