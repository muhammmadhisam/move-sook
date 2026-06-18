'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ProvinceSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movesook/ui';
import {
  estimateJobPrice,
  vehicleTypeLabel,
  type CustomerDto,
  type DriverDto,
  type PricingSettingResponse,
  type VehiclePricingDto,
  type VehicleType,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

type CustomerMode = 'existing' | 'new';
type Disposition = 'post' | 'assign';

export default function AdminNewJobPage() {
  const router = useRouter();

  const [customerMode, setCustomerMode] = useState<CustomerMode>('new');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selected, setSelected] = useState<CustomerDto | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  const [itemDescription, setItemDescription] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('PICKUP');
  const [originAddress, setOriginAddress] = useState('');
  const [originProvince, setOriginProvince] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [destProvince, setDestProvince] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [priceQuoted, setPriceQuoted] = useState('');

  const [disposition, setDisposition] = useState<Disposition>('post');
  const [assignDriverId, setAssignDriverId] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [paymentSlipUrl, setPaymentSlipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Configured delivery rate (per km) → drives the suggested price.
  const pricing = useQuery({
    queryKey: ['admin', 'settings', 'pricing'],
    queryFn: async (): Promise<PricingSettingResponse> => {
      const res = await api.admin.settings.pricing.$get();
      if (!res.ok) throw new Error('โหลดเรตราคาไม่สำเร็จ');
      return (await res.json()) as PricingSettingResponse;
    },
  });
  // Vehicle-type config — only show types that are open for joining.
  const vehicleConfig = useQuery({
    queryKey: ['admin', 'vehicle-pricing'],
    queryFn: async (): Promise<{ items: VehiclePricingDto[] }> => {
      const res = await api.admin['vehicle-pricing'].$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as { items: VehiclePricingDto[] };
    },
  });
  const configByType = new Map((vehicleConfig.data?.items ?? []).map((c) => [c.vehicleType, c]));
  // The catalog drives the list — only types that are open for joining.
  const activeVehicleTypes = (vehicleConfig.data?.items ?? [])
    .filter((c) => c.isActive)
    .map((c) => c.vehicleType);

  // If the current selection got disabled, fall back to the first active type.
  useEffect(() => {
    if (vehicleConfig.data && !activeVehicleTypes.includes(vehicleType) && activeVehicleTypes[0]) {
      setVehicleType(activeVehicleTypes[0]);
    }
  }, [vehicleConfig.data, activeVehicleTypes, vehicleType]);

  // Per-vehicle rate overrides the global rate for the suggested price.
  const globalRate = pricing.data?.pricePerKm ?? 0;
  const pricePerKm = configByType.get(vehicleType)?.pricePerKm ?? globalRate;
  const distanceNum = Number(distanceKm);
  const suggestedPrice = estimateJobPrice(distanceNum, pricePerKm);

  // Recompute the suggested default whenever distance/rate change; the admin can
  // still type a higher price (a customer may negotiate up as appropriate).
  const applySuggested = (km: string) => {
    setDistanceKm(km);
    const s = estimateJobPrice(Number(km), pricePerKm);
    if (s > 0) setPriceQuoted(String(s));
  };

  const searchTrim = customerSearch.trim();
  const customerResults = useQuery({
    queryKey: ['admin', 'customers', searchTrim],
    enabled: customerMode === 'existing' && searchTrim.length > 0,
    queryFn: async (): Promise<{ items: CustomerDto[] }> => {
      const res = await api.admin.customers.$get({ query: { search: searchTrim } });
      if (!res.ok) throw new Error('ค้นหาลูกค้าไม่สำเร็จ');
      return (await res.json()) as { items: CustomerDto[] };
    },
  });

  const approvedDrivers = useQuery({
    queryKey: ['admin', 'drivers', 'APPROVED'],
    enabled: disposition === 'assign',
    queryFn: async (): Promise<{ items: DriverDto[] }> => {
      const res = await api.admin.drivers.$get({ query: { status: 'APPROVED' } });
      if (!res.ok) throw new Error('โหลดคนขับไม่สำเร็จ');
      return (await res.json()) as { items: DriverDto[] };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const json: Record<string, unknown> = {
        itemDescription,
        vehicleType,
        originAddress,
        originProvince,
        destAddress,
        destProvince,
      };
      if (priceQuoted.trim()) json.priceQuoted = Number(priceQuoted);
      if (promoCode.trim()) json.promoCode = promoCode.trim();
      if (paymentSlipUrl) json.paymentSlipUrl = paymentSlipUrl;
      if (customerMode === 'existing') {
        json.customerId = selected?.id;
      } else {
        json.customerName = customerName.trim();
        if (customerPhone.trim()) json.customerPhone = customerPhone.trim();
        if (customerNote.trim()) json.customerNote = customerNote.trim();
      }
      if (disposition === 'assign') json.assignDriverId = assignDriverId;
      // Cast: AdminCreateJobInput is validated server-side.
      const res = await api.admin.jobs.$post({ json: json as never });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'สร้างงานไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => router.push('/jobs'),
    onError: (e: Error) => setError(e.message),
  });

  const onSubmit = () => {
    setError(null);
    if (itemDescription.trim().length < 3) return setError('กรอกรายการสิ่งของ');
    if (originAddress.trim().length < 3 || !originProvince) return setError('กรอกที่อยู่/จังหวัดต้นทาง');
    if (destAddress.trim().length < 3 || !destProvince) return setError('กรอกที่อยู่/จังหวัดปลายทาง');
    if (customerMode === 'existing' && !selected) return setError('เลือกลูกค้าเดิม');
    if (customerMode === 'new' && customerName.trim().length < 1) return setError('กรอกชื่อลูกค้า');
    if (disposition === 'assign' && !assignDriverId) return setError('เลือกคนขับที่จะมอบหมาย');
    create.mutate();
  };

  return (
    <div className="max-w-2xl">
      <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
        ← กลับ
      </Link>
      <h1 className="mb-6 mt-1 text-2xl font-bold">สร้างงานแทนลูกค้า</h1>

      <div className="space-y-6">
        {/* Customer */}
        <Card>
          <CardHeader>
            <CardTitle>ลูกค้า</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={customerMode === 'new' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCustomerMode('new')}
              >
                ลูกค้าใหม่
              </Button>
              <Button
                type="button"
                variant={customerMode === 'existing' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCustomerMode('existing')}
              >
                ลูกค้าเดิม
              </Button>
            </div>

            {customerMode === 'new' ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="cname">ชื่อลูกค้า *</Label>
                  <Input
                    id="cname"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cphone">เบอร์โทร</Label>
                  <Input
                    id="cphone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cnote">หมายเหตุ</Label>
                  <Input
                    id="cnote"
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="ค้นหาชื่อ / เบอร์โทรลูกค้าเดิม"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setSelected(null);
                  }}
                />
                {selected ? (
                  <p className="text-sm">
                    เลือกแล้ว: <span className="font-medium">{selected.name ?? selected.id}</span>{' '}
                    {selected.phone ? `(${selected.phone})` : ''}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {customerResults.data?.items.map((cust) => (
                      <button
                        key={cust.id}
                        type="button"
                        onClick={() => setSelected(cust)}
                        className="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        {cust.name ?? '—'} {cust.phone ? `· ${cust.phone}` : ''}
                      </button>
                    ))}
                    {searchTrim && customerResults.data?.items.length === 0 && (
                      <p className="text-sm text-muted-foreground">ไม่พบลูกค้า</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Job details */}
        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดงาน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="item">รายการสิ่งของ *</Label>
              <Input
                id="item"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>ประเภทรถ</Label>
              <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeVehicleTypes.map((v) => (
                    <SelectItem key={v} value={v}>
                      {vehicleTypeLabel(v, configByType.get(v)?.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeVehicleTypes.length === 0 && (
                <p className="text-xs text-destructive">ยังไม่มีประเภทรถที่เปิดรับ</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="oaddr">ที่อยู่ต้นทาง *</Label>
                <Input
                  id="oaddr"
                  value={originAddress}
                  onChange={(e) => setOriginAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>จังหวัดต้นทาง *</Label>
                <ProvinceSelect value={originProvince} onChange={setOriginProvince} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="daddr">ที่อยู่ปลายทาง *</Label>
                <Input
                  id="daddr"
                  value={destAddress}
                  onChange={(e) => setDestAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>จังหวัดปลายทาง *</Label>
                <ProvinceSelect value={destProvince} onChange={setDestProvince} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="distance">ระยะทางโดยประมาณ (กม.)</Label>
                <Input
                  id="distance"
                  type="number"
                  min={0}
                  step="0.1"
                  value={distanceKm}
                  onChange={(e) => applySuggested(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="price">ราคาเสนอ (บาท)</Label>
                <Input
                  id="price"
                  type="number"
                  min={1}
                  value={priceQuoted}
                  onChange={(e) => setPriceQuoted(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {distanceNum > 0
                  ? `ราคาแนะนำ: ฿${suggestedPrice.toLocaleString()} (${distanceNum} กม. × ฿${pricePerKm}/กม.)`
                  : `เรตปัจจุบัน ฿${pricePerKm}/กม. — กรอกระยะทางเพื่อคำนวณราคาแนะนำ`}
              </span>
              {suggestedPrice > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPriceQuoted(String(suggestedPrice))}
                >
                  ใช้ราคาแนะนำ
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              ราคาแนะนำเป็นค่าเริ่มต้น — ลูกค้าเสนอเพิ่มได้ตามเหตุสมควร
            </p>
            <div className="space-y-1">
              <Label htmlFor="promo">โค้ดส่วนลด (ถ้ามี)</Label>
              <Input
                id="promo"
                value={promoCode}
                placeholder="เช่น WELCOME10"
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="max-w-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* Disposition */}
        <Card>
          <CardHeader>
            <CardTitle>การมอบหมาย</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={disposition === 'post' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisposition('post')}
              >
                โพสต์เปิดรับ
              </Button>
              <Button
                type="button"
                variant={disposition === 'assign' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDisposition('assign')}
              >
                มอบหมายคนขับเลย
              </Button>
            </div>
            {disposition === 'post' ? (
              <p className="text-sm text-muted-foreground">
                งานจะถูกโพสต์เป็น POSTED ให้คนขับในจังหวัดต้นทางกดรับเอง
              </p>
            ) : (
              <div className="space-y-1">
                <Label>คนขับ (อนุมัติแล้ว)</Label>
                <Select value={assignDriverId} onValueChange={setAssignDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="เลือกคนขับ" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedDrivers.data?.items.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.displayName ?? d.id} · {d.serviceProvince ?? '—'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  งานจะถูกตั้งเป็น ACCEPTED และคิดคอมมิชชั่นตามค่าปัจจุบันทันที
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer's transfer slip (optional record). Admin-created jobs post
            directly; attaching a slip stores it and marks payment approved. */}
        <Card>
          <CardHeader>
            <CardTitle>สลิปการโอนของลูกค้า (ถ้ามี)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              แนบสลิปที่ลูกค้าโอนมาเพื่อเก็บเป็นหลักฐาน — งานที่แอดมินสร้างจะเผยแพร่ทันทีโดยไม่ต้องรออนุมัติ
            </p>
            <ImageUpload
              folder="slip"
              value={paymentSlipUrl}
              onUploaded={setPaymentSlipUrl}
              label="แนบสลิปการโอน"
            />
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={onSubmit} disabled={create.isPending}>
          {create.isPending ? 'กำลังสร้าง…' : 'สร้างงาน'}
        </Button>
      </div>
    </div>
  );
}
