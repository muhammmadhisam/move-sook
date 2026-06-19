'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BadgeCheck,
  Banknote,
  Boxes,
  Coins,
  MapPin,
  Percent,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  Settings2,
  Truck,
  TrendingUp,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  cn,
} from '@movesook/ui';
import type { CommissionSettingResponse, PricingSettingResponse } from '@movesook/shared';
import { api } from '@/lib/api';
import { ServiceAreasCard } from '@/components/settings/service-areas-card';
import { VehiclePricingCard } from '@/components/settings/vehicle-pricing-card';
import {
  BillingCompanyCard,
  CodCard,
  DriverRewardsCard,
  MaintenanceContactCard,
  PriceLimitsCard,
  RulesCard,
} from '@/components/settings/system-cards';

const TABS = [
  { key: 'pricing', label: 'ราคา & ค่าธรรมเนียม', icon: Coins },
  { key: 'vehicles', label: 'ประเภทรถ', icon: Truck },
  { key: 'areas', label: 'พื้นที่บริการ', icon: MapPin },
  { key: 'drivers', label: 'คนขับ & รางวัล', icon: BadgeCheck },
  { key: 'rules', label: 'กฎ & นโยบาย', icon: ShieldCheck },
  { key: 'billing', label: 'บัญชี & เอกสาร', icon: Banknote },
  { key: 'system', label: 'ระบบ & ติดต่อ', icon: Settings2 },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('pricing');

  // Honor a ?tab= deep link (e.g. returning from the vehicle editor page).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q && TABS.some((t) => t.key === q)) setTab(q as TabKey);
  }, []);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [baseFare, setBaseFare] = useState('');
  const [price, setPrice] = useState('');
  const [priceShared, setPriceShared] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);
  const [floor, setFloor] = useState('');
  const [helper, setHelper] = useState('');
  const [surchargeError, setSurchargeError] = useState<string | null>(null);
  const [surgeEnabled, setSurgeEnabled] = useState(false);
  const [surgeMultiplier, setSurgeMultiplier] = useState('');
  const [surgeError, setSurgeError] = useState<string | null>(null);

  const commission = useQuery({
    queryKey: ['admin', 'settings', 'commission'],
    queryFn: async (): Promise<CommissionSettingResponse> => {
      const res = await api.admin.settings.commission.$get();
      if (!res.ok) throw new Error('โหลดค่าคอมมิชชั่นไม่สำเร็จ');
      return (await res.json()) as CommissionSettingResponse;
    },
  });

  const pricing = useQuery({
    queryKey: ['admin', 'settings', 'pricing'],
    queryFn: async (): Promise<PricingSettingResponse> => {
      const res = await api.admin.settings.pricing.$get();
      if (!res.ok) throw new Error('โหลดค่าราคาต่อกม.ไม่สำเร็จ');
      return (await res.json()) as PricingSettingResponse;
    },
  });

  useEffect(() => {
    if (commission.data) setValue(String(commission.data.commissionPct));
  }, [commission.data]);

  useEffect(() => {
    if (pricing.data) {
      setBaseFare(String(pricing.data.baseFare));
      setPrice(String(pricing.data.pricePerKm));
      setPriceShared(String(pricing.data.pricePerKmShared));
      setFloor(String(pricing.data.floorSurcharge));
      setHelper(String(pricing.data.helperSurcharge));
      setSurgeEnabled(pricing.data.surgeEnabled);
      setSurgeMultiplier(String(pricing.data.surgeMultiplier));
    }
  }, [pricing.data]);

  const save = useMutation({
    mutationFn: async (commissionPct: number) => {
      const res = await api.admin.settings.commission.$put({ json: { commissionPct } });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as CommissionSettingResponse;
    },
    onSuccess: () => {
      toast.success('บันทึกค่าคอมมิชชั่นแล้ว');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePrice = useMutation({
    mutationFn: async (patch: {
      baseFare?: number;
      pricePerKm?: number;
      pricePerKmShared?: number;
      floorSurcharge?: number;
      helperSurcharge?: number;
    }) => {
      const res = await api.admin.settings.pricing.$put({ json: patch });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as PricingSettingResponse;
    },
    onSuccess: () => {
      toast.success('บันทึกเรตราคาต่อกม.แล้ว');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSurcharge = useMutation({
    mutationFn: async (patch: { floorSurcharge: number; helperSurcharge: number }) => {
      const res = await api.admin.settings.pricing.$put({ json: patch });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as PricingSettingResponse;
    },
    onSuccess: () => {
      toast.success('บันทึกค่าบริการเสริมแล้ว');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSurge = useMutation({
    mutationFn: async (patch: { surgeEnabled: boolean; surgeMultiplier: number }) => {
      const res = await api.admin.settings.pricing.$put({ json: patch });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as PricingSettingResponse;
    },
    onSuccess: () => {
      toast.success('บันทึกการตั้งค่า Surge แล้ว');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSave = () => {
    setError(null);
    const pct = Number(value);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('กรอกตัวเลขระหว่าง 0–100');
      return;
    }
    save.mutate(pct);
  };

  const onSavePrices = () => {
    setPriceError(null);
    const b = Number(baseFare);
    const n = Number(price);
    const s = Number(priceShared);
    if (
      !Number.isFinite(b) ||
      b < 0 ||
      !Number.isFinite(n) ||
      n < 0 ||
      !Number.isFinite(s) ||
      s < 0
    ) {
      setPriceError('กรอกตัวเลขไม่ติดลบ');
      return;
    }
    const patch: { baseFare?: number; pricePerKm?: number; pricePerKmShared?: number } = {};
    if (baseFareDirty) patch.baseFare = b;
    if (priceDirty) patch.pricePerKm = n;
    if (priceSharedDirty) patch.pricePerKmShared = s;
    savePrice.mutate(patch);
  };

  const onSaveSurcharge = () => {
    setSurchargeError(null);
    const f = Number(floor);
    const h = Number(helper);
    if (!Number.isFinite(f) || f < 0 || !Number.isFinite(h) || h < 0) {
      setSurchargeError('กรอกตัวเลขไม่ติดลบ');
      return;
    }
    saveSurcharge.mutate({ floorSurcharge: f, helperSurcharge: h });
  };

  const onSaveSurge = () => {
    setSurgeError(null);
    const m = Number(surgeMultiplier);
    if (!Number.isFinite(m) || m < 1 || m > 5) {
      setSurgeError('ตัวคูณต้องอยู่ระหว่าง 1–5');
      return;
    }
    saveSurge.mutate({ surgeEnabled, surgeMultiplier: m });
  };

  const dirty = commission.data ? String(commission.data.commissionPct) !== value : false;
  const baseFareDirty = pricing.data ? String(pricing.data.baseFare) !== baseFare : false;
  const priceDirty = pricing.data ? String(pricing.data.pricePerKm) !== price : false;
  const priceSharedDirty = pricing.data
    ? String(pricing.data.pricePerKmShared) !== priceShared
    : false;
  const pricesDirty = baseFareDirty || priceDirty || priceSharedDirty;
  const surchargeDirty = pricing.data
    ? String(pricing.data.floorSurcharge) !== floor ||
      String(pricing.data.helperSurcharge) !== helper
    : false;
  const surgeDirty = pricing.data
    ? pricing.data.surgeEnabled !== surgeEnabled ||
      String(pricing.data.surgeMultiplier) !== surgeMultiplier
    : false;

  // "ถูกกว่าเหมาลำ X%" hint for the non-charter rate.
  const charterNum = Number(price);
  const sharedNum = Number(priceShared);
  const sharedSavingPct =
    Number.isFinite(charterNum) &&
    Number.isFinite(sharedNum) &&
    charterNum > 0 &&
    sharedNum >= 0 &&
    sharedNum < charterNum
      ? Math.round((1 - sharedNum / charterNum) * 100)
      : null;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SlidersHorizontal className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">ตั้งค่า</h1>
          <p className="text-sm text-muted-foreground">
            จัดการราคา ค่าคอมมิชชั่น พื้นที่บริการ และค่าระบบทั้งหมดของแพลตฟอร์ม
          </p>
        </div>
      </div>

      {/* Segmented tab nav */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl border bg-muted/40 p-1">
        {TABS.map((tt) => {
          const Icon = tt.icon;
          const active = tab === tt.key;
          return (
            <button
              key={tt.key}
              type="button"
              onClick={() => setTab(tt.key)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {tt.label}
            </button>
          );
        })}
      </div>

      {tab === 'pricing' && (
        <div className="space-y-6">
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="h-4 w-4 text-primary" />
                  คอมมิชชั่นแพลตฟอร์ม
                </CardTitle>
                <CardDescription>
                  เปอร์เซ็นต์ที่หักจากค่างานของคนขับ ใช้เป็นค่าเริ่มต้นกับงานใหม่
                  (งานที่รับแล้วใช้ค่าที่ถูกบันทึกไว้ ณ ตอนรับงาน)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="commissionPct">คอมมิชชั่น (%)</Label>
                  <div className="relative">
                    <Input
                      id="commissionPct"
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      className="pr-9"
                      value={value}
                      disabled={commission.isLoading}
                      onChange={(e) => setValue(e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <Button onClick={onSave} disabled={save.isPending || commission.isLoading || !dirty}>
                  {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-primary" />
                  ราคาการรับงาน (ต่อกิโลเมตร)
                </CardTitle>
                <CardDescription>
                  ใช้คำนวณ “ราคาแนะนำ” ตอนสร้างงาน (ระยะทาง × เรตนี้) เป็นเรตกลางเมื่อประเภทรถไม่ได้ตั้งเอง
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="baseFare">ราคาเริ่มต้น (บาท)</Label>
                  <Input
                    id="baseFare"
                    type="number"
                    min={0}
                    step="1"
                    value={baseFare}
                    disabled={pricing.isLoading}
                    onChange={(e) => setBaseFare(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    ค่าเริ่มต้นที่บวกให้ทุกงานก่อนคิดค่าระยะทาง (เช่น 250 บาท) แล้วจึง + ค่าต่อกิโลเมตร
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pricePerKm">เหมาลำ (บาท/กม.)</Label>
                    <Input
                      id="pricePerKm"
                      type="number"
                      min={0}
                      step="1"
                      value={price}
                      disabled={pricing.isLoading}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="pricePerKmShared">ไม่เหมาลำ (บาท/กม.)</Label>
                      {sharedSavingPct !== null && (
                        <Badge variant="success" className="text-[10px]">
                          ถูกกว่า {sharedSavingPct}%
                        </Badge>
                      )}
                    </div>
                    <Input
                      id="pricePerKmShared"
                      type="number"
                      min={0}
                      step="1"
                      value={priceShared}
                      disabled={pricing.isLoading}
                      onChange={(e) => setPriceShared(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  งานคิดตามชิ้น (ไม่เหมาลำ) ใช้เรตที่ถูกกว่า — ลูกค้าจ่ายค่าระยะทางน้อยกว่าการเหมาทั้งคัน
                </p>
                {priceError && <p className="text-sm text-destructive">{priceError}</p>}
                <Button
                  onClick={onSavePrices}
                  disabled={savePrice.isPending || pricing.isLoading || !pricesDirty}
                >
                  {savePrice.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-primary" />
                  ค่าบริการเสริม
                </CardTitle>
                <CardDescription>
                  บวกเพิ่มจากค่าขนส่งตอนคำนวณราคา: ค่าขึ้น–ลงต่อชั้น (เมื่อไม่มีลิฟต์ คิดทั้งต้นทางและปลายทาง)
                  และค่าคนช่วยยกแบบเหมา
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="floorSurcharge">ค่าขึ้น–ลงต่อชั้น ไม่มีลิฟต์ (บาท)</Label>
                    <Input
                      id="floorSurcharge"
                      type="number"
                      min={0}
                      step="1"
                      value={floor}
                      disabled={pricing.isLoading}
                      onChange={(e) => setFloor(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="helperSurcharge">ค่าคนช่วยยก เหมา (บาท)</Label>
                    <Input
                      id="helperSurcharge"
                      type="number"
                      min={0}
                      step="1"
                      value={helper}
                      disabled={pricing.isLoading}
                      onChange={(e) => setHelper(e.target.value)}
                    />
                  </div>
                </div>
                {surchargeError && <p className="text-sm text-destructive">{surchargeError}</p>}
                <Button
                  onClick={onSaveSurcharge}
                  disabled={saveSurcharge.isPending || pricing.isLoading || !surchargeDirty}
                >
                  {saveSurcharge.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  ราคาช่วงความต้องการสูง (Surge)
                  <Badge variant={surgeEnabled ? 'success' : 'secondary'} className="ml-auto">
                    {surgeEnabled ? 'เปิด' : 'ปิด'}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  เมื่อเปิด ระบบจะคูณค่าขนส่งอัตโนมัติในจังหวัดที่งานเปิดรับมากกว่าคนขับที่ว่าง
                  (จังหวัด “ขาดคนขับ”) เพื่อจูงใจให้คนขับออกมารับงาน
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                  <Checkbox
                    checked={surgeEnabled}
                    onCheckedChange={(v) => setSurgeEnabled(v === true)}
                  />
                  <span>เปิดใช้งาน Surge pricing</span>
                </label>
                <div className="space-y-2">
                  <Label htmlFor="surgeMultiplier">ตัวคูณราคา (1–5 เท่า)</Label>
                  <Input
                    id="surgeMultiplier"
                    type="number"
                    min={1}
                    max={5}
                    step="0.1"
                    value={surgeMultiplier}
                    disabled={pricing.isLoading || !surgeEnabled}
                    onChange={(e) => setSurgeMultiplier(e.target.value)}
                  />
                  {surgeError && <p className="text-sm text-destructive">{surgeError}</p>}
                </div>
                <Button
                  onClick={onSaveSurge}
                  disabled={saveSurge.isPending || pricing.isLoading || !surgeDirty}
                >
                  {saveSurge.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
                </Button>
              </CardContent>
            </Card>

            <PriceLimitsCard />
            <CodCard />
          </div>
        </div>
      )}

      {tab === 'vehicles' && (
        <div className="space-y-6">
          <VehiclePricingCard />
        </div>
      )}

      {tab === 'areas' && (
        <div className="max-w-2xl">
          <ServiceAreasCard />
        </div>
      )}

      {tab === 'drivers' && (
        <div className="max-w-2xl">
          <DriverRewardsCard />
        </div>
      )}

      {tab === 'rules' && (
        <div className="max-w-2xl">
          <RulesCard />
        </div>
      )}

      {tab === 'billing' && (
        <div className="max-w-2xl">
          <BillingCompanyCard />
        </div>
      )}

      {tab === 'system' && (
        <div className="max-w-2xl">
          <MaintenanceContactCard />
        </div>
      )}
    </div>
  );
}
