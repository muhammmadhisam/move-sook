'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  PreviewableImage,
} from '@movesook/ui';
import { vehicleTypeLabel, type JobDto, type JobListResponse } from '@movesook/shared';
import {
  Navigation,
  MapPin,
  Truck,
  Clock,
  Package,
  ArrowRight,
  Hourglass,
  ShieldX,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { JobRouteMap, type LatLng } from '@/components/job-route-map';
import { useAuth } from '@/hooks/use-auth';
import { useGeolocation } from '@/hooks/use-geolocation';
import { distanceKm, formatDistance, directionsUrl } from '@/lib/geo';

async function fetchJobs(): Promise<JobListResponse> {
  const res = await api.jobs.$get({ query: {} });
  if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
  return (await res.json()) as JobListResponse;
}

function toLatLng(lat: number | null, lng: number | null): LatLng | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

function formatSchedule(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  });
}

export default function JobsPage() {
  const queryClient = useQueryClient();
  const { me } = useAuth();

  // The API enforces both gates at accept time (403 / 422) — mirroring them here
  // keeps unready drivers from hitting a confusing rejection after the tap.
  const notApproved = me?.verifyStatus != null && me.verifyStatus !== 'APPROVED';
  const offDuty = me?.verifyStatus === 'APPROVED' && me.isAvailable === false;
  const canAccept = !notApproved && !offDuty;

  // Don't even fetch the feed for a not-yet-approved driver — they can't take work.
  const jobs = useQuery({ queryKey: ['jobs', 'available'], queryFn: fetchJobs, enabled: !notApproved });
  const geo = useGeolocation();

  // Closest pickup first; jobs without coords (or before location is granted) sink to the bottom.
  const sortedJobs = useMemo(() => {
    const items = jobs.data?.items ?? [];
    if (!geo.position) return items;
    const here = geo.position;
    return [...items].sort((a, b) => {
      const da =
        a.originLat != null && a.originLng != null
          ? distanceKm(here, { lat: a.originLat, lng: a.originLng })
          : Infinity;
      const db =
        b.originLat != null && b.originLng != null
          ? distanceKm(here, { lat: b.originLat, lng: b.originLng })
          : Infinity;
      return da - db;
    });
  }, [jobs.data?.items, geo.position]);

  const accept = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.jobs[':id'].accept.$post({ param: { id } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        // 409 = lost the claim race (someone else took it first).
        const err = new Error(body?.error ?? 'รับงานไม่สำเร็จ') as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('รับงานแล้ว ดูได้ที่ "งานที่รับไว้"');
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (e: Error & { status?: number }) => {
      // Always refresh the feed so a job claimed by someone else disappears.
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      if (e.status === 409) {
        toast.info(e.message || 'งานนี้ถูกคนขับคนอื่นรับไปแล้ว');
      } else {
        toast.error(e.message);
      }
    },
  });

  // Hard block: an unapproved driver can't browse the job feed at all.
  if (notApproved) {
    const pending = me?.verifyStatus === 'PENDING';
    return (
      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                pending ? 'bg-warning/15 text-warning' : 'bg-destructive/15 text-destructive'
              }`}
            >
              {pending ? <Hourglass className="h-7 w-7" /> : <ShieldX className="h-7 w-7" />}
            </div>
            <h1 className="text-lg font-semibold">
              {pending ? 'รอการอนุมัติจากทีมงาน' : 'ยังไม่สามารถรับงานได้'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {pending
                ? 'ทีมงานกำลังตรวจสอบใบสมัครของคุณ คุณจะเข้ารับงานได้ทันทีที่ได้รับการอนุมัติ (โดยทั่วไปไม่เกิน 24 ชั่วโมง)'
                : 'บัญชีคนขับของคุณยังไม่พร้อมรับงาน ดูรายละเอียดและสถานะได้ที่หน้าโปรไฟล์'}
            </p>
            <div className="mt-1 flex w-full flex-col gap-2">
              <Button asChild className="w-full">
                <Link href="/profile">ดูสถานะคนขับ</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/app">กลับหน้าหลัก</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">งานที่รับได้</h1>
      {offDuty && (
        <p className="mb-4 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          คุณปิดรับงานอยู่ — เปิดสถานะออนไลน์ที่หน้าโปรไฟล์ก่อนจึงจะรับงานได้
        </p>
      )}
      {(geo.status === 'denied' || geo.status === 'unsupported') && (
        <p className="mb-4 rounded-lg border border-dashed bg-muted p-3 text-sm text-muted-foreground">
          เปิดสิทธิ์การเข้าถึงตำแหน่งเพื่อดูระยะทางไปยังจุดรับของ
        </p>
      )}
      {jobs.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {jobs.data?.items.length === 0 && (
        <p className="text-sm text-muted-foreground">ยังไม่มีงานในพื้นที่ของคุณ</p>
      )}
      <div className="flex flex-col gap-3">
        {sortedJobs.map((job: JobDto) => {
          const origin = toLatLng(job.originLat, job.originLng);
          const dest = toLatLng(job.destLat, job.destLng);
          const pickupDistance =
            geo.position && origin ? distanceKm(geo.position, origin) : null;
          const photo = job.itemPhotos[0];
          const schedule = formatSchedule(job.scheduledAt);
          return (
            <Card
              key={job.id}
              className="overflow-hidden transition-shadow hover:shadow-md"
            >
              {/* Header: thumbnail + title + price */}
              <div className="flex gap-3 p-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {photo ? (
                    <PreviewableImage
                      src={photo}
                      gallery={job.itemPhotos}
                      alt={job.itemDescription}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-base font-semibold leading-tight">
                      {job.itemDescription}
                    </h3>
                    {job.priceQuoted != null && (
                      <span className="shrink-0 text-lg font-bold text-brand-600">
                        ฿{job.priceQuoted.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="gap-1">
                      <Truck className="h-3 w-3" />
                      {vehicleTypeLabel(job.vehicleType)}
                    </Badge>
                    {job.paymentMethod === 'COD' && (
                      <Badge className="gap-1 border-warning/50 bg-warning/10 text-warning">
                        <Wallet className="h-3 w-3" />
                        เก็บปลายทาง
                      </Badge>
                    )}
                    {pickupDistance != null && (
                      <Badge className="gap-1 border-transparent bg-brand-50 text-brand-700">
                        <Navigation className="h-3 w-3" />
                        {formatDistance(pickupDistance)}
                      </Badge>
                    )}
                    {schedule && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {schedule}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Route: pickup → dropoff with connector */}
              <div className="border-t px-4 py-3">
                <div className="relative space-y-3 pl-5">
                  <span className="absolute left-[3px] top-2 h-[calc(100%-1rem)] w-px bg-border" />
                  <div className="relative">
                    <span className="absolute -left-5 top-0.5 h-2.5 w-2.5 rounded-full bg-successScale-500 ring-2 ring-successScale-100" />
                    <p className="text-xs text-muted-foreground">จุดรับของ · {job.originProvince}</p>
                    <p className="truncate text-sm">{job.originAddress}</p>
                  </div>
                  <div className="relative">
                    <span className="absolute -left-5 top-0.5 h-2.5 w-2.5 rounded-full bg-error-500 ring-2 ring-error-100" />
                    <p className="text-xs text-muted-foreground">ปลายทาง · {job.destProvince}</p>
                    <p className="truncate text-sm">{job.destAddress}</p>
                  </div>
                </div>
              </div>

              <CardContent className="flex gap-2 p-4 pt-0">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex-1">
                      <MapPin className="mr-1.5 h-4 w-4" />
                      ดูเส้นทาง
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{job.itemDescription}</DialogTitle>
                      <DialogDescription className="flex flex-wrap items-center gap-1">
                        {job.originProvince}
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                        {job.destProvince}
                        {job.priceQuoted ? ` · ฿${job.priceQuoted.toLocaleString()}` : ''}
                      </DialogDescription>
                    </DialogHeader>

                    <JobRouteMap
                      origin={origin}
                      dest={dest}
                      driver={geo.position}
                      className="h-64 w-full overflow-hidden rounded-lg border"
                    />

                    <div className="space-y-2 text-sm">
                      {pickupDistance != null && (
                        <div className="flex gap-2">
                          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#2E90FA]" />
                          <div>
                            <p className="font-medium">ตำแหน่งของคุณ</p>
                            <p className="text-muted-foreground">
                              ห่างจากจุดรับของ {formatDistance(pickupDistance)}
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-successScale-500" />
                        <div>
                          <p className="font-medium">จุดรับของ</p>
                          <p className="text-muted-foreground">{job.originAddress}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-error-500" />
                        <div>
                          <p className="font-medium">ปลายทาง</p>
                          <p className="text-muted-foreground">{job.destAddress}</p>
                        </div>
                      </div>
                    </div>

                    {origin && (
                      <Button variant="outline" className="w-full" asChild>
                        <a
                          href={directionsUrl(origin, geo.position)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation className="mr-2 h-4 w-4" />
                          นำทางไปจุดรับของ
                        </a>
                      </Button>
                    )}

                    <Button
                      className="w-full"
                      disabled={accept.isPending || !canAccept}
                      onClick={() => accept.mutate(job.id)}
                    >
                      รับงานนี้
                    </Button>
                  </DialogContent>
                </Dialog>

                <Button
                  className="flex-1"
                  disabled={accept.isPending || !canAccept}
                  onClick={() => accept.mutate(job.id)}
                >
                  รับงานนี้
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
