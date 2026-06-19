'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, FileText, ArrowRight, Star, MapPin } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PreviewableImage,
  useConfirm,
} from '@movesook/ui';
import type { JobDetailResponse } from '@movesook/shared';
import { isCustomerCancellable } from '@movesook/shared';
import { api, API_BASE_URL } from '@/lib/api';
import { JobRouteMap } from '@/components/job-route-map';
import { PaymentSlipCard } from '@/components/payment-slip-card';
import { DestChangeCard } from '@/components/dest-change-card';
import { DisputeDialog } from '@/components/dispute-dialog';
import { ReviewDialog } from '@/components/review-dialog';
import { useAuth } from '@/hooks/use-auth';
import { useJobTrack } from '@/hooks/use-job-track';
import { JOB_STATUS_LABEL, JOB_STATUS_VARIANT, jobDest, jobOrigin } from '@/lib/job-display';

// Statuses where raising a dispute makes sense (a driver is involved through delivery).
const DISPUTABLE = new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'PENDING_CONFIRMATION', 'DELIVERED']);

// Statuses where the driver is en route and worth live-tracking.
const TRACKING_STATUSES = new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);

function agoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'เมื่อสักครู่';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  return `${Math.round(mins / 60)} ชม.ที่แล้ว`;
}

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const confirmDialog = useConfirm();

  const job = useQuery({
    queryKey: ['job', id],
    queryFn: async (): Promise<JobDetailResponse> => {
      const res = await api.jobs[':id'].$get({ param: { id } });
      if (res.status === 404) throw new Error('ไม่พบงานนี้');
      if (res.status === 403) throw new Error('คุณไม่มีสิทธิ์ดูงานนี้');
      if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
      return (await res.json()) as JobDetailResponse;
    },
    refetchInterval: 20_000, // live-ish tracking
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const res = await api.jobs[':id']['confirm-delivery'].$post({ param: { id } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ยืนยันไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('ยืนยันรับของแล้ว ขอบคุณค่ะ');
      queryClient.invalidateQueries({ queryKey: ['job', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await api.jobs[':id'].cancel.$post({ param: { id } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ยกเลิกงานไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('ยกเลิกงานแล้ว');
      queryClient.invalidateQueries({ queryKey: ['job', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Live driver tracking via SSE while the job is en route.
  const trackingActive = !!job.data && TRACKING_STATUSES.has(job.data.status) && !!job.data.driver;
  const track = useJobTrack(id, trackingActive);
  const liveLat = track?.lat ?? job.data?.driver?.lat ?? null;
  const liveLng = track?.lng ?? job.data?.driver?.lng ?? null;
  const driverLoc = liveLat != null && liveLng != null ? { lat: liveLat, lng: liveLng } : null;
  const driverAgo = agoLabel(track?.locationAt ?? job.data?.driver?.locationAt ?? null);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">ติดตามงาน</h1>

      {job.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {job.isError && (
        <p className="text-sm text-destructive">{(job.error as Error).message}</p>
      )}

      {job.data && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{job.data.itemDescription}</CardTitle>
                <Badge variant={JOB_STATUS_VARIANT[job.data.status]}>
                  {JOB_STATUS_LABEL[job.data.status]}
                </Badge>
              </div>
              <CardDescription className="flex flex-wrap items-center gap-1">
                {job.data.originProvince}
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                {job.data.destProvince}
                {job.data.priceQuoted ? ` · ฿${job.data.priceQuoted.toLocaleString()}` : ''}
                {job.data.paymentMethod === 'COD' && (
                  <Badge variant="outline" className="ml-1 border-warning/50 text-warning">
                    เก็บเงินปลายทาง
                  </Badge>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <JobRouteMap
                origin={jobOrigin(job.data)}
                dest={jobDest(job.data)}
                driver={driverLoc}
                driverLabel="ตำแหน่งคนขับ"
                className="h-56 w-full overflow-hidden rounded-lg border"
              />
              {trackingActive && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand-500" />
                  {driverLoc
                    ? `ติดตามคนขับแบบเรียลไทม์${driverAgo ? ` · อัปเดต${driverAgo}` : ''}`
                    : 'กำลังรอตำแหน่งคนขับ…'}
                </p>
              )}
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-successScale-500" />
                  <div>
                    <p className="font-medium">จุดรับของ</p>
                    <p className="text-muted-foreground">{job.data.originAddress}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-error-500" />
                  <div>
                    <p className="font-medium">ปลายทาง</p>
                    <p className="text-muted-foreground">{job.data.destAddress}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Up-front payment: upload transfer slip while awaiting admin approval. */}
          {job.data.status === 'PENDING_PAYMENT' && (
            <Card>
              <CardContent className="px-0 py-3">
                <PaymentSlipCard
                  job={job.data}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ['job', id] })}
                />
              </CardContent>
            </Card>
          )}

          {/* COD: tell the assigned driver how much cash to collect from the customer at
              the destination (full price minus the commission the customer already paid). */}
          {me?.role === 'DRIVER' &&
            job.data.paymentMethod === 'COD' &&
            job.data.priceQuoted != null &&
            job.data.codCommissionFee != null && (
              <Card className="border-warning/40 bg-warning/5">
                <CardContent className="flex items-start gap-2 py-3 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div>
                    <p className="font-medium">
                      เก็บเงินสดปลายทาง ฿
                      {(job.data.priceQuoted - job.data.codCommissionFee).toLocaleString()}
                    </p>
                    <p className="text-muted-foreground">
                      ลูกค้าจ่ายค่าคอมให้แพลตฟอร์มแล้ว — เก็บส่วนที่เหลือเป็นเงินสดจากลูกค้าที่ปลายทาง
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Customer-driven destination change (re-route mid-delivery; admin-approved; fee). */}
          {me?.role === 'USER' && (
            <DestChangeCard
              job={job.data}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ['job', id] })}
            />
          )}

          {/* Driver banner: the drop-off was changed by an approved request. */}
          {me?.role === 'DRIVER' && job.data.destChangeStatus === 'COMPLETED' && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="flex items-start gap-2 py-3 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="font-medium">ที่อยู่ปลายทางมีการเปลี่ยนแปลง</p>
                  <p className="text-muted-foreground">ปลายทางปัจจุบัน: {job.data.destAddress}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Customer delivery confirmation — an extra signal for the admin's final decision. */}
          {(job.data.status === 'IN_TRANSIT' ||
            job.data.status === 'PENDING_CONFIRMATION') && (
            <Card>
              <CardContent className="pt-6">
                {job.data.customerConfirmedAt ? (
                  <div className="flex items-center gap-2 text-sm text-successScale-600">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <span>
                      คุณยืนยันรับของแล้ว ·{' '}
                      {new Date(job.data.customerConfirmedAt).toLocaleString('th-TH', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      <br />
                      <span className="text-muted-foreground">รอแอดมินยืนยันขั้นสุดท้าย</span>
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">
                      ได้รับของเรียบร้อยแล้วใช่ไหม? กดยืนยันเพื่อช่วยให้แอดมินปิดงานได้เร็วขึ้น
                    </p>
                    <Button
                      className="w-full"
                      disabled={confirm.isPending}
                      onClick={() => confirm.mutate()}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      ยืนยันว่ารับของแล้ว
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {(job.data.itemPhotos.length > 0 ||
            job.data.pickupProofUrls.length > 0 ||
            job.data.deliveryProofUrls.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">รูปภาพ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {job.data.itemPhotos.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">วัสดุที่ขนย้าย</p>
                    <div className="grid grid-cols-3 gap-2">
                      {job.data.itemPhotos.map((url) => (
                        <PreviewableImage
                          key={url}
                          src={url}
                          gallery={job.data.itemPhotos}
                          alt="วัสดุ"
                          className="h-20 w-full rounded-lg border object-cover"
                        />
                      ))}
                    </div>
                  </div>
                )}
                {job.data.pickupProofUrls.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">รูปตอนรับของ</p>
                    <div className="grid grid-cols-3 gap-2">
                      {job.data.pickupProofUrls.map((url) => (
                        <PreviewableImage
                          key={url}
                          src={url}
                          gallery={job.data.pickupProofUrls}
                          alt="ตอนรับของ"
                          className="h-20 w-full rounded-lg border object-cover"
                        />
                      ))}
                    </div>
                  </div>
                )}
                {job.data.deliveryProofUrls.length > 0 && (
                  <div>
                    <p className="mb-1 text-sm font-medium">รูปตอนส่ง</p>
                    <div className="grid grid-cols-3 gap-2">
                      {job.data.deliveryProofUrls.map((url) => (
                        <PreviewableImage
                          key={url}
                          src={url}
                          gallery={job.data.deliveryProofUrls}
                          alt="ตอนส่ง"
                          className="h-20 w-full rounded-lg border object-cover"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {job.data.driver ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">คนขับ</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">{job.data.driver.displayName ?? 'คนขับ'}</p>
                <p className="text-muted-foreground">
                  {job.data.driver.vehicleType}
                  {job.data.driver.plateNumber ? ` · ${job.data.driver.plateNumber}` : ''}
                </p>
                {job.data.driver.ratingCount > 0 && (
                  <p className="flex items-center gap-1 text-muted-foreground">
                    <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" />
                    {job.data.driver.ratingAvg.toFixed(1)} ({job.data.driver.ratingCount})
                  </p>
                )}
                {job.data.driver.phone && (
                  <Button asChild variant="outline" className="mt-2 w-full">
                    <a href={`tel:${job.data.driver.phone}`}>โทรหาคนขับ</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">ยังไม่มีคนขับรับงาน</p>
          )}

          {/* Receipt (once the customer's payment is approved) */}
          {job.data.paymentApprovedAt && (
            <Button asChild variant="outline" className="w-full">
              <a
                href={`${API_BASE_URL}/jobs/${id}/receipt`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText className="mr-1.5 h-4 w-4" />
                ดาวน์โหลดใบเสร็จ
              </a>
            </Button>
          )}

          {/* Review the driver once delivered — the API allows one review per job,
              by the job's customer only (the driver viewing this page won't see it).
              Once reviewed, swap the button for a confirmation so it can't 409. */}
          {job.data.status === 'DELIVERED' &&
            me?.role === 'USER' &&
            (job.data.hasReview ? (
              <p className="flex items-center justify-center gap-1.5 text-sm text-successScale-600">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                คุณให้คะแนนคนขับแล้ว ขอบคุณค่ะ
              </p>
            ) : (
              <ReviewDialog
                jobId={id}
                onDone={() => queryClient.invalidateQueries({ queryKey: ['job', id] })}
              />
            ))}

          {/* Report a problem — once a driver is involved through delivery */}
          {DISPUTABLE.has(job.data.status) && <DisputeDialog jobId={id} />}

          {/* Customer cancellation — gated by payment method: PREPAID only before
              the customer has paid (DRAFT/PENDING_PAYMENT); COD up until the driver
              picks up the goods (POSTED/ACCEPTED). */}
          {me?.role === 'USER' &&
            isCustomerCancellable(job.data.status, job.data.paymentMethod) && (
            <Button
              variant="ghost"
              className="w-full text-destructive hover:text-destructive"
              disabled={cancel.isPending}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: 'ยกเลิกงาน',
                  description:
                    job.data.status === 'ACCEPTED'
                      ? 'มีคนขับรับงานนี้แล้วและอาจกำลังเดินทาง — ยืนยันยกเลิกงาน? (อาจมีค่าธรรมเนียมหากเกินช่วงยกเลิกฟรี)'
                      : 'ยืนยันยกเลิกงานนี้?',
                  confirmText: 'ยกเลิกงาน',
                  cancelText: 'ไม่',
                  destructive: true,
                });
                if (ok) cancel.mutate();
              }}
            >
              ยกเลิกงาน
            </Button>
          )}

          <Button asChild variant="outline" className="w-full">
            <Link href="/app">หน้าหลัก</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
