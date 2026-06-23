'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowDown,
  Bike,
  Calculator,
  Minus,
  Plus,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import { Button, cn } from '@movesook/ui';
import {
  ESTIMATE_GUEST_MAX,
  PRICING_MODE_LABEL,
  type EstimateJobResponse,
  type PricingMode,
  type VehicleType,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { buildEstimatePrefill, saveJobDraft } from '@/lib/job-draft';
import { Turnstile, TURNSTILE_ENABLED } from '@/components/turnstile';
import { LocationPicker, type ResolvedPlace } from '@/components/location-picker';
import { PlaceAutocomplete } from '@/components/place-autocomplete';
import { JobRouteMap, type LatLng } from '@/components/job-route-map';

// Google's stock dot markers — same as the post-job picker, so pins read the same
// way across the app (green = origin, red = destination).
const PIN_GREEN = 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
const PIN_RED = 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';

/** Vehicle options the calculator can quote, mirrored from the public rate list. */
export interface CalculatorVehicle {
  vehicleType: VehicleType;
  label: string;
  imageUrl: string | null;
  pricePerKm: number | null;
  pricePerKmShared: number | null;
}

/** What a successful estimate call yields: the quote + guest quota left (if sent). */
interface QuoteResult {
  quote: EstimateJobResponse;
  /** Quotes still available this window for a guest, or null when not rate-limited. */
  remaining: number | null;
}

/** Thrown when the guest fare-calculator quota is exhausted (HTTP 429). */
class QuotaExceededError extends Error {}

function vehicleIcon(vehicleType: string): typeof Bike {
  return vehicleType === 'MOTORCYCLE' ? Bike : Truck;
}

/** One location row: a coloured dot, autocomplete search, and a map-pin button. */
function EndpointField({
  tone,
  label,
  value,
  address,
  onPick,
  onResolve,
  pin,
}: {
  tone: 'origin' | 'dest';
  label: string;
  value: LatLng | null;
  address: string;
  onPick: (p: LatLng) => void;
  onResolve: (p: ResolvedPlace) => void;
  pin: string;
}) {
  const isOrigin = tone === 'origin';
  return (
    <div className="flex gap-3">
      <span
        className={cn(
          'mt-2 h-3 w-3 shrink-0 rounded-full ring-4',
          isOrigin ? 'bg-green-500 ring-green-100' : 'bg-primary ring-brand-50',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div className="mt-1.5">
          <PlaceAutocomplete
            placeholder={isOrigin ? 'ค้นหาจุดรับของ เช่น เซ็นทรัล หาดใหญ่' : 'ค้นหาปลายทาง'}
            onSelect={(r) => {
              onPick({ lat: r.lat, lng: r.lng });
              onResolve({ address: r.address, province: '' });
            }}
          />
        </div>
        <div className="mt-2">
          <LocationPicker
            variant="compact"
            value={value}
            onChange={onPick}
            onResolve={onResolve}
            icon={pin}
            expandLabel={isOrigin ? 'ปักหมุดจุดรับของบนแผนที่' : 'ปักหมุดปลายทางบนแผนที่'}
          />
        </div>
        {address && (
          <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{address}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Interactive fare calculator for the public pricing page. Ride-hailing-style:
 * pick origin + destination (search or pin on the map), choose a vehicle, then
 * press "คำนวณราคา" — we call the same public `POST /jobs/estimate` the post-job
 * flow uses, so the quote matches exactly what they'd be charged. No login.
 *
 * Anonymous callers get a per-IP quota (ESTIMATE_GUEST_MAX per day) enforced by
 * the API; we surface the remaining count and gate the button when it runs out,
 * nudging the visitor to sign in (where quoting is unlimited). Quoting is an
 * explicit button press — not auto-on-edit — so one deliberate calculation
 * consumes exactly one of those tries.
 */
export function FareCalculator({ vehicles }: { vehicles: CalculatorVehicle[] }) {
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [dest, setDest] = useState<LatLng | null>(null);
  const [originAddress, setOriginAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [originProvince, setOriginProvince] = useState('');
  const [destProvince, setDestProvince] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    vehicles[0]?.vehicleType ?? ('PICKUP' as VehicleType),
  );
  const [pricingMode, setPricingMode] = useState<PricingMode>('CHARTER');
  const [itemCount, setItemCount] = useState(1);
  const [needsHelpers, setNeedsHelpers] = useState(false);
  // Cloudflare Turnstile (bot gate). `captchaNonce` remounts the widget for a
  // fresh single-use token after each calculation consumes one.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);

  // Keep the selected vehicle valid if the catalog changes underneath us.
  useEffect(() => {
    if (!vehicles.some((v) => v.vehicleType === vehicleType) && vehicles[0]) {
      setVehicleType(vehicles[0].vehicleType);
    }
  }, [vehicles, vehicleType]);

  const estimateBody = useMemo(
    () =>
      origin && dest
        ? {
            vehicleType,
            pricingMode,
            itemCount: pricingMode === 'PER_ITEM' ? itemCount : 1,
            originProvince: originProvince || undefined,
            originLat: origin.lat,
            originLng: origin.lng,
            destLat: dest.lat,
            destLng: dest.lng,
            needsHelpers,
          }
        : null,
    [origin, dest, vehicleType, pricingMode, itemCount, originProvince, needsHelpers],
  );

  const quote = useMutation({
    mutationFn: async (): Promise<QuoteResult> => {
      const res = await api.jobs.estimate.$post(
        { json: estimateBody! },
        captchaToken ? { headers: { 'cf-turnstile-response': captchaToken } } : undefined,
      );
      const header = res.headers.get('X-RateLimit-Remaining');
      const remaining = header != null ? Number(header) : null;
      if (res.status === 429) {
        throw new QuotaExceededError('คุณใช้สิทธิ์คำนวณราคาครบแล้ว');
      }
      if (!res.ok) throw new Error('คำนวณราคาไม่สำเร็จ ลองอีกครั้ง');
      return { quote: (await res.json()) as EstimateJobResponse, remaining };
    },
    // The token is single-use server-side — discard it and remount the widget
    // for a fresh one after every attempt.
    onSettled: () => {
      if (TURNSTILE_ENABLED) {
        setCaptchaToken(null);
        setCaptchaNonce((n) => n + 1);
      }
    },
  });

  // A quote is only valid for the inputs that produced it: clear the shown result
  // whenever any pricing input changes so the visitor re-presses "คำนวณราคา"
  // (and we never display a stale price for a different trip/vehicle).
  useEffect(() => {
    quote.reset();
  }, [estimateBody]);

  // Carry the route + vehicle over to /app/jobs/new by pre-seeding its draft, so
  // the customer doesn't re-enter what they already picked here. Runs on the
  // "โพสต์งานนี้เลย" click, just before navigation.
  const carryToPostForm = () => {
    saveJobDraft(
      buildEstimatePrefill({
        vehicleType,
        pricingMode,
        needsHelpers,
        origin,
        dest,
        originAddress,
        originProvince,
        destAddress,
        destProvince,
      }),
    );
  };

  const bothPinned = origin != null && dest != null;
  const result = quote.data?.quote;
  const hasQuote = result != null && result.subtotal > 0;
  const remaining = quote.data?.remaining ?? null;
  const quotaExhausted = quote.error instanceof QuotaExceededError;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {/* 1 — Locations (timeline) */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <EndpointField
          tone="origin"
          label="ต้นทาง — จุดรับของ"
          value={origin}
          address={originAddress}
          onPick={setOrigin}
          onResolve={(p) => {
            if (p.address) setOriginAddress(p.address);
            if (p.province) setOriginProvince(p.province);
          }}
          pin={PIN_GREEN}
        />
        <div className="ml-1.5 flex items-center gap-2 py-2 text-muted-foreground">
          <span className="h-6 w-px border-l-2 border-dashed" />
          <ArrowDown className="h-3.5 w-3.5" />
        </div>
        <EndpointField
          tone="dest"
          label="ปลายทาง — จุดส่งของ"
          value={dest}
          address={destAddress}
          onPick={setDest}
          onResolve={(p) => {
            if (p.address) setDestAddress(p.address);
            if (p.province) setDestProvince(p.province);
          }}
          pin={PIN_RED}
        />
      </section>

      {/* 2 — Route preview (only once both points exist) */}
      {bothPinned && (
        <section className="overflow-hidden rounded-2xl border bg-muted shadow-sm">
          <JobRouteMap origin={origin} dest={dest} className="h-48 w-full" />
        </section>
      )}

      {/* 3 — Vehicle */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">เลือกประเภทรถ</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {vehicles.map((v) => {
            const Icon = vehicleIcon(v.vehicleType);
            const active = v.vehicleType === vehicleType;
            const rate = pricingMode === 'PER_ITEM' ? v.pricePerKmShared : v.pricePerKm;
            return (
              <button
                key={v.vehicleType}
                type="button"
                onClick={() => setVehicleType(v.vehicleType)}
                className={cn(
                  'flex w-28 shrink-0 flex-col items-center gap-1 rounded-xl border-2 p-2 text-center transition-colors',
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/40 hover:border-border',
                )}
              >
                {v.imageUrl ? (
                  <img
                    src={v.imageUrl}
                    alt={v.label}
                    className="h-12 w-full rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-12 w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="h-6 w-6" />
                  </span>
                )}
                <span className="text-xs font-medium leading-tight">{v.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {rate != null ? `฿${rate}/กม.` : 'สอบถามราคา'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4 — Options */}
      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <p className="text-sm font-semibold">รูปแบบและบริการเสริม</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              { mode: 'CHARTER' as PricingMode, desc: 'จองทั้งคัน ของถึงไว' },
              { mode: 'PER_ITEM' as PricingMode, desc: 'คิดตามจำนวนชิ้น ประหยัดกว่า' },
            ]
          ).map(({ mode, desc }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPricingMode(mode)}
              className={cn(
                'rounded-lg border-2 p-2.5 text-left transition-colors',
                pricingMode === mode
                  ? 'border-primary bg-primary/5'
                  : 'border-transparent bg-muted/40 hover:border-border',
              )}
            >
              <p className="text-sm font-semibold">{PRICING_MODE_LABEL[mode]}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>

        {pricingMode === 'PER_ITEM' && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <span className="text-sm text-muted-foreground">จำนวนชิ้น</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="ลดจำนวน"
                onClick={() => setItemCount((n) => Math.max(1, n - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background hover:bg-accent"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center text-sm font-semibold tabular-nums">{itemCount}</span>
              <button
                type="button"
                aria-label="เพิ่มจำนวน"
                onClick={() => setItemCount((n) => Math.min(99, n + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background hover:bg-accent"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <label className="mt-3 flex cursor-pointer items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            ต้องการคนช่วยยก/ขนของ
          </span>
          <input
            type="checkbox"
            checked={needsHelpers}
            onChange={(e) => setNeedsHelpers(e.target.checked)}
            className="h-4 w-4 accent-[var(--primary)]"
          />
        </label>
      </section>

      {/* 5 — Action + result */}
      {quotaExhausted ? (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center shadow-sm">
          <p className="text-sm font-semibold">
            คุณใช้สิทธิ์คำนวณราคาครบ {ESTIMATE_GUEST_MAX} ครั้งแล้ว
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            เข้าสู่ระบบเพื่อคำนวณราคาและโพสต์งานได้ไม่จำกัด
          </p>
          <Button asChild className="mt-3 w-full" size="lg">
            <Link href="/login">เข้าสู่ระบบ</Link>
          </Button>
        </section>
      ) : (
        <section className="space-y-3">
          {!bothPinned && (
            <p className="text-center text-sm text-muted-foreground">
              เลือกต้นทางและปลายทางให้ครบเพื่อคำนวณราคา
            </p>
          )}

          {/* Bot challenge — only mounted once the trip is ready (and remounted
              per attempt for a fresh token). Renders nothing if not configured. */}
          {bothPinned && (
            <div className="flex justify-center">
              <Turnstile key={captchaNonce} onToken={setCaptchaToken} />
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            disabled={!bothPinned || quote.isPending || (TURNSTILE_ENABLED && !captchaToken)}
            onClick={() => quote.mutate()}
          >
            <Calculator className="mr-2 h-5 w-5" />
            {quote.isPending
              ? 'กำลังคำนวณ…'
              : bothPinned && TURNSTILE_ENABLED && !captchaToken
                ? 'กำลังยืนยันความปลอดภัย…'
                : 'คำนวณราคา'}
          </Button>

          {remaining != null && (
            <p className="text-center text-[11px] text-muted-foreground">
              เหลือสิทธิ์คำนวณฟรีอีก {remaining}/{ESTIMATE_GUEST_MAX} ครั้ง
            </p>
          )}
          {quote.error && !quotaExhausted && (
            <p className="text-center text-sm text-destructive">{quote.error.message}</p>
          )}

          {/* Quote breakdown */}
          {hasQuote && (
            <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 shadow-sm">
              <p className="text-center text-xs text-muted-foreground">ราคาประมาณการ</p>
              <p className="text-center text-4xl font-bold text-primary">
                ฿{result.total.toLocaleString()}
              </p>
              <div className="mt-4 space-y-1.5 text-sm">
                {result.baseFare > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">ราคาเริ่มต้น</span>
                    <span className="tabular-nums">฿{result.baseFare.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    ค่าขนส่ง ({result.distanceKm.toFixed(1)} กม. × ฿{result.pricePerKm}/กม.)
                  </span>
                  <span className="tabular-nums">฿{result.base.toLocaleString()}</span>
                </div>
                {result.flatRate > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">ค่าเหมาลำ</span>
                    <span className="tabular-nums">฿{result.flatRate.toLocaleString()}</span>
                  </div>
                )}
                {result.itemsCharge > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">ค่าสินค้า ({itemCount} ชิ้น)</span>
                    <span className="tabular-nums">฿{result.itemsCharge.toLocaleString()}</span>
                  </div>
                )}
                {result.surgeActive && (
                  <div className="flex justify-between gap-3 text-orange-600">
                    <span className="flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 shrink-0" />
                      ช่วงความต้องการสูง (×{result.surgeMultiplier})
                    </span>
                    <span>รวมในค่าขนส่ง</span>
                  </div>
                )}
                {result.floorSurcharge > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">ค่าขึ้น–ลงชั้น</span>
                    <span className="tabular-nums">฿{result.floorSurcharge.toLocaleString()}</span>
                  </div>
                )}
                {result.helperSurcharge > 0 && (
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">ค่าคนช่วยยก</span>
                    <span className="tabular-nums">฿{result.helperSurcharge.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <Button asChild className="mt-5 w-full" size="lg">
                <Link href="/app/jobs/new" onClick={carryToPostForm}>
                  โพสต์งานนี้เลย
                </Link>
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                ราคาจริงอาจเปลี่ยนตามบริการเสริม (ชั้น/ลิฟต์/ช่วงเวลา) — ยืนยันอีกครั้งก่อนโพสต์งาน
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
