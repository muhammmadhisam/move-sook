'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  APIProvider,
  Map,
  Marker,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
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
  className?: string;
}

// Hat Yai, Songkhla — a sensible default for the southern launch area.
const DEFAULT_CENTER: LatLng = { lat: 7.0086, lng: 100.4747 };

/** Pans/zooms the map to follow an externally-set value (e.g. an autocomplete pick). */
function RecenterMap({ target }: { target: LatLng | null }) {
  const map = useMap();
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
  value,
  onChange,
  onResolve,
  icon,
  center,
}: {
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
      <RecenterMap target={value} />
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
  className,
}: LocationPickerProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed bg-muted p-3 text-center text-xs text-muted-foreground">
        ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY เพื่อปักหมุดบนแผนที่
      </div>
    );
  }

  const center = value ?? defaultCenter ?? DEFAULT_CENTER;

  return (
    <div className={className}>
      <APIProvider apiKey={apiKey}>
        <PickerMap
          value={value}
          onChange={onChange}
          onResolve={onResolve}
          icon={icon}
          center={center}
        />
      </APIProvider>
    </div>
  );
}
