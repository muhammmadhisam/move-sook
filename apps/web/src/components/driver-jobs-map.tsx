'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APIProvider, Map, Marker, useMap } from '@vis.gl/react-google-maps';
import { toast } from 'sonner';
import { ArrowRight, MapPin, Navigation, Truck, X } from 'lucide-react';
import { Button, Badge, cn } from '@movesook/ui';
import { VEHICLE_TYPE_LABEL, type JobListResponse } from '@movesook/shared';
import { api } from '@/lib/api';
import { useGeolocation } from '@/hooks/use-geolocation';
import { distanceKm, formatDistance, directionsUrl } from '@/lib/geo';
import { DRIVER_ICON, PICKUP_ICON, DEST_ICON } from '@/lib/marker-icons';
import type { LatLng } from '@/components/job-route-map';

const THAILAND_CENTER: LatLng = { lat: 13.7563, lng: 100.5018 };

function toLatLng(lat: number | null, lng: number | null): LatLng | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

/** Fits the viewport to the driver + all pickup points (re-runs when they change). */
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]!);
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [map, points]);
  return null;
}

export function DriverJobsMap() {
  const queryClient = useQueryClient();
  const geo = useGeolocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const jobs = useQuery({
    queryKey: ['jobs', 'available'],
    queryFn: async (): Promise<JobListResponse> => {
      const res = await api.jobs.$get({ query: {} });
      if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
      return (await res.json()) as JobListResponse;
    },
  });

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.jobs[':id'].accept.$post({ param: { id } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const err = new Error(body?.error ?? 'รับงานไม่สำเร็จ') as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('รับงานแล้ว ดูได้ที่ "งานที่รับไว้"');
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (e: Error & { status?: number }) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] }); // drop a job claimed by someone else
      toast[e.status === 409 ? 'info' : 'error'](
        e.status === 409 ? e.message || 'งานนี้ถูกคนขับคนอื่นรับไปแล้ว' : e.message,
      );
    },
  });

  // Only jobs with pickup coordinates can appear on the map.
  const mapJobs = useMemo(
    () => (jobs.data?.items ?? []).filter((j) => j.originLat != null && j.originLng != null),
    [jobs.data?.items],
  );

  const fitPoints = useMemo(() => {
    const pts = mapJobs.map((j) => ({ lat: j.originLat!, lng: j.originLng! }));
    if (geo.position) pts.push(geo.position);
    return pts;
  }, [mapJobs, geo.position]);

  const selected = mapJobs.find((j) => j.id === selectedId) ?? null;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed bg-muted p-4 text-center text-sm text-muted-foreground">
        ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      </div>
    );
  }

  const center = geo.position ?? toLatLng(mapJobs[0]?.originLat ?? null, mapJobs[0]?.originLng ?? null) ?? THAILAND_CENTER;

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-xl border">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          defaultZoom={12}
          gestureHandling="greedy"
          disableDefaultUI
          clickableIcons={false}
          style={{ width: '100%', height: '100%' }}
        >
          {geo.position && <Marker position={geo.position} title="ตำแหน่งของคุณ" icon={DRIVER_ICON} />}
          {mapJobs.map((job) => (
            <Marker
              key={job.id}
              position={{ lat: job.originLat!, lng: job.originLng! }}
              title={job.itemDescription}
              icon={job.id === selectedId ? DEST_ICON : PICKUP_ICON}
              zIndex={job.id === selectedId ? 10 : 1}
              onClick={() => setSelectedId(job.id)}
            />
          ))}
          <FitBounds points={fitPoints} />
        </Map>
      </APIProvider>

      {/* Empty / loading hints */}
      {jobs.isLoading && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">
          กำลังโหลดงาน…
        </div>
      )}
      {!jobs.isLoading && mapJobs.length === 0 && (
        <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow">
          ยังไม่มีงานในพื้นที่ของคุณ
        </div>
      )}

      {/* Selected-job card — accept straight from the map */}
      {selected && (
        <div className="absolute inset-x-2 bottom-2 rounded-xl border bg-background/97 p-3 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{selected.itemDescription}</p>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                {selected.originProvince}
                <ArrowRight className="h-3 w-3 shrink-0" />
                {selected.destProvince}
              </p>
            </div>
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => setSelectedId(null)}
              className="-mr-1 -mt-1 rounded p-1 text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {selected.priceQuoted != null && (
              <span className="text-lg font-bold text-brand-600">
                ฿{selected.priceQuoted.toLocaleString()}
              </span>
            )}
            <Badge variant="secondary" className="gap-1">
              <Truck className="h-3 w-3" />
              {VEHICLE_TYPE_LABEL[selected.vehicleType]}
            </Badge>
            {geo.position && selected.originLat != null && selected.originLng != null && (
              <Badge className="gap-1 border-transparent bg-brand-50 text-brand-700">
                <Navigation className="h-3 w-3" />
                {formatDistance(
                  distanceKm(geo.position, { lat: selected.originLat, lng: selected.originLng }),
                )}
              </Badge>
            )}
          </div>
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            {selected.originAddress}
          </p>

          <div className="mt-2.5 flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              asChild
            >
              <a
                href={directionsUrl(
                  { lat: selected.originLat!, lng: selected.originLng! },
                  geo.position,
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation className="mr-1.5 h-4 w-4" />
                นำทาง
              </a>
            </Button>
            <Button
              className={cn('flex-1')}
              disabled={accept.isPending}
              onClick={() => accept.mutate(selected.id)}
            >
              รับงานนี้
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
