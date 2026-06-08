'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
import { SystemSettingsCard } from '@/components/settings/system-settings-card';
import { ServiceAreasCard } from '@/components/settings/service-areas-card';
import { VehiclePricingCard } from '@/components/settings/vehicle-pricing-card';

const TABS = [
  { key: 'pricing', label: 'ราคา & คอมมิชชั่น' },
  { key: 'areas', label: 'พื้นที่บริการ' },
  { key: 'system', label: 'ระบบ' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('pricing');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState('');
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
      setPrice(String(pricing.data.pricePerKm));
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });

  const savePrice = useMutation({
    mutationFn: async (patch: {
      pricePerKm?: number;
      floorSurcharge?: number;
      helperSurcharge?: number;
    }) => {
      const res = await api.admin.settings.pricing.$put({ json: patch });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as PricingSettingResponse;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });

  const saveSurcharge = useMutation({
    mutationFn: async (patch: { floorSurcharge: number; helperSurcharge: number }) => {
      const res = await api.admin.settings.pricing.$put({ json: patch });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as PricingSettingResponse;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });

  const saveSurge = useMutation({
    mutationFn: async (patch: { surgeEnabled: boolean; surgeMultiplier: number }) => {
      const res = await api.admin.settings.pricing.$put({ json: patch });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as PricingSettingResponse;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
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

  const onSavePrice = () => {
    setPriceError(null);
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) {
      setPriceError('กรอกตัวเลขไม่ติดลบ');
      return;
    }
    savePrice.mutate({ pricePerKm: n });
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
  const priceDirty = pricing.data ? String(pricing.data.pricePerKm) !== price : false;
  const surchargeDirty = pricing.data
    ? String(pricing.data.floorSurcharge) !== floor ||
      String(pricing.data.helperSurcharge) !== helper
    : false;
  const surgeDirty = pricing.data
    ? pricing.data.surgeEnabled !== surgeEnabled ||
      String(pricing.data.surgeMultiplier) !== surgeMultiplier
    : false;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ตั้งค่า</h1>

      <div className="flex gap-1 border-b">
        {TABS.map((tt) => (
          <button
            key={tt.key}
            type="button"
            onClick={() => setTab(tt.key)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === tt.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tt.label}
          </button>
        ))}
      </div>

      {tab === 'pricing' && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>คอมมิชชั่นแพลตฟอร์ม</CardTitle>
          <CardDescription>
            เปอร์เซ็นต์ที่หักจากค่างานของคนขับ ใช้เป็นค่าเริ่มต้นกับงานใหม่
            (งานที่รับแล้วใช้ค่าที่ถูกบันทึกไว้ ณ ตอนรับงาน)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="commissionPct">คอมมิชชั่น (%)</Label>
            <Input
              id="commissionPct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={value}
              disabled={commission.isLoading}
              onChange={(e) => setValue(e.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            {save.isSuccess && !dirty && <p className="text-sm text-emerald-600">บันทึกแล้ว</p>}
          </div>
          <Button onClick={onSave} disabled={save.isPending || commission.isLoading || !dirty}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ราคาการรับงาน (ต่อกิโลเมตร)</CardTitle>
          <CardDescription>
            ใช้คำนวณ “ราคาแนะนำ” ตอนสร้างงาน (ระยะทาง × เรตนี้) ลูกค้าเสนอเพิ่มได้ตามเหตุสมควร
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pricePerKm">ราคาต่อกิโลเมตร (บาท)</Label>
            <Input
              id="pricePerKm"
              type="number"
              min={0}
              step="1"
              value={price}
              disabled={pricing.isLoading}
              onChange={(e) => setPrice(e.target.value)}
            />
            {priceError && <p className="text-sm text-destructive">{priceError}</p>}
            {savePrice.isSuccess && !priceDirty && (
              <p className="text-sm text-emerald-600">บันทึกแล้ว</p>
            )}
          </div>
          <Button
            onClick={onSavePrice}
            disabled={savePrice.isPending || pricing.isLoading || !priceDirty}
          >
            {savePrice.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ค่าบริการเสริม</CardTitle>
          <CardDescription>
            บวกเพิ่มจากค่าขนส่งตอนคำนวณราคา: ค่าขึ้น–ลงต่อชั้น (เมื่อไม่มีลิฟต์ คิดทั้งต้นทางและปลายทาง)
            และค่าคนช่วยยกแบบเหมา
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            {surchargeError && <p className="text-sm text-destructive">{surchargeError}</p>}
            {saveSurcharge.isSuccess && !surchargeDirty && (
              <p className="text-sm text-emerald-600">บันทึกแล้ว</p>
            )}
          </div>
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
          <CardTitle>ราคาช่วงความต้องการสูง (Surge)</CardTitle>
          <CardDescription>
            เมื่อเปิด ระบบจะคูณค่าขนส่งอัตโนมัติในจังหวัดที่งานเปิดรับมากกว่าคนขับที่ว่าง
            (จังหวัด “ขาดคนขับ”) เพื่อจูงใจให้คนขับออกมารับงาน
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
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
            {saveSurge.isSuccess && !surgeDirty && (
              <p className="text-sm text-emerald-600">บันทึกแล้ว</p>
            )}
          </div>
          <Button
            onClick={onSaveSurge}
            disabled={saveSurge.isPending || pricing.isLoading || !surgeDirty}
          >
            {saveSurge.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </CardContent>
      </Card>

          <VehiclePricingCard />
        </div>
      )}

      {tab === 'areas' && (
        <div className="max-w-2xl">
          <ServiceAreasCard />
        </div>
      )}

      {tab === 'system' && <SystemSettingsCard />}
    </div>
  );
}
