'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PreviewableImage,
  ProvinceSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  cn,
} from '@movesook/ui';
import {
  CreateJobInput,
  ThaiPhoneSchema,
  JOB_POSTING_TERMS,
  MAX_ITEM_PHOTOS,
  VehicleTypeSchema,
  VEHICLE_TYPE_LABEL,
  PRICING_MODE_LABEL,
  CargoCategorySchema,
  CARGO_CATEGORY_LABELS,
  DEFAULT_PROHIBITED_ITEMS,
  RESTRICTED_CARGO_CATEGORIES,
  type CargoCategory,
  type EstimateJobResponse,
  type JobDetailResponse,
  type JobItem,
  type JobPricingResponse,
  type JobServiceAreasResponse,
  type PricingMode,
  type VehicleType,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { LocationPicker } from '@/components/location-picker';
import { PlaceAutocomplete } from '@/components/place-autocomplete';
import { ImageUpload } from '@/components/image-upload';
import type { LatLng } from '@/components/job-route-map';

const PIN_GREEN = 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
const PIN_RED = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';

const STEPS = ['รายละเอียด', 'ที่รับ', 'ปลายทาง', 'สรุป'] as const;

// Tri-state for "has elevator": unknown keeps the field null on the server.
type Lift = 'unknown' | 'yes' | 'no';
const liftToBool = (v: Lift): boolean | undefined =>
  v === 'yes' ? true : v === 'no' ? false : undefined;

// ── Step 4 Summary (read-only) ─────────────────────────────────────────────
function SummaryStep({
  form,
  items,
  totalQty,
  needsHelpers,
  origin,
  dest,
  originLift,
  destLift,
  pricingMode,
  onPricingModeChange,
  promoCode,
  onPromoApply,
  acceptedTerms,
  onAcceptedTermsChange,
  acceptedProhibitedPolicy,
  onAcceptedProhibitedPolicyChange,
  itemCategory,
  vehicleLabel,
}: {
  form: {
    vehicleType: VehicleType;
    contactPhone: string;
    notes: string;
    originAddress: string;
    originProvince: string;
    originFloor: string;
    destAddress: string;
    destProvince: string;
    destFloor: string;
    scheduledAt: string;
  };
  items: JobItem[];
  totalQty: number;
  needsHelpers: boolean;
  origin: { lat: number; lng: number } | null;
  dest: { lat: number; lng: number } | null;
  originLift: Lift;
  destLift: Lift;
  pricingMode: PricingMode;
  onPricingModeChange: (m: PricingMode) => void;
  promoCode: string;
  onPromoApply: (code: string) => void;
  acceptedTerms: boolean;
  onAcceptedTermsChange: (v: boolean) => void;
  acceptedProhibitedPolicy: boolean;
  onAcceptedProhibitedPolicyChange: (v: boolean) => void;
  itemCategory: CargoCategory;
  vehicleLabel: string;
}) {
  const floorInt = (v: string): number | undefined => {
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : undefined;
  };

  // Authoritative quote (distance base + floor/helper surcharges + promo) straight
  // from the API — mirrors exactly what posting will charge. Requires both pins.
  const estimateBody =
    origin && dest
      ? {
          vehicleType: form.vehicleType,
          pricingMode,
          itemCount: totalQty,
          originProvince: form.originProvince || undefined,
          originLat: origin.lat,
          originLng: origin.lng,
          destLat: dest.lat,
          destLng: dest.lng,
          originFloor: floorInt(form.originFloor),
          originHasElevator: liftToBool(originLift),
          destFloor: floorInt(form.destFloor),
          destHasElevator: liftToBool(destLift),
          needsHelpers,
          promoCode: promoCode.trim() || undefined,
        }
      : null;

  const { data: estimate, isFetching: estimating } = useQuery({
    queryKey: ['jobs', 'estimate', estimateBody],
    enabled: estimateBody !== null,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<EstimateJobResponse> => {
      const res = await api.jobs.estimate.$post({ json: estimateBody! });
      if (!res.ok) throw new Error();
      return (await res.json()) as EstimateJobResponse;
    },
  });

  // Local text field; only pushed up to the applied promo on "ใช้โค้ด".
  const [promoInput, setPromoInput] = useState(promoCode);

  const liftLabel = (l: Lift) =>
    l === 'yes' ? 'มีลิฟต์' : l === 'no' ? 'ไม่มีลิฟต์' : null;

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between gap-4 py-1.5 text-sm border-b last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );

  return (
    <div className="grid gap-4">
      {/* Pricing mode selector */}
      <div className="rounded-xl border bg-muted/30 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">วิธีคิดราคา</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { mode: 'CHARTER' as PricingMode, desc: 'จองทั้งคัน เหมาะกับของเยอะ/ย้ายบ้าน' },
              { mode: 'PER_ITEM' as PricingMode, desc: 'คิดตามจำนวนชิ้น เหมาะกับของไม่กี่ชิ้น' },
            ]
          ).map(({ mode, desc }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onPricingModeChange(mode)}
              className={cn(
                'rounded-lg border-2 p-2 text-left transition-colors',
                pricingMode === mode
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent bg-background hover:border-border',
              )}
            >
              <p className="text-sm font-semibold">{PRICING_MODE_LABEL[mode]}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Price — itemised quote */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
        <p className="mb-1 text-center text-xs text-muted-foreground">ราคาประมาณการ</p>
        {estimate && estimate.subtotal > 0 ? (
          <>
            <p className="text-center text-3xl font-bold text-primary">
              ฿{estimate.total.toLocaleString()}
            </p>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  ค่าขนส่ง ({estimate.distanceKm.toFixed(1)} กม. × ฿{estimate.pricePerKm}/กม.)
                </span>
                <span>฿{estimate.base.toLocaleString()}</span>
              </div>
              {estimate.flatRate > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">ค่าเหมาลำ</span>
                  <span>฿{estimate.flatRate.toLocaleString()}</span>
                </div>
              )}
              {estimate.itemsCharge > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">ค่าสินค้า ({totalQty} ชิ้น)</span>
                  <span>฿{estimate.itemsCharge.toLocaleString()}</span>
                </div>
              )}
              {estimate.surgeActive && (
                <div className="flex justify-between gap-3 text-orange-600">
                  <span>⚡ ช่วงความต้องการสูง (×{estimate.surgeMultiplier})</span>
                  <span>รวมในค่าขนส่ง</span>
                </div>
              )}
              {estimate.floorSurcharge > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">ค่าขึ้น–ลงชั้น (ไม่มีลิฟต์)</span>
                  <span>฿{estimate.floorSurcharge.toLocaleString()}</span>
                </div>
              )}
              {estimate.helperSurcharge > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">ค่าคนช่วยยก</span>
                  <span>฿{estimate.helperSurcharge.toLocaleString()}</span>
                </div>
              )}
              {estimate.discountAmount > 0 && (
                <div className="flex justify-between gap-3 text-green-600">
                  <span>ส่วนลด ({estimate.promoCode})</span>
                  <span>−฿{estimate.discountAmount.toLocaleString()}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            ราคาจะถูกกำหนดโดยระบบหลังยืนยัน
          </p>
        )}

        {/* Promo code */}
        <div className="mt-4 border-t pt-3">
          <Label className="text-xs text-muted-foreground">โค้ดส่วนลด</Label>
          <div className="mt-1 flex gap-2">
            <Input
              value={promoInput}
              onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
              placeholder="กรอกโค้ด"
              className="uppercase"
            />
            <Button
              type="button"
              variant="outline"
              disabled={estimating}
              onClick={() => onPromoApply(promoInput.trim())}
            >
              ใช้โค้ด
            </Button>
          </div>
          {estimate?.promoError && (
            <p className="mt-1 text-xs text-destructive">{estimate.promoError}</p>
          )}
          {estimate && estimate.discountAmount > 0 && (
            <p className="mt-1 text-xs text-green-600">ใช้โค้ด {estimate.promoCode} แล้ว</p>
          )}
        </div>
      </div>

      {/* รายการของ */}
      <div className="rounded-lg border bg-muted/30 p-3 grid gap-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">รายการของ</p>
        {items.map((it, i) => (
          <p key={i} className="text-sm">
            {it.name}
            {it.quantity > 1 && <span className="text-muted-foreground"> ×{it.quantity}</span>}
          </p>
        ))}
        <p className="text-xs text-muted-foreground mt-1">
          รวม {items.length} รายการ · {totalQty} ชิ้น
        </p>
      </div>

      {/* รายละเอียดงาน */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">รายละเอียดงาน</p>
        <Row label="ประเภทรถ" value={vehicleLabel} />
        {needsHelpers && <Row label="ผู้ช่วยขน" value="ต้องการคนช่วยยก" />}
        {form.scheduledAt && (
          <Row
            label="วัน–เวลา"
            value={new Date(form.scheduledAt).toLocaleString('th-TH', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          />
        )}
        {form.contactPhone && <Row label="เบอร์ติดต่อ" value={form.contactPhone} />}
        {form.notes && <Row label="หมายเหตุ" value={form.notes} />}
      </div>

      {/* ต้นทาง */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">ต้นทาง</p>
        <Row label="ที่อยู่" value={form.originAddress} />
        <Row label="จังหวัด" value={form.originProvince} />
        {form.originFloor && <Row label="ชั้น" value={`ชั้น ${form.originFloor}`} />}
        {liftLabel(originLift) && <Row label="ลิฟต์" value={liftLabel(originLift)!} />}
      </div>

      {/* ปลายทาง */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">ปลายทาง</p>
        <Row label="ที่อยู่" value={form.destAddress} />
        <Row label="จังหวัด" value={form.destProvince} />
        {form.destFloor && <Row label="ชั้น" value={`ชั้น ${form.destFloor}`} />}
        {liftLabel(destLift) && <Row label="ลิฟต์" value={liftLabel(destLift)!} />}
      </div>

      {/* ข้อตกลง */}
      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
        <p className="mb-2 text-sm font-medium">ข้อตกลงการขนย้าย</p>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {JOB_POSTING_TERMS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={acceptedTerms}
            onCheckedChange={onAcceptedTermsChange}
          />
          <span>ข้าพเจ้าได้อ่านและยอมรับข้อตกลงข้างต้น</span>
        </label>
      </div>

      {/* นโยบายของต้องห้าม / ของผิดกฎหมาย */}
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p className="mb-1 text-sm font-medium">นโยบายของต้องห้าม</p>
        <p className="mb-2 text-xs text-muted-foreground">
          MoveSook ไม่รับขนส่งสิ่งของต้องห้ามตามกฎหมาย ผู้ขับมีสิทธิ์ปฏิเสธหรือแจ้งงานที่พบของผิดกฎหมาย
        </p>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {DEFAULT_PROHIBITED_ITEMS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {RESTRICTED_CARGO_CATEGORIES.includes(itemCategory) && (
          <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">
            หมวด “{CARGO_CATEGORY_LABELS[itemCategory]}” อาจต้องมีใบอนุญาต/ใบกำกับภาษีประกอบการขนส่ง
          </p>
        )}
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            className="mt-0.5"
            checked={acceptedProhibitedPolicy}
            onCheckedChange={onAcceptedProhibitedPolicyChange}
          />
          <span>ข้าพเจ้ายืนยันว่าสิ่งของที่ส่งไม่ใช่ของผิดกฎหมายหรือของต้องห้าม</span>
        </label>
      </div>
    </div>
  );
}

// ── นัดเวลา (schedule) helpers ───────────────────────────────────────────────
const TH_WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'] as const;
const TH_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;
const SCHEDULE_MAX_DAYS = 14; // mirrors AppSetting max_schedule_days default
const SCHEDULE_DEFAULT_TIME = '09:00';

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** The next N days as pickable options for the horizontal day chips. */
function buildDayOptions(days: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const label = i === 0 ? 'วันนี้' : i === 1 ? 'พรุ่งนี้' : (TH_WEEKDAYS[d.getDay()] ?? '');
    return { key: dateKey(d), label, sub: `${d.getDate()} ${TH_MONTHS[d.getMonth()] ?? ''}` };
  });
}

/** 30-minute time slots within typical moving hours. */
function buildTimeSlots(startHour = 6, endHour = 20) {
  const slots: string[] = [];
  for (let h = startHour; h <= endHour; h++) {
    slots.push(`${pad2(h)}:00`);
    if (h !== endHour) slots.push(`${pad2(h)}:30`);
  }
  return slots;
}

/**
 * Turn a picked "YYYY-MM-DDTHH:mm" wall-clock into a UTC instant anchored to
 * Asia/Bangkok (fixed UTC+7, no DST) — so "09:00" always means 09:00 in Thailand
 * regardless of the customer's device timezone.
 */
function bangkokInstant(local: string): Date {
  return new Date(`${local}:00+07:00`);
}

/** Format a "YYYY-MM-DDTHH:mm" value into a friendly Thai summary line. */
function formatScheduleTH(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${TH_WEEKDAYS[d.getDay()] ?? ''} ${d.getDate()} ${TH_MONTHS[d.getMonth()] ?? ''} · ${pad2(d.getHours())}:${pad2(d.getMinutes())} น.`;
}

export default function NewJobPage() {
  const router = useRouter();
  const { me } = useAuth();
  const [step, setStep] = useState(1); // 1..4
  // วัน–เวลา: default "ไปตอนนี้" (on-demand). Switching to "นัดเวลา" reveals the picker.
  const [scheduled, setScheduled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicleType: 'PICKUP' as VehicleType,
    contactPhone: '',
    notes: '',
    originAddress: '',
    originProvince: '',
    originFloor: '',
    destAddress: '',
    destProvince: '',
    destFloor: '',
    scheduledAt: '',
  });
  // Structured list of things to move (name + qty + photo); edited via a dialog.
  const [items, setItems] = useState<JobItem[]>([]);
  const [needsHelpers, setNeedsHelpers] = useState(false);
  const [originLift, setOriginLift] = useState<Lift>('unknown');
  const [destLift, setDestLift] = useState<Lift>('unknown');
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [dest, setDest] = useState<LatLng | null>(null);

  // นัดเวลา: day chips + time slots (computed once). `scheduledAt` stays a
  // "YYYY-MM-DDTHH:mm" string so existing submit/validation logic is unchanged.
  const dayOptions = useMemo(() => buildDayOptions(SCHEDULE_MAX_DAYS), []);
  const timeSlots = useMemo(() => buildTimeSlots(), []);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedProhibitedPolicy, setAcceptedProhibitedPolicy] = useState(false);
  const [itemCategory, setItemCategory] = useState<CargoCategory>('GENERAL');
  const [pricingMode, setPricingMode] = useState<PricingMode>('CHARTER');
  // Applied promo code (validated server-side via the estimate endpoint).
  const [promoCode, setPromoCode] = useState('');

  // Item editor dialog: index === null means "adding a new item".
  const [editor, setEditor] = useState<{
    index: number | null;
    name: string;
    quantity: number;
    photoUrls: string[];
  } | null>(null);

  // Re-book: ?from=<jobId> prefills the form from a previous job (สั่งซ้ำ).
  const searchParams = useSearchParams();
  const fromId = searchParams.get('from');
  const prefilled = useRef(false);
  const sourceJob = useQuery({
    queryKey: ['job', 'rebook', fromId],
    enabled: !!fromId,
    queryFn: async (): Promise<JobDetailResponse> => {
      const res = await api.jobs[':id'].$get({ param: { id: fromId! } });
      if (!res.ok) throw new Error('โหลดงานเดิมไม่สำเร็จ');
      return (await res.json()) as JobDetailResponse;
    },
  });
  useEffect(() => {
    const j = sourceJob.data;
    if (!j || prefilled.current) return;
    prefilled.current = true;
    const boolToLift = (b: boolean | null): Lift => (b === true ? 'yes' : b === false ? 'no' : 'unknown');
    setForm((f) => ({
      ...f,
      vehicleType: j.vehicleType,
      contactPhone: j.contactPhone ?? '',
      notes: j.notes ?? '',
      originAddress: j.originAddress,
      originProvince: j.originProvince,
      originFloor: j.originFloor != null ? String(j.originFloor) : '',
      destAddress: j.destAddress,
      destProvince: j.destProvince,
      destFloor: j.destFloor != null ? String(j.destFloor) : '',
    }));
    if (j.items) setItems(j.items);
    setNeedsHelpers(j.needsHelpers);
    setOriginLift(boolToLift(j.originHasElevator));
    setDestLift(boolToLift(j.destHasElevator));
    if (j.originLat != null && j.originLng != null) setOrigin({ lat: j.originLat, lng: j.originLng });
    if (j.destLat != null && j.destLng != null) setDest({ lat: j.destLat, lng: j.destLng });
    setPricingMode(j.pricingMode);
    toast.info('นำข้อมูลจากงานเดิมมาให้แล้ว — ตรวจสอบแล้วโพสต์ได้เลย');
  }, [sourceJob.data]);

  // Prefill the on-site contact phone from the user's saved profile number, once,
  // and only if they haven't already typed one (or had it filled from a re-book).
  const phoneSeeded = useRef(false);
  useEffect(() => {
    if (phoneSeeded.current || !me?.phone) return;
    phoneSeeded.current = true;
    setForm((f) => (f.contactPhone ? f : { ...f, contactPhone: me.phone as string }));
  }, [me?.phone]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Only offer vehicle types that are open for joining (admin settings).
  const pricing = useQuery({
    queryKey: ['jobs', 'pricing'],
    queryFn: async (): Promise<JobPricingResponse> => {
      const res = await api.jobs.pricing.$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as JobPricingResponse;
    },
  });
  const activeVehicleTypes = useMemo(() => {
    const active = pricing.data?.rates.filter((r) => r.isActive).map((r) => r.vehicleType);
    // Before pricing loads (or if none configured) fall back to all known types.
    return active && active.length > 0 ? active : VehicleTypeSchema.options;
  }, [pricing.data]);
  // Prefer the admin-configured display name (VehiclePricing.label); fall back to
  // the generic enum label so it always matches the settings page.
  const vehicleLabel = useMemo(() => {
    const byType = new Map(pricing.data?.rates.map((r) => [r.vehicleType, r.label]) ?? []);
    return (vt: VehicleType) => byType.get(vt) || VEHICLE_TYPE_LABEL[vt];
  }, [pricing.data]);
  // Representative photo per vehicle type (admin-set) to show what the customer gets.
  const vehicleImage = useMemo(() => {
    const byType = new Map(pricing.data?.rates.map((r) => [r.vehicleType, r.imageUrl]) ?? []);
    return (vt: VehicleType) => byType.get(vt) ?? null;
  }, [pricing.data]);

  // Constrain the origin-province picker to provinces the platform serves.
  const serviceAreas = useQuery({
    queryKey: ['jobs', 'service-areas'],
    queryFn: async (): Promise<JobServiceAreasResponse> => {
      const res = await api.jobs['service-areas'].$get();
      if (!res.ok) throw new Error('โหลดพื้นที่ให้บริการไม่สำเร็จ');
      return (await res.json()) as JobServiceAreasResponse;
    },
  });
  const allowedProvinces =
    serviceAreas.data && !serviceAreas.data.unrestricted ? serviceAreas.data.provinces : undefined;

  // If the selected vehicle type gets disabled, fall back to the first active one.
  useEffect(() => {
    if (!activeVehicleTypes.includes(form.vehicleType) && activeVehicleTypes[0]) {
      setForm((f) => ({ ...f, vehicleType: activeVehicleTypes[0] as VehicleType }));
    }
  }, [activeVehicleTypes, form.vehicleType]);

  // Clear an origin province that is no longer served once the list is known.
  useEffect(() => {
    if (allowedProvinces && form.originProvince && !allowedProvinces.includes(form.originProvince)) {
      setForm((f) => ({ ...f, originProvince: '' }));
    }
  }, [allowedProvinces, form.originProvince]);

  // Empty string -> undefined; otherwise a truncated integer.
  const toInt = (v: string): number | undefined => {
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) ? Math.trunc(n) : undefined;
  };

  // --- item editor helpers ---
  const openAddItem = () =>
    setEditor({ index: null, name: '', quantity: 1, photoUrls: [] });
  const openEditItem = (i: number) => {
    const it = items[i];
    if (!it) return;
    setEditor({ index: i, name: it.name, quantity: it.quantity, photoUrls: it.photoUrls ?? [] });
  };
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const saveEditor = () => {
    if (!editor) return;
    const entry: JobItem = {
      name: editor.name.trim(),
      quantity: Math.max(1, Math.trunc(editor.quantity || 1)),
      photoUrls: editor.photoUrls,
    };
    if (entry.name.length === 0) return; // guarded by the disabled save button too
    setItems((prev) =>
      editor.index === null
        ? [...prev, entry]
        : prev.map((it, idx) => (idx === editor.index ? entry : it)),
    );
    setEditor(null);
  };
  // Items are already validated on save, so the list is the payload.
  const filledItems = items;
  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);

  const create = useMutation({
    mutationFn: async () => {
      const parsed = CreateJobInput.safeParse({
        items: filledItems,
        vehicleType: form.vehicleType,
        itemCategory,
        needsHelpers,
        contactPhone: form.contactPhone,
        notes: form.notes.trim() || undefined,
        originAddress: form.originAddress,
        originProvince: form.originProvince,
        originLat: origin?.lat,
        originLng: origin?.lng,
        originFloor: toInt(form.originFloor),
        originHasElevator: liftToBool(originLift),
        destAddress: form.destAddress,
        destProvince: form.destProvince,
        destLat: dest?.lat,
        destLng: dest?.lng,
        destFloor: toInt(form.destFloor),
        destHasElevator: liftToBool(destLift),
        scheduledAt: scheduled && form.scheduledAt ? bangkokInstant(form.scheduledAt) : undefined,
        pricingMode,
        promoCode: promoCode.trim() || undefined,
        acceptedTerms,
        acceptedProhibitedPolicy: acceptedProhibitedPolicy as true,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
      }
      const res = await api.jobs.$post({ json: parsed.data });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? 'สร้างงานไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('โพสต์งานแล้ว');
      router.push('/my-jobs');
    },
    onError: (e: Error) => setError(e.message),
  });

  // Validate the current step before advancing.
  const validateStep = (s: number): string | null => {
    if (s === 1 && filledItems.length === 0) {
      return 'เพิ่มรายการของที่ต้องการขนอย่างน้อย 1 รายการ';
    }
    if (s === 1 && !ThaiPhoneSchema.safeParse(form.contactPhone).success) {
      return 'กรุณากรอกเบอร์ติดต่อหน้างานให้ถูกต้อง (เช่น 081-234-5678)';
    }
    if (s === 1 && scheduled && !form.scheduledAt) {
      return 'เลือกวัน–เวลาที่ต้องการขนย้าย หรือเปลี่ยนเป็น “ไปตอนนี้”';
    }
    if (s === 2 && (form.originAddress.trim().length < 3 || !form.originProvince)) {
      return 'กรอกที่อยู่ต้นทางและเลือกจังหวัด';
    }
    if (s === 3 && (form.destAddress.trim().length < 3 || !form.destProvince)) {
      return 'กรอกที่อยู่ปลายทางและเลือกจังหวัด';
    }
    return null;
  };

  const next = () => {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const submit = () => {
    if (!acceptedTerms) {
      setError('กรุณายอมรับข้อตกลงก่อนโพสต์งาน');
      return;
    }
    if (!acceptedProhibitedPolicy) {
      setError('กรุณายืนยันว่าสิ่งของไม่ใช่ของผิดกฎหมาย/ของต้องห้าม');
      return;
    }
    setError(null);
    create.mutate();
  };

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>โพสต์งานขนย้าย</CardTitle>
          {/* Step indicator */}
          <div className="mt-3 flex items-center gap-1">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const active = n === step;
              const done = n < step;
              return (
                <div key={label} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : done
                          ? 'bg-successScale-500 text-white'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {n}
                  </div>
                  <span
                    className={cn(
                      'text-[10px]',
                      active ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* Step 1 — รายละเอียด */}
          {step === 1 && (
            <>
              <div className="grid gap-2">
                <Label>รายการของที่ต้องการขน</Label>
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    ยังไม่มีรายการ — กด “เพิ่มรายการ” เพื่อเริ่ม
                  </div>
                ) : (
                  <Table className="border">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14 px-2 text-center">รูป</TableHead>
                        <TableHead className="px-2">รายละเอียดของ</TableHead>
                        <TableHead className="w-14 px-2 text-center">จำนวน</TableHead>
                        <TableHead className="w-10 px-2"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it, i) => (
                        <TableRow
                          key={i}
                          className="cursor-pointer"
                          onClick={() => openEditItem(i)}
                        >
                          <TableCell className="px-2 py-2">
                            {it.photoUrls.length > 0 ? (
                              <div className="relative h-10 w-10">
                                <PreviewableImage
                                  src={it.photoUrls[0]}
                                  gallery={it.photoUrls}
                                  alt={it.name}
                                  className="h-10 w-10 rounded-md border object-cover"
                                />
                                {it.photoUrls.length > 1 && (
                                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                                    {it.photoUrls.length}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                                <ImageIcon className="h-4 w-4" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="px-2 py-2 font-medium">{it.name}</TableCell>
                          <TableCell className="px-2 py-2 text-center">×{it.quantity}</TableCell>
                          <TableCell className="px-2 py-2">
                            <button
                              type="button"
                              aria-label="ลบรายการ"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeItem(i);
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground"
                            >
                              ×
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <Button type="button" variant="outline" size="sm" onClick={openAddItem}>
                  + เพิ่มรายการ
                </Button>
                {totalQty > 0 && (
                  <p className="text-xs text-muted-foreground">
                    รวม {filledItems.length} รายการ · {totalQty} ชิ้น
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label>ประเภทสิ่งของ</Label>
                <Select
                  value={itemCategory}
                  onValueChange={(v) => setItemCategory(v as CargoCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CargoCategorySchema.options.map((v) => (
                      <SelectItem key={v} value={v}>
                        {CARGO_CATEGORY_LABELS[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {RESTRICTED_CARGO_CATEGORIES.includes(itemCategory) && (
                  <p className="text-xs text-amber-700">
                    หมวดนี้อาจต้องมีใบอนุญาต/ใบกำกับภาษีประกอบการขนส่ง
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label>ประเภทรถ</Label>
                <Select value={form.vehicleType} onValueChange={(v) => set('vehicleType')(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeVehicleTypes.map((v) => (
                      <SelectItem key={v} value={v}>
                        {vehicleLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pricing.data && activeVehicleTypes.length === 0 && (
                  <p className="text-xs text-destructive">ยังไม่มีประเภทรถที่เปิดให้บริการ</p>
                )}
                {vehicleImage(form.vehicleType) && (
                  <div className="mt-1 overflow-hidden rounded-lg border bg-muted/30">
                    <PreviewableImage
                      src={vehicleImage(form.vehicleType) as string}
                      alt={vehicleLabel(form.vehicleType)}
                      className="h-36 w-full object-cover"
                    />
                    <p className="px-3 py-1.5 text-xs text-muted-foreground">
                      ตัวอย่างรถ {vehicleLabel(form.vehicleType)} — รถจริงที่ได้อาจแตกต่างเล็กน้อย
                    </p>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={needsHelpers} onCheckedChange={setNeedsHelpers} />
                ต้องการคนช่วยยก/ขนของ
              </label>

              <div className="grid gap-2">
                <Label>วัน–เวลาที่ต้องการขนย้าย</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { mode: false, label: 'ไปตอนนี้', desc: 'ให้คนขับที่ว่างมารับงานทันที' },
                      { mode: true, label: 'นัดเวลา', desc: 'ระบุวัน–เวลาที่สะดวก' },
                    ] as const
                  ).map(({ mode, label, desc }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => {
                        setScheduled(mode);
                        if (!mode) set('scheduledAt')('');
                      }}
                      className={cn(
                        'rounded-lg border-2 p-2 text-left transition-colors',
                        scheduled === mode
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent bg-muted/40 hover:border-border',
                      )}
                    >
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-[11px] leading-tight text-muted-foreground">{desc}</p>
                    </button>
                  ))}
                </div>
                {scheduled && (() => {
                  const schedDate = form.scheduledAt.slice(0, 10);
                  const schedTime = form.scheduledAt.length >= 16 ? form.scheduledAt.slice(11, 16) : '';
                  const now = new Date();
                  const todayKey = dateKey(now);
                  const nowHm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
                  return (
                    <div className="grid gap-3 rounded-xl border bg-muted/20 p-3">
                      {/* วัน — chips เลื่อนแนวนอน */}
                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {dayOptions.map((day) => {
                          const active = schedDate === day.key;
                          // For today, default to the next slot that hasn't passed.
                          const defaultTime =
                            day.key === todayKey
                              ? (timeSlots.find((t) => t > nowHm) ?? SCHEDULE_DEFAULT_TIME)
                              : SCHEDULE_DEFAULT_TIME;
                          return (
                            <button
                              key={day.key}
                              type="button"
                              onClick={() => set('scheduledAt')(`${day.key}T${schedTime || defaultTime}`)}
                              className={cn(
                                'flex min-w-[68px] shrink-0 flex-col items-center rounded-xl border-2 px-3 py-2 transition-colors',
                                active
                                  ? 'border-primary bg-primary/10'
                                  : 'border-transparent bg-background hover:border-border',
                              )}
                            >
                              <span className={cn('text-sm font-semibold', active && 'text-primary')}>
                                {day.label}
                              </span>
                              <span className="text-[11px] text-muted-foreground">{day.sub}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* เวลา — select 30 นาที */}
                      <div className="grid gap-1.5">
                        <Label className="text-xs text-muted-foreground">เวลาที่สะดวก</Label>
                        <Select
                          value={schedTime}
                          disabled={!schedDate}
                          onValueChange={(t) => set('scheduledAt')(`${schedDate || todayKey}T${t}`)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={schedDate ? 'เลือกเวลา' : 'เลือกวันก่อน'} />
                          </SelectTrigger>
                          <SelectContent>
                            {timeSlots.map((t) => (
                              <SelectItem
                                key={t}
                                value={t}
                                disabled={schedDate === todayKey && t <= nowHm}
                              >
                                {t} น.
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {form.scheduledAt && (
                        <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
                          📅 นัดหมาย: {formatScheduleTH(form.scheduledAt)}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="contactPhone">เบอร์ติดต่อหน้างาน</Label>
                <Input
                  id="contactPhone"
                  type="tel"
                  inputMode="tel"
                  value={form.contactPhone}
                  onChange={(e) => set('contactPhone')(e.target.value)}
                  placeholder="เช่น 081-234-5678"
                />
                <p className="text-xs text-muted-foreground">
                  คนขับใช้เบอร์นี้โทรประสานหน้างาน · บันทึกเป็นค่าเริ่มต้นในโปรไฟล์ให้อัตโนมัติ
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">หมายเหตุ/คำแนะนำเพิ่มเติม (ไม่บังคับ)</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => set('notes')(e.target.value)}
                  placeholder="เช่น ของแตกหักง่าย ที่จอดรถแคบ รบกวนมาตรงเวลา"
                />
              </div>
            </>
          )}

          {/* Step 2 — ที่รับ (ต้นทาง) */}
          {step === 2 && (
            <div className="grid gap-2">
              <Label>จุดรับของ (ต้นทาง)</Label>
              <PlaceAutocomplete
                placeholder="ค้นหาสถานที่ต้นทาง"
                onSelect={(r) => {
                  setOrigin({ lat: r.lat, lng: r.lng });
                  set('originAddress')(r.address);
                }}
              />
              <Input
                value={form.originAddress}
                onChange={(e) => set('originAddress')(e.target.value)}
                placeholder="ที่อยู่ต้นทาง"
              />
              <ProvinceSelect
                value={form.originProvince}
                onChange={set('originProvince')}
                placeholder="จังหวัดต้นทาง"
                allow={allowedProvinces}
              />
              {allowedProvinces && (
                <p className="text-xs text-muted-foreground">
                  เปิดให้บริการรับงานเฉพาะจังหวัดต้นทางที่กำหนดไว้
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="originFloor" className="text-xs">
                    ชั้น
                  </Label>
                  <Input
                    id="originFloor"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.originFloor}
                    onChange={(e) => set('originFloor')(e.target.value)}
                    placeholder="เช่น 3"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">ลิฟต์</Label>
                  <Select value={originLift} onValueChange={(v) => setOriginLift(v as Lift)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">ไม่ระบุ</SelectItem>
                      <SelectItem value="yes">มีลิฟต์</SelectItem>
                      <SelectItem value="no">ไม่มีลิฟต์</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">แตะแผนที่เพื่อปักจุดรับของ (ไม่บังคับ)</p>
              <LocationPicker
                value={origin}
                onChange={setOrigin}
                icon={PIN_GREEN}
                expandLabel="ปักหมุดจุดรับของ (ต้นทาง)"
                className="h-44 w-full overflow-hidden rounded-lg border"
              />
            </div>
          )}

          {/* Step 3 — ปลายทาง */}
          {step === 3 && (
            <div className="grid gap-2">
              <Label>ปลายทาง</Label>
              <PlaceAutocomplete
                placeholder="ค้นหาสถานที่ปลายทาง"
                onSelect={(r) => {
                  setDest({ lat: r.lat, lng: r.lng });
                  set('destAddress')(r.address);
                }}
              />
              <Input
                value={form.destAddress}
                onChange={(e) => set('destAddress')(e.target.value)}
                placeholder="ที่อยู่ปลายทาง"
              />
              <ProvinceSelect
                value={form.destProvince}
                onChange={set('destProvince')}
                placeholder="จังหวัดปลายทาง"
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1">
                  <Label htmlFor="destFloor" className="text-xs">
                    ชั้น
                  </Label>
                  <Input
                    id="destFloor"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.destFloor}
                    onChange={(e) => set('destFloor')(e.target.value)}
                    placeholder="เช่น 5"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">ลิฟต์</Label>
                  <Select value={destLift} onValueChange={(v) => setDestLift(v as Lift)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">ไม่ระบุ</SelectItem>
                      <SelectItem value="yes">มีลิฟต์</SelectItem>
                      <SelectItem value="no">ไม่มีลิฟต์</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">แตะแผนที่เพื่อปักจุดปลายทาง (ไม่บังคับ)</p>
              <LocationPicker
                value={dest}
                onChange={setDest}
                icon={PIN_RED}
                expandLabel="ปักหมุดปลายทาง"
                className="h-44 w-full overflow-hidden rounded-lg border"
              />
            </div>
          )}

          {/* Step 4 — สรุปรายละเอียดทั้งหมดก่อนยืนยัน (read-only) */}
          {step === 4 && (
            <SummaryStep
              form={form}
              items={filledItems}
              totalQty={totalQty}
              pricingMode={pricingMode}
              onPricingModeChange={setPricingMode}
              needsHelpers={needsHelpers}
              origin={origin}
              dest={dest}
              originLift={originLift}
              destLift={destLift}
              promoCode={promoCode}
              onPromoApply={setPromoCode}
              acceptedTerms={acceptedTerms}
              onAcceptedTermsChange={setAcceptedTerms}
              acceptedProhibitedPolicy={acceptedProhibitedPolicy}
              onAcceptedProhibitedPolicyChange={setAcceptedProhibitedPolicy}
              itemCategory={itemCategory}
              vehicleLabel={vehicleLabel(form.vehicleType)}
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            {step > 1 && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={back}
                disabled={create.isPending}
              >
                ย้อนกลับ
              </Button>
            )}
            {step < 4 ? (
              <Button className="flex-1" onClick={next}>
                ถัดไป
              </Button>
            ) : (
              <Button
                className="flex-1"
                disabled={create.isPending || !acceptedTerms || !acceptedProhibitedPolicy}
                onClick={submit}
              >
                {create.isPending ? 'กำลังยืนยัน…' : 'ยืนยันการขนย้าย'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Item editor — opened by "เพิ่มรายการ" or by tapping a row */}
      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editor?.index === null ? 'เพิ่มรายการของ' : 'แก้ไขรายการ'}</DialogTitle>
          </DialogHeader>

          {editor && (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="editorName">รายละเอียดของ</Label>
                <Input
                  id="editorName"
                  autoFocus
                  value={editor.name}
                  onChange={(e) => setEditor((p) => (p ? { ...p, name: e.target.value } : p))}
                  placeholder="เช่น ตู้เย็น, โซฟา, กล่องเอกสาร"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="editorQty">จำนวน</Label>
                <Input
                  id="editorQty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={editor.quantity}
                  onChange={(e) =>
                    setEditor((p) =>
                      p ? { ...p, quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) } : p,
                    )
                  }
                />
              </div>

              <div className="grid gap-2">
                <Label>รูปของ (ไม่บังคับ · สูงสุด {MAX_ITEM_PHOTOS} รูป)</Label>
                {editor.photoUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {editor.photoUrls.map((url) => (
                      <div key={url} className="relative">
                        <PreviewableImage
                          src={url}
                          gallery={editor.photoUrls}
                          alt="รูปของ"
                          className="h-20 w-full rounded-lg border object-cover"
                        />
                        <button
                          type="button"
                          aria-label="ลบรูป"
                          onClick={() =>
                            setEditor((p) =>
                              p ? { ...p, photoUrls: p.photoUrls.filter((u) => u !== url) } : p,
                            )
                          }
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {editor.photoUrls.length < MAX_ITEM_PHOTOS && (
                  <ImageUpload
                    hidePreview
                    label={editor.photoUrls.length > 0 ? 'เพิ่มรูป' : 'อัปโหลดรูป'}
                    onUploaded={(url) =>
                      setEditor((p) =>
                        p && p.photoUrls.length < MAX_ITEM_PHOTOS
                          ? { ...p, photoUrls: [...p.photoUrls, url] }
                          : p,
                      )
                    }
                  />
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditor(null)}>
              ยกเลิก
            </Button>
            <Button disabled={!editor || editor.name.trim().length === 0} onClick={saveEditor}>
              {editor?.index === null ? 'เพิ่ม' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
