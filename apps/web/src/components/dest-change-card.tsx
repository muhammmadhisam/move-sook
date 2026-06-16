'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, MapPin } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  PreviewableImage,
  ProvinceSelect,
  Textarea,
  useConfirm,
} from '@movesook/ui';
import type { JobDto, JobPricingResponse, PublicSystemConfig } from '@movesook/shared';
import { ADDR_CHANGE_STATUS_LABEL, computeAddressChangeFee } from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';
import { LocationPicker } from '@/components/location-picker';
import { PlaceAutocomplete } from '@/components/place-autocomplete';
import type { LatLng } from '@/components/job-route-map';

const PIN_RED = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';

// Statuses where the driver holds the job and a re-route still makes sense.
const IN_HAND = new Set(['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT']);
// An active request blocks raising a new one; these are the "in-flight" states.
const ACTIVE = new Set(['REQUESTED', 'APPROVED_AWAITING_PAYMENT', 'PENDING_REVIEW']);

/**
 * Customer-side destination-change flow shown on the job-tracking screen while a
 * driver holds the job: raise a request → admin approves → pay the fee (slip) →
 * admin approves → driver gets notified. Mirrors the up-front PaymentSlipCard.
 */
export function DestChangeCard({ job, onChanged }: { job: JobDto; onChanged?: () => void }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState<LatLng | null>(null);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  const status = job.destChangeStatus;
  const isActive = ACTIVE.has(status);
  const canRequest = IN_HAND.has(job.status) && !isActive;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['job', job.id] });
    queryClient.invalidateQueries({ queryKey: ['my-jobs'] });
    onChanged?.();
  };

  // Company receiving account + QR + the flat base fee (for the live preview).
  const { data: config } = useQuery({
    queryKey: ['system', 'public'],
    queryFn: async (): Promise<PublicSystemConfig> => {
      const res = await api.system.public.$get();
      if (!res.ok) throw new Error();
      return (await res.json()) as PublicSystemConfig;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Per-vehicle price/km — drives the extra-distance part of the preview fee.
  const { data: pricing } = useQuery({
    queryKey: ['jobs', 'pricing'],
    queryFn: async (): Promise<JobPricingResponse> => {
      const res = await api.jobs.pricing.$get();
      if (!res.ok) throw new Error();
      return (await res.json()) as JobPricingResponse;
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  // Live fee preview as the customer pins the new destination (same formula the API
  // snapshots on submit). Without a new pin we can only show the flat base.
  const pricePerKm = pricing?.rates.find((r) => r.vehicleType === job.vehicleType)?.pricePerKm ?? 0;
  const previewFee = computeAddressChangeFee({
    origin: job.originLat != null && job.originLng != null ? { lat: job.originLat, lng: job.originLng } : null,
    oldDest: job.destLat != null && job.destLng != null ? { lat: job.destLat, lng: job.destLng } : null,
    newDest: pin ? { lat: pin.lat, lng: pin.lng } : null,
    baseFee: config?.addressChangeFee ?? 0,
    pricePerKm,
  });

  const request = useMutation({
    mutationFn: async () => {
      const res = await api.jobs[':id']['dest-change'].$post({
        param: { id: job.id },
        json: {
          destAddress: address,
          destProvince: province,
          destLat: pin?.lat,
          destLng: pin?.lng,
          reason: reason || undefined,
          slipUrl: slipUrl ?? undefined,
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ส่งคำขอไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(
        slipUrl
          ? 'ส่งคำขอ + สลิปแล้ว รอแอดมินตรวจสอบ'
          : 'ส่งคำขอเปลี่ยนที่อยู่แล้ว รอแอดมินอนุมัติ',
      );
      setOpen(false);
      setAddress('');
      setProvince('');
      setReason('');
      setPin(null);
      setSlipUrl(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadSlip = useMutation({
    mutationFn: async (url: string) => {
      const res = await api.jobs[':id']['dest-change'].slip.$post({
        param: { id: job.id },
        json: { slipUrl: url },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ส่งสลิปไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('ส่งสลิปแล้ว รอแอดมินตรวจสอบ');
      setSlipUrl(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelRequest = useMutation({
    mutationFn: async () => {
      const res = await api.jobs[':id']['dest-change'].cancel.$post({ param: { id: job.id } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ยกเลิกคำขอไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('ยกเลิกคำขอเปลี่ยนที่อยู่แล้ว');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Nothing to show: no active request and re-routing isn't available right now.
  if (!isActive && !canRequest) return null;

  const feeText =
    job.destChangeFee != null ? `฿${job.destChangeFee.toLocaleString('th-TH')}` : '—';

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <MapPin className="h-4 w-4 shrink-0" />
          เปลี่ยนที่อยู่ปลายทาง
        </p>
        {isActive && (
          <span className="text-xs text-muted-foreground">{ADDR_CHANGE_STATUS_LABEL[status]}</span>
        )}
      </div>

      {/* ── No active request: offer to raise one ── */}
      {canRequest && (
        <div className="space-y-2">
          {status === 'REJECTED' && job.destChangeRejectedReason && (
            <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              คำขอก่อนหน้าไม่ผ่าน: {job.destChangeRejectedReason}
            </p>
          )}
          {status === 'COMPLETED' && (
            <p className="rounded-md bg-successScale-500/10 px-2 py-1.5 text-xs text-successScale-600">
              เปลี่ยนที่อยู่ครั้งก่อนเรียบร้อยแล้ว
            </p>
          )}
          {!open ? (
            <>
              <p className="text-xs text-muted-foreground">
                หากปลายทางเปลี่ยน สามารถขอแก้ไขได้ มีค่าธรรมเนียมตามระยะทางที่เพิ่ม และต้องรอแอดมินอนุมัติ
              </p>
              <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
                ขอเปลี่ยนที่อยู่ปลายทาง
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <div className="grid gap-1">
                <Label className="text-xs">ที่อยู่ปลายทางใหม่</Label>
                <PlaceAutocomplete
                  placeholder="ค้นหาสถานที่ปลายทางใหม่"
                  onSelect={(r) => {
                    setPin({ lat: r.lat, lng: r.lng });
                    setAddress(r.address);
                  }}
                />
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="ที่อยู่ปลายทางใหม่"
                />
              </div>
              <ProvinceSelect
                value={province}
                onChange={setProvince}
                placeholder="จังหวัดปลายทางใหม่"
              />
              <p className="text-xs text-muted-foreground">แตะแผนที่เพื่อปักจุดปลายทางใหม่ (ช่วยคำนวณค่าธรรมเนียม)</p>
              <LocationPicker
                value={pin}
                onChange={setPin}
                icon={PIN_RED}
                expandLabel="ปักหมุดปลายทางใหม่"
                className="h-44 w-full overflow-hidden rounded-lg border"
              />
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เหตุผล (ไม่บังคับ)"
                rows={2}
              />

              {/* Live fee preview */}
              <div className="rounded-lg border bg-background p-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">ค่าธรรมเนียมโดยประมาณ</span>
                  <span className="font-bold text-primary">
                    ฿{previewFee.total.toLocaleString('th-TH')}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ฐาน ฿{previewFee.baseFee.toLocaleString('th-TH')}
                  {previewFee.extraKm > 0
                    ? ` + ระยะเพิ่ม ${previewFee.extraKm.toFixed(1)} กม.`
                    : ' (ปักหมุดปลายทางใหม่เพื่อคิดค่าระยะทาง)'}
                </p>
              </div>

              {/* Optional: pay now and attach the slip in the same step. */}
              <div className="rounded-lg border border-dashed p-2.5">
                <p className="mb-1.5 text-xs font-medium">
                  โอนค่าธรรมเนียมแล้วแนบสลิปได้เลย (ไม่บังคับ — แนบทีหลังได้)
                </p>
                {config && (config.payAccountNumber || config.payQrUrl) && (
                  <div className="mb-2 rounded-md bg-muted/40 p-2 text-xs">
                    {config.payBankName && (
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">ธนาคาร</span>
                        <span className="font-medium">{config.payBankName}</span>
                      </div>
                    )}
                    {config.payAccountNumber && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">เลขที่บัญชี</span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono font-medium tracking-wide">
                            {config.payAccountNumber}
                          </span>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => {
                              void navigator.clipboard.writeText(config.payAccountNumber);
                              toast.success('คัดลอกเลขบัญชีแล้ว');
                            }}
                          >
                            คัดลอก
                          </button>
                        </span>
                      </div>
                    )}
                    {config.payQrUrl && (
                      <PreviewableImage
                        src={config.payQrUrl}
                        alt="QR รับเงิน"
                        className="mx-auto mt-2 h-36 w-36 rounded-lg border object-contain"
                      />
                    )}
                  </div>
                )}
                <ImageUpload value={slipUrl} onUploaded={setSlipUrl} label="แนบสลิปการโอน" />
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setOpen(false);
                    setSlipUrl(null);
                  }}
                  disabled={request.isPending}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={address.trim().length < 3 || !province || request.isPending}
                  onClick={() => request.mutate()}
                >
                  {request.isPending ? 'กำลังส่ง…' : slipUrl ? 'ส่งคำขอ + สลิป' : 'ส่งคำขอ'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Active request: track / pay ── */}
      {isActive && (
        <div className="space-y-2">
          <div className="rounded-lg border bg-background p-2.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">ที่อยู่ใหม่</span>
              <span className="text-right font-medium">
                {job.destChangeNewAddress}
                {job.destChangeNewProvince ? ` (${job.destChangeNewProvince})` : ''}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-muted-foreground">ค่าธรรมเนียม</span>
              <span className="font-bold text-primary">{feeText}</span>
            </div>
          </div>

          {status === 'REQUESTED' && (
            <p className="text-xs text-muted-foreground">รอแอดมินอนุมัติคำขอ ก่อนชำระค่าธรรมเนียม</p>
          )}

          {status === 'APPROVED_AWAITING_PAYMENT' && (
            <div className="space-y-2">
              {job.destChangeRejectedReason && (
                <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  สลิปก่อนหน้าไม่ผ่าน: {job.destChangeRejectedReason} — กรุณาอัปโหลดใหม่
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                แอดมินอนุมัติแล้ว — โอนค่าธรรมเนียม {feeText} แล้วอัปโหลดสลิป
              </p>
              {config && (config.payAccountNumber || config.payQrUrl) && (
                <div className="rounded-lg border bg-background p-3">
                  <p className="mb-2 text-xs font-semibold">โอนเข้าบัญชี</p>
                  {config.payBankName && (
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">ธนาคาร</span>
                      <span className="font-medium">{config.payBankName}</span>
                    </div>
                  )}
                  {config.payAccountName && (
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">ชื่อบัญชี</span>
                      <span className="font-medium">{config.payAccountName}</span>
                    </div>
                  )}
                  {config.payAccountNumber && (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">เลขที่บัญชี</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono font-medium tracking-wide">
                          {config.payAccountNumber}
                        </span>
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline"
                          onClick={() => {
                            void navigator.clipboard.writeText(config.payAccountNumber);
                            toast.success('คัดลอกเลขบัญชีแล้ว');
                          }}
                        >
                          คัดลอก
                        </button>
                      </span>
                    </div>
                  )}
                  {config.payQrUrl && (
                    <PreviewableImage
                      src={config.payQrUrl}
                      alt="QR รับเงิน"
                      className="mx-auto mt-2 h-44 w-44 rounded-lg border object-contain"
                    />
                  )}
                </div>
              )}
              <ImageUpload value={slipUrl} onUploaded={setSlipUrl} label="แนบสลิปการโอน" />
              <Button
                type="button"
                className="w-full"
                disabled={!slipUrl || uploadSlip.isPending}
                onClick={() => slipUrl && uploadSlip.mutate(slipUrl)}
              >
                {uploadSlip.isPending ? 'กำลังส่ง…' : 'ส่งสลิปให้แอดมินตรวจสอบ'}
              </Button>
            </div>
          )}

          {status === 'PENDING_REVIEW' && (
            <div className="space-y-2">
              {job.destChangeSlipUrl && (
                <PreviewableImage
                  src={job.destChangeSlipUrl}
                  alt="สลิปค่าเปลี่ยนที่อยู่"
                  className="max-h-48 w-full rounded-lg border object-contain"
                />
              )}
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 shrink-0" />
                ส่งสลิปแล้ว — รอแอดมินตรวจสอบ เมื่ออนุมัติระบบจะแจ้งคนขับให้ทราบที่อยู่ใหม่
              </p>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            className="w-full text-destructive hover:text-destructive"
            disabled={cancelRequest.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: 'ยกเลิกคำขอ',
                description: 'ยืนยันยกเลิกคำขอเปลี่ยนที่อยู่?',
                confirmText: 'ยกเลิกคำขอ',
                cancelText: 'ไม่',
                destructive: true,
              });
              if (ok) cancelRequest.mutate();
            }}
          >
            ยกเลิกคำขอ
          </Button>
        </div>
      )}
    </div>
  );
}
