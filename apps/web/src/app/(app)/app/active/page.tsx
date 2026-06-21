'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PreviewableImage,
  cn,
} from '@movesook/ui';
import {
  DEFAULT_SYSTEM_SETTINGS,
  isInHand,
  type JobDto,
  type JobListResponse,
  type JobStatus,
  type PublicSystemConfig,
} from '@movesook/shared';

type TabKey = 'active' | 'done';
const TAB_GROUPS: Record<TabKey, Set<JobStatus>> = {
  active: new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'PENDING_CONFIRMATION']),
  done: new Set(['DELIVERED', 'CANCELLED']),
};
const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'กำลังทำ' },
  { key: 'done', label: 'ประวัติ' },
];
import { FileText, Flag, MapPin, Package, Phone } from 'lucide-react';
import { api, API_BASE_URL } from '@/lib/api';
import { useGeolocation } from '@/hooks/use-geolocation';
import { distanceKm, formatDistance } from '@/lib/geo';
import { ImageUploadGallery } from '@/components/image-upload-gallery';
import { CodCollectionCard } from '@/components/cod-collection-card';
import {
  JOB_STATUS_LABEL,
  JOB_STATUS_VARIANT,
  nextForwardStatus,
} from '@/lib/job-display';
import { PageTour, type TourStep } from '@/components/tour/tour';

const ACTIVE_TOUR: TourStep[] = [
  {
    element: '[data-tour="active-head"]',
    popover: {
      title: 'งานที่คุณรับไว้',
      description: 'จัดการงานที่กำลังทำที่นี่ — กดอัปเดตสถานะ (รับของ → กำลังส่ง → ส่งสำเร็จ) ตามขั้นตอนงานจริง',
    },
  },
  {
    popover: {
      title: 'ปิดงานให้ครบ',
      description:
        'อัปโหลดรูปหลักฐานการส่ง และต้องอยู่ในรัศมีปลายทางจึงจะกดส่งสำเร็จได้ งาน COD จะมีการ์ดเก็บเงินปลายทางให้ด้วย',
    },
  },
];

// Marking a delivery done is gated on the driver being within the admin-configured radius
// of the job's destination. Enforced in production only — geocoding/GPS precision plus
// local-testing convenience make it impractical to gate in dev.
const ENFORCE_DELIVERY_GEOFENCE = process.env.NODE_ENV === 'production';

async function fetchActiveJobs(): Promise<JobListResponse> {
  const res = await api.jobs.$get({ query: { mine: 'true' } });
  if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
  return (await res.json()) as JobListResponse;
}

export default function ActiveJobsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('active');
  // Pickup requires the driver to acknowledge responsibility before the ACCEPTED -> PICKED_UP
  // transition. We stage the job id here and only advance once they tick the consent box.
  const [pickupConsentJobId, setPickupConsentJobId] = useState<string | null>(null);
  const [pickupConsentChecked, setPickupConsentChecked] = useState(false);
  // Driver's live position — used to gate marking a delivery done within the destination area.
  const geo = useGeolocation();
  // Admin-configured delivery geofence radius (metres; 0 = off).
  const sysConfig = useQuery({
    queryKey: ['system', 'public'],
    queryFn: async (): Promise<PublicSystemConfig> => {
      const res = await api.system.public.$get();
      if (!res.ok) throw new Error('โหลดการตั้งค่าไม่สำเร็จ');
      return (await res.json()) as PublicSystemConfig;
    },
  });
  const geofenceMeters =
    sysConfig.data?.deliveryGeofenceMeters ?? DEFAULT_SYSTEM_SETTINGS.deliveryGeofenceMeters;
  const jobs = useQuery({ queryKey: ['active-jobs'], queryFn: fetchActiveJobs });

  const advance = useMutation({
    mutationFn: async (args: { id: string; status: JobStatus; lat?: number; lng?: number }) => {
      const res = await api.jobs[':id'].status.$patch({
        param: { id: args.id },
        json: {
          status: args.status,
          ...(args.lat != null && args.lng != null ? { lat: args.lat, lng: args.lng } : {}),
        },
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(err?.message ?? 'อัปเดตสถานะไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('อัปเดตสถานะแล้ว');
      queryClient.invalidateQueries({ queryKey: ['active-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const flagIllegal = useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const res = await api.jobs[':id']['flag-illegal'].$post({
        param: { id: args.id },
        json: { reason: args.reason },
      });
      if (!res.ok) throw new Error('แจ้งของผิดกฎหมายไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      toast.success('แจ้งของผิดกฎหมายแล้ว · ทีมงานจะตรวจสอบ');
      queryClient.invalidateQueries({ queryKey: ['active-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const proof = useMutation({
    mutationFn: async (args: { id: string; kind: 'PICKUP' | 'DELIVERY'; urls: string[] }) => {
      const res = await api.jobs[':id'].proof.$post({
        param: { id: args.id },
        json: { kind: args.kind, urls: args.urls },
      });
      if (!res.ok) throw new Error('แนบรูปไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      toast.success('บันทึกรูปแล้ว');
      queryClient.invalidateQueries({ queryKey: ['active-jobs'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = jobs.data?.items ?? [];
  const counts = {
    active: all.filter((j) => TAB_GROUPS.active.has(j.status)).length,
    done: all.filter((j) => TAB_GROUPS.done.has(j.status)).length,
  };
  const filtered = all.filter((j) => TAB_GROUPS[tab].has(j.status));

  return (
    <main className="mx-auto max-w-md p-6">
      <PageTour id="active" steps={ACTIVE_TOUR} />
      <h1 data-tour="active-head" className="mb-4 text-2xl font-semibold tracking-tight">งานที่รับไว้</h1>

      <div className="mb-4 flex rounded-lg border bg-muted/40 p-1">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
                isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t.label}
              {counts[t.key] > 0 ? ` (${counts[t.key]})` : ''}
            </button>
          );
        })}
      </div>

      {jobs.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {!jobs.isLoading && filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">ไม่มีงานในหมวดนี้</p>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((job: JobDto) => {
          const next = nextForwardStatus(job.status);
          const photo = job.itemPhotos[0];
          // Delivery proof becomes relevant once the items are in the driver's hands.
          const canUploadDelivery = job.status === 'PICKED_UP' || job.status === 'IN_TRANSIT';
          // Proof photos freeze once the job is closed (DELIVERED/CANCELLED) — mirror the
          // API guard so the gallery shows photos read-only instead of an add tile that 422s.
          const proofLocked = !isInHand(job.status) && job.status !== 'PENDING_CONFIRMATION';
          return (
            <Card key={job.id} className="overflow-hidden">
              {/* Header: thumbnail + title + status + price */}
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
                    <Badge variant={JOB_STATUS_VARIANT[job.status]} className="shrink-0">
                      {JOB_STATUS_LABEL[job.status]}
                    </Badge>
                  </div>
                  {job.priceQuoted != null && (
                    <p className="mt-1 text-lg font-bold text-brand-600">
                      ฿{job.priceQuoted.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Route timeline */}
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

              <CardContent className="flex flex-col gap-3 p-4 pt-0">
                <div className="flex gap-2">
                  <Button asChild variant="outline" className="flex-1">
                    <Link href={`/app/active/${job.id}/route`}>
                      <MapPin className="mr-1.5 h-4 w-4" />
                      ดูเส้นทาง
                    </Link>
                  </Button>
                  {/* Printable job worksheet (ใบสรุปงาน) for the accepted job. */}
                  <Button asChild variant="outline" className="flex-1">
                    <a
                      href={`${API_BASE_URL}/jobs/${job.id}/worksheet`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText className="mr-1.5 h-4 w-4" />
                      พิมพ์ใบงาน
                    </a>
                  </Button>
                </div>

                {/* Call the customer — shown while the job is still active and a phone is on file. */}
                {job.contactPhone && isInHand(job.status) && (
                  <Button asChild variant="outline" className="w-full">
                    <a href={`tel:${job.contactPhone}`}>
                      <Phone className="mr-1.5 h-4 w-4" />
                      โทรหาลูกค้า ({job.contactPhone})
                    </a>
                  </Button>
                )}

                {/* Proof photos — multiple allowed */}
                {/* Pickup proof: editable while in-hand, read-only once the job is closed. */}
                {(!proofLocked || job.pickupProofUrls.length > 0) && (
                  <ImageUploadGallery
                    folder="proof"
                    label={`รูปตอนรับของ (${job.pickupProofUrls.length})`}
                    value={job.pickupProofUrls}
                    onChange={(urls) => proof.mutate({ id: job.id, kind: 'PICKUP', urls })}
                    disabled={proof.isPending || proofLocked}
                  />
                )}
                {canUploadDelivery && (
                  <ImageUploadGallery
                    folder="proof"
                    label={`รูปตอนส่ง (${job.deliveryProofUrls.length})`}
                    value={job.deliveryProofUrls}
                    onChange={(urls) => proof.mutate({ id: job.id, kind: 'DELIVERY', urls })}
                    disabled={proof.isPending}
                  />
                )}
                {/* Closed job with delivery photos: show them read-only for the record. */}
                {proofLocked && job.deliveryProofUrls.length > 0 && (
                  <ImageUploadGallery
                    label={`รูปตอนส่ง (${job.deliveryProofUrls.length})`}
                    value={job.deliveryProofUrls}
                    onChange={() => {}}
                    disabled
                  />
                )}

                {/* COD: record how the customer paid before the delivery can be marked done. */}
                {job.paymentMethod === 'COD' &&
                  (isInHand(job.status) || job.status === 'PENDING_CONFIRMATION') && (
                    <CodCollectionCard job={job} />
                  )}

                {job.status === 'PENDING_CONFIRMATION' && (
                  <p className="rounded-lg border border-dashed bg-muted p-3 text-center text-sm text-muted-foreground">
                    แจ้งส่งสำเร็จแล้ว · รอแอดมินยืนยัน
                  </p>
                )}

                {next &&
                  (() => {
                    const isDelivery = next === 'PENDING_CONFIRMATION';
                    // COD delivery can't be declared until the driver records the payment.
                    const codBlocks =
                      isDelivery && job.paymentMethod === 'COD' && !job.codCollectedAt;
                    // Picking up the parcel requires a responsibility acknowledgement first.
                    const needsPickupConsent = next === 'PICKED_UP';
                    // Geofence: the driver must be within the destination area to mark a
                    // delivery done. Enforced in production only, and only when the admin
                    // has a non-zero radius configured.
                    const geofenceKm = geofenceMeters / 1000;
                    const dest =
                      job.destLat != null && job.destLng != null
                        ? { lat: job.destLat, lng: job.destLng }
                        : null;
                    const distToDest =
                      geo.position && dest ? distanceKm(geo.position, dest) : null;
                    const geoBlocks =
                      ENFORCE_DELIVERY_GEOFENCE &&
                      isDelivery &&
                      geofenceMeters > 0 &&
                      dest != null &&
                      (distToDest == null || distToDest > geofenceKm);
                    return (
                      <>
                        <Button
                          className="w-full"
                          disabled={advance.isPending || codBlocks || geoBlocks}
                          onClick={() => {
                            if (needsPickupConsent) {
                              setPickupConsentChecked(false);
                              setPickupConsentJobId(job.id);
                              return;
                            }
                            // Send the driver's position with the delivery so the API can
                            // verify the destination geofence.
                            advance.mutate({
                              id: job.id,
                              status: next,
                              ...(isDelivery && geo.position
                                ? { lat: geo.position.lat, lng: geo.position.lng }
                                : {}),
                            });
                          }}
                        >
                          {isDelivery
                            ? 'แจ้งส่งสำเร็จ'
                            : `อัปเดตเป็น “${JOB_STATUS_LABEL[next]}”`}
                        </Button>
                        {geoBlocks && (
                          <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-2.5 text-center text-xs text-amber-700">
                            {distToDest == null
                              ? 'เปิดการเข้าถึงตำแหน่ง (GPS) เพื่อยืนยันว่าคุณอยู่ที่จุดส่ง จึงจะกดส่งสำเร็จได้'
                              : `คุณอยู่ห่างจุดส่ง ${formatDistance(distToDest)} · ต้องอยู่ในระยะ ${formatDistance(geofenceKm)} จึงจะกดส่งสำเร็จได้`}
                          </p>
                        )}
                      </>
                    );
                  })()}

                {/* Trust & safety: report prohibited/illegal cargo (no penalty to the driver). */}
                {isInHand(job.status) && (
                  <Button
                    variant="ghost"
                    className="w-full gap-1.5 text-destructive hover:text-destructive"
                    disabled={flagIllegal.isPending}
                    onClick={() => {
                      const reason = window.prompt(
                        'พบสิ่งของผิดกฎหมาย/ต้องห้าม? โปรดอธิบายสั้น ๆ (งานจะถูกระงับเพื่อให้แอดมินตรวจสอบ)',
                      );
                      if (reason && reason.trim().length >= 3) {
                        flagIllegal.mutate({ id: job.id, reason: reason.trim() });
                      }
                    }}
                  >
                    <Flag className="h-4 w-4" />
                    แจ้งของผิดกฎหมาย
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {advance.isError && (
        <p className="mt-3 text-sm text-destructive">อัปเดตสถานะไม่สำเร็จ</p>
      )}

      <div className="mt-6 flex gap-2">
        <Button asChild className="flex-1">
          <Link href="/app/jobs">หางานใหม่</Link>
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href="/app">หน้าหลัก</Link>
        </Button>
      </div>

      {/* Driver responsibility consent — shown before confirming pickup (ACCEPTED -> PICKED_UP). */}
      <Dialog
        open={pickupConsentJobId !== null}
        onOpenChange={(open) => {
          if (!open) setPickupConsentJobId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการรับพัสดุ</DialogTitle>
            <DialogDescription>
              เมื่อรับพัสดุแล้ว พัสดุจะอยู่ในความดูแลของคุณจนกว่าจะส่งถึงปลายทาง
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
            กรุณาตรวจสอบสภาพพัสดุและถ่ายรูปก่อนรับของทุกครั้ง
            หากเกิดความเสียหาย สูญหาย หรือมีปัญหาเกี่ยวกับพัสดุระหว่างการขนส่ง
            คุณในฐานะคนขับเป็นผู้รับผิดชอบตามนโยบายของ MoveSook
          </div>

          <div className="flex items-start gap-2.5">
            <Checkbox
              checked={pickupConsentChecked}
              onCheckedChange={setPickupConsentChecked}
              className="mt-0.5"
            />
            <span
              className="cursor-pointer text-sm"
              onClick={() => setPickupConsentChecked((v) => !v)}
            >
              ข้าพเจ้าได้ตรวจสอบพัสดุแล้ว และยินยอมรับผิดชอบกรณีพัสดุมีปัญหา
            </span>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setPickupConsentJobId(null)}
            >
              ยกเลิก
            </Button>
            <Button
              className="flex-1"
              disabled={!pickupConsentChecked || advance.isPending}
              onClick={() => {
                if (!pickupConsentJobId) return;
                advance.mutate({ id: pickupConsentJobId, status: 'PICKED_UP' });
                setPickupConsentJobId(null);
              }}
            >
              ยืนยันรับพัสดุ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
