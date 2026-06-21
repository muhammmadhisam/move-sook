'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  APIProvider,
  Map,
  Marker,
  useMap,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { LocateFixed, Maximize2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@movesook/ui';
import { reverseGeocodeRemote } from '@/lib/geo';
import type { LatLng } from './job-route-map';

/** Address + canonical Thai province resolved by reverse-geocoding a map tap. */
export interface ResolvedPlace {
  address: string;
  /** Canonical name_th, or '' when the geocoder province couldn't be matched. */
  province: string;
}

interface LocationPickerProps {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  /**
   * Called after a map tap once the point is reverse-geocoded. Lets the form
   * auto-fill the address + province so a tap alone is a complete location.
   */
  onResolve?: (place: ResolvedPlace) => void;
  /** Marker icon URL (e.g. green/red dot). */
  icon?: string;
  /** Fallback center when nothing is picked yet. */
  defaultCenter?: LatLng;
  /** Title for the enlarged (fullscreen) map dialog, e.g. "ปักหมุดจุดรับของ". */
  expandLabel?: string;
  className?: string;
}

// Hat Yai, Songkhla — a sensible default for the southern launch area.
const DEFAULT_CENTER: LatLng = { lat: 7.0086, lng: 100.4747 };

/** Pans/zooms the map to follow an externally-set value (e.g. an autocomplete pick). */
function RecenterMap({ mapId, target }: { mapId: string; target: LatLng | null }) {
  const map = useMap(mapId);
  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target);
    map.setZoom(15);
  }, [map, target]);
  return null;
}

/**
 * "My location" button overlaid on the map. Asks the browser for the device's
 * current position, then pans/zooms there and drops the pin (same path as a tap,
 * so the address + province get reverse-geocoded too).
 */
function MyLocationButton({
  mapId,
  onPick,
}: {
  mapId: string;
  onPick: (point: LatLng) => void;
}) {
  const map = useMap(mapId);
  const [locating, setLocating] = useState(false);

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onPick(point);
        if (map) {
          map.panTo(point);
          map.setZoom(16);
        }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <button
      type="button"
      onClick={handleLocate}
      disabled={locating}
      aria-label="ไปยังตำแหน่งของฉัน"
      className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-background disabled:opacity-60"
    >
      <LocateFixed className={`h-3.5 w-3.5 ${locating ? 'animate-pulse' : ''}`} />
      ตำแหน่งของฉัน
    </button>
  );
}

/**
 * The map itself, rendered inside APIProvider so it can use the geocoding
 * library. Clicking sets a marker and, when onResolve is given, reverse-geocodes
 * the point into a formatted address + canonical Thai province.
 */
function PickerMap({
  id,
  value,
  onChange,
  onResolve,
  icon,
  center,
}: {
  /** Stable map id so useMap() targets this instance (two maps share one provider). */
  id: string;
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  onResolve?: (place: ResolvedPlace) => void;
  icon?: string;
  center: LatLng;
}) {
  const resolve = useCallback(
    async (latLng: LatLng) => {
      if (!onResolve) return;
      // Reverse geocoding goes through the API's cached proxy (GET /geo/
      // reverse-geocode); best-effort, so the tap still sets coordinates on miss.
      const place = await reverseGeocodeRemote(latLng.lat, latLng.lng);
      if (place) onResolve({ address: place.address, province: place.province });
    },
    [onResolve],
  );

  const pickPoint = useCallback(
    (point: LatLng) => {
      onChange(point);
      void resolve(point);
    },
    [onChange, resolve],
  );

  const handleClick = (event: MapMouseEvent) => {
    const latLng = event.detail.latLng;
    if (!latLng) return;
    pickPoint({ lat: latLng.lat, lng: latLng.lng });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Map
        id={id}
        defaultCenter={center}
        defaultZoom={value ? 15 : 11}
        gestureHandling="greedy"
        clickableIcons={false}
        disableDefaultUI
        zoomControl
        onClick={handleClick}
        style={{ width: '100%', height: '100%' }}
      >
        {value && <Marker position={value} icon={icon} />}
        <RecenterMap mapId={id} target={value} />
      </Map>
      <MyLocationButton mapId={id} onPick={pickPoint} />
    </div>
  );
}

/**
 * Tap-to-pin location picker. Clicking the map sets a single marker, reports its
 * coordinates via onChange, and (via onResolve) reverse-geocodes them into an
 * address + province. Degrades to a placeholder without an API key.
 */
export function LocationPicker({
  value,
  onChange,
  onResolve,
  icon,
  defaultCenter,
  expandLabel = 'ปักหมุดบนแผนที่',
  className,
}: LocationPickerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [expanded, setExpanded] = useState(false);
  const baseId = useId();

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted p-3 text-center text-xs text-muted-foreground">
        ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY เพื่อปักหมุดบนแผนที่
      </div>
    );
  }

  const center = value ?? defaultCenter ?? DEFAULT_CENTER;

  // One APIProvider wraps both the inline map and the dialog map; the dialog is
  // rendered through a portal but React context still flows to it, so both share
  // the loaded Maps SDK and the same value/onChange/onResolve pin state.
  return (
    <APIProvider apiKey={apiKey}>
      <div className={className} style={{ position: 'relative' }}>
        <PickerMap
          id={`${baseId}-inline`}
          value={value}
          onChange={onChange}
          onResolve={onResolve}
          icon={icon}
          center={center}
        />
        {/* Expand to a large, easier-to-pin fullscreen map. */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="ขยายแผนที่"
          className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 text-xs font-medium shadow-sm backdrop-blur transition-colors hover:bg-background"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          ขยายแผนที่
        </button>
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        {/*
          Full dynamic-viewport height on phones (h-[100dvh] dodges mobile browser
          chrome that made the old 85vh overflow & hide the close button); a
          centered card on sm+. min-h-0 lets the map flex-shrink instead of
          pushing the footer off-screen.
        */}
        <DialogContent className="flex h-[100dvh] max-w-3xl flex-col gap-3 rounded-none p-4 sm:h-[85vh] sm:rounded-xl sm:p-6">
          <DialogHeader>
            <DialogTitle>{expandLabel}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            แตะบนแผนที่เพื่อปักหมุด · เลื่อน/ซูมเพื่อหาตำแหน่งให้แม่นยำ
          </p>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
            {expanded && (
              <PickerMap
                id={`${baseId}-expanded`}
                value={value}
                onChange={onChange}
                onResolve={onResolve}
                icon={icon}
                center={center}
              />
            )}
          </div>
          {/* Always-visible, thumb-friendly confirm/close at the bottom. */}
          <DialogClose asChild>
            <Button type="button" className="w-full">
              {value ? 'ยืนยันตำแหน่งนี้' : 'เสร็จสิ้น'}
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </APIProvider>
  );
}
