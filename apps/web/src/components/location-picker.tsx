'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  APIProvider,
  Map,
  Marker,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import { Maximize2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@movesook/ui';
import { matchProvinceName } from '@movesook/thailand-provinces/province';
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
  const geocoding = useMapsLibrary('geocoding');
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  useEffect(() => {
    if (geocoding && !geocoderRef.current) {
      geocoderRef.current = new geocoding.Geocoder();
    }
  }, [geocoding]);

  const resolve = useCallback(
    async (latLng: LatLng) => {
      const geocoder = geocoderRef.current;
      if (!geocoder || !onResolve) return;
      try {
        const { results } = await geocoder.geocode({
          location: latLng,
          language: 'th',
        });
        const best = results[0];
        if (!best) return;
        const provinceComp = best.address_components.find((c) =>
          c.types.includes('administrative_area_level_1'),
        );
        const province = provinceComp ? (matchProvinceName(provinceComp.long_name) ?? '') : '';
        onResolve({ address: best.formatted_address, province });
      } catch {
        // Reverse geocoding is best-effort; the tap still sets coordinates.
      }
    },
    [onResolve],
  );

  const handleClick = (event: MapMouseEvent) => {
    const latLng = event.detail.latLng;
    if (!latLng) return;
    const point = { lat: latLng.lat, lng: latLng.lng };
    onChange(point);
    void resolve(point);
  };

  return (
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
        <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-3 p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{expandLabel}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            แตะบนแผนที่เพื่อปักหมุด · เลื่อน/ซูมเพื่อหาตำแหน่งให้แม่นยำ
          </p>
          <div className="flex-1 overflow-hidden rounded-lg border">
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
        </DialogContent>
      </Dialog>
    </APIProvider>
  );
}
