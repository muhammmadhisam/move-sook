'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
  Textarea,
} from '@movesook/ui';
import {
  DriverUpdateInput,
  GenderSchema,
  GENDER_LABEL,
  vehicleTypeLabel,
  type DriverDto,
  type Gender,
  type JobPricingResponse,
  type VehicleType,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';
import { PageTour, type TourStep } from '@/components/tour/tour';

const DRIVER_EDIT_TOUR: TourStep[] = [
  {
    element: '[data-tour="driver-edit-head"]',
    popover: {
      title: 'แก้ไขข้อมูลคนขับ',
      description:
        'อัปเดตข้อมูลส่วนตัว รถ และเอกสารได้ที่นี่ ถ้าใบสมัครถูกตีกลับ แก้ไขแล้วบันทึกเพื่อส่งตรวจสอบใหม่อีกครั้ง',
    },
  },
];

// Vehicle photo angles the driver uploads (front/back/left/right + plate).
const VEHICLE_PHOTOS = [
  { key: 'vehiclePhotoFront', label: 'รูปรถ ด้านหน้า' },
  { key: 'vehiclePhotoBack', label: 'รูปรถ ด้านหลัง' },
  { key: 'vehiclePhotoLeft', label: 'รูปรถ ด้านซ้าย' },
  { key: 'vehiclePhotoRight', label: 'รูปรถ ด้านขวา' },
  { key: 'vehiclePhotoPlate', label: 'รูปป้ายทะเบียน' },
] as const;
type VehiclePhotoKey = (typeof VEHICLE_PHOTOS)[number]['key'];

export default function DriverEditPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: '' as Gender | '',
    email: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    licenseNo: '',
    licenseExpiry: '',
    vehicleType: 'PICKUP' as VehicleType,
    plateNumber: '',
    serviceProvince: '',
    phone: '',
    nationalId: '',
    address: '',
    bankName: '',
    bankAccountName: '',
    bankAccountNo: '',
  });
  const [licenseTw2, setLicenseTw2] = useState<string | null>(null);
  const [nationalIdUrl, setNationalIdUrl] = useState<string | null>(null);
  const [vehiclePhotos, setVehiclePhotos] = useState<Record<VehiclePhotoKey, string | null>>({
    vehiclePhotoFront: null,
    vehiclePhotoBack: null,
    vehiclePhotoLeft: null,
    vehiclePhotoRight: null,
    vehiclePhotoPlate: null,
  });

  const me = useQuery({
    queryKey: ['driver-me'],
    queryFn: async (): Promise<DriverDto> => {
      const res = await api.drivers.me.$get();
      if (!res.ok) throw new Error('โหลดข้อมูลคนขับไม่สำเร็จ');
      return (await res.json()) as DriverDto;
    },
  });

  // Vehicle types come from the admin catalog (VehiclePricing via the pricing API).
  const pricing = useQuery({
    queryKey: ['jobs', 'pricing'],
    queryFn: async (): Promise<JobPricingResponse> => {
      const res = await api.jobs.pricing.$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as JobPricingResponse;
    },
  });
  // Active types, plus the driver's current type even if it was since closed, so the
  // select still shows what they have.
  const vehicleOptions = useMemo(() => {
    const active = pricing.data?.rates.filter((r) => r.isActive).map((r) => r.vehicleType) ?? [];
    const current = me.data?.vehicleType;
    return current && !active.includes(current) ? [current, ...active] : active;
  }, [pricing.data, me.data]);
  const vehicleLabel = useMemo(() => {
    const byType = new Map(pricing.data?.rates.map((r) => [r.vehicleType, r.label]) ?? []);
    return (vt: string) => vehicleTypeLabel(vt, byType.get(vt));
  }, [pricing.data]);

  // Seed the form once the driver record loads.
  useEffect(() => {
    const d = me.data;
    if (!d) return;
    setForm({
      firstName: d.firstName ?? '',
      lastName: d.lastName ?? '',
      birthDate: d.birthDate ? d.birthDate.slice(0, 10) : '',
      gender: d.gender ?? '',
      email: d.email ?? '',
      emergencyContactName: d.emergencyContactName ?? '',
      emergencyContactPhone: d.emergencyContactPhone ?? '',
      licenseNo: d.licenseNo ?? '',
      licenseExpiry: d.licenseExpiry ? d.licenseExpiry.slice(0, 10) : '',
      vehicleType: d.vehicleType,
      plateNumber: d.plateNumber ?? '',
      serviceProvince: d.serviceProvince ?? '',
      phone: d.phone ?? '',
      nationalId: d.nationalId ?? '',
      address: d.address ?? '',
      bankName: d.bankName ?? '',
      bankAccountName: d.bankAccountName ?? '',
      bankAccountNo: d.bankAccountNo ?? '',
    });
    setLicenseTw2(d.licenseTw2 ?? null);
    setNationalIdUrl(d.nationalIdUrl ?? null);
    setVehiclePhotos({
      vehiclePhotoFront: d.vehiclePhotoFront ?? null,
      vehiclePhotoBack: d.vehiclePhotoBack ?? null,
      vehiclePhotoLeft: d.vehiclePhotoLeft ?? null,
      vehiclePhotoRight: d.vehiclePhotoRight ?? null,
      vehiclePhotoPlate: d.vehiclePhotoPlate ?? null,
    });
  }, [me.data]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const parsed = DriverUpdateInput.safeParse({
        vehicleType: form.vehicleType,
        plateNumber: form.plateNumber || undefined,
        serviceProvince: form.serviceProvince || undefined,
        phone: form.phone || undefined,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        birthDate: form.birthDate || undefined,
        gender: form.gender || undefined,
        email: form.email || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
        licenseNo: form.licenseNo || undefined,
        licenseExpiry: form.licenseExpiry || undefined,
        licenseTw2: licenseTw2 || undefined,
        vehiclePhotoFront: vehiclePhotos.vehiclePhotoFront || undefined,
        vehiclePhotoBack: vehiclePhotos.vehiclePhotoBack || undefined,
        vehiclePhotoLeft: vehiclePhotos.vehiclePhotoLeft || undefined,
        vehiclePhotoRight: vehiclePhotos.vehiclePhotoRight || undefined,
        vehiclePhotoPlate: vehiclePhotos.vehiclePhotoPlate || undefined,
        nationalId: form.nationalId || undefined,
        nationalIdUrl: nationalIdUrl || undefined,
        address: form.address || undefined,
        bankName: form.bankName || undefined,
        bankAccountName: form.bankAccountName || undefined,
        bankAccountNo: form.bankAccountNo || undefined,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
      const res = await api.drivers.me.$patch({ json: parsed.data });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'บันทึกไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('บันทึกข้อมูลแล้ว — รอแอดมินตรวจสอบ');
      queryClient.invalidateQueries({ queryKey: ['driver-me'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      router.push('/app/profile');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (me.isLoading) {
    return <div className="mx-auto max-w-md p-6 text-sm text-muted-foreground">กำลังโหลด…</div>;
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <PageTour id="driver-edit" steps={DRIVER_EDIT_TOUR} />
      <Card>
        <CardHeader>
          <CardTitle data-tour="driver-edit-head">ข้อมูลคนขับ</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* ── ข้อมูลส่วนตัว ── */}
          <p className="text-sm font-medium text-muted-foreground">ข้อมูลส่วนตัว</p>

          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="grid gap-2">
              <Label htmlFor="firstName">ชื่อจริง</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => set('firstName')(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lastName">นามสกุล</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => set('lastName')(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="birthDate">วันเกิด</Label>
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate}
              onChange={(e) => set('birthDate')(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">อีเมล</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="grid gap-2">
              <Label htmlFor="emName">ผู้ติดต่อฉุกเฉิน</Label>
              <Input
                id="emName"
                value={form.emergencyContactName}
                onChange={(e) => set('emergencyContactName')(e.target.value)}
                placeholder="ชื่อ"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emPhone">เบอร์ฉุกเฉิน</Label>
              <Input
                id="emPhone"
                value={form.emergencyContactPhone}
                onChange={(e) => set('emergencyContactPhone')(e.target.value)}
                placeholder="เบอร์โทร"
              />
            </div>
          </div>

          {/* เพศ — full-width at the bottom of the personal-info block to match
              the apply form's narrow Mini App layout. */}
          <div className="grid gap-2">
            <Label>เพศ</Label>
            <Select value={form.gender} onValueChange={(v) => set('gender')(v)}>
              <SelectTrigger>
                <SelectValue placeholder="เลือกเพศ" />
              </SelectTrigger>
              <SelectContent>
                {GenderSchema.options.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GENDER_LABEL[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── ข้อมูลรถ & ใบขับขี่ ── */}
          <p className="mt-2 text-sm font-medium text-muted-foreground">ข้อมูลรถ &amp; ใบขับขี่</p>

          <div className="grid gap-2">
            <Label>ประเภทรถ</Label>
            <Select value={form.vehicleType} onValueChange={(v) => set('vehicleType')(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vehicleOptions.map((v) => (
                  <SelectItem key={v} value={v}>
                    {vehicleLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="plate">ทะเบียนรถ</Label>
            <Input
              id="plate"
              value={form.plateNumber}
              onChange={(e) => set('plateNumber')(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <div className="grid gap-2">
              <Label htmlFor="licenseNo">เลขใบขับขี่</Label>
              <Input
                id="licenseNo"
                value={form.licenseNo}
                onChange={(e) => set('licenseNo')(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="licenseExpiry">วันหมดอายุ</Label>
              <Input
                id="licenseExpiry"
                type="date"
                value={form.licenseExpiry}
                onChange={(e) => set('licenseExpiry')(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>จังหวัดที่ให้บริการ</Label>
            <ProvinceSelect
              value={form.serviceProvince}
              onChange={set('serviceProvince')}
              placeholder="เลือกจังหวัด"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">เบอร์โทร</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => set('phone')(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="nationalId">เลขบัตรประชาชน</Label>
            <Input
              id="nationalId"
              inputMode="numeric"
              maxLength={13}
              value={form.nationalId}
              onChange={(e) => set('nationalId')(e.target.value.replace(/\D/g, ''))}
              placeholder="เลข 13 หลัก"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">ที่อยู่</Label>
            <Textarea
              id="address"
              rows={3}
              value={form.address}
              onChange={(e) => set('address')(e.target.value)}
              placeholder="ที่อยู่ตามบัตรประชาชน / ที่อยู่ติดต่อ"
            />
          </div>

          <div className="grid gap-2">
            <Label>รูปบัตรประชาชน</Label>
            <ImageUpload
              folder="driver"
              value={nationalIdUrl}
              label={nationalIdUrl ? 'เปลี่ยนรูปบัตรประชาชน' : 'อัปโหลดรูปบัตรประชาชน'}
              onUploaded={setNationalIdUrl}
            />
          </div>

          <div className="grid gap-2">
            <Label>ใบขับขี่</Label>
            <ImageUpload
              folder="driver"
              value={licenseTw2}
              label={licenseTw2 ? 'เปลี่ยนรูปใบขับขี่' : 'อัปโหลดรูปใบขับขี่'}
              onUploaded={setLicenseTw2}
            />
          </div>

          {/* ── รูปรถ (4 ด้าน + ป้ายทะเบียน) ── */}
          <p className="mt-2 text-sm font-medium text-muted-foreground">รูปรถ</p>
          {VEHICLE_PHOTOS.map((p) => (
            <div key={p.key} className="grid gap-2">
              <Label>{p.label}</Label>
              <ImageUpload
                folder="driver"
                value={vehiclePhotos[p.key]}
                label={vehiclePhotos[p.key] ? `เปลี่ยน${p.label}` : `อัปโหลด${p.label}`}
                onUploaded={(url) => setVehiclePhotos((v) => ({ ...v, [p.key]: url }))}
              />
            </div>
          ))}

          <div className="grid gap-2">
            <Label>บัญชีรับเงิน</Label>
            <Input
              value={form.bankName}
              onChange={(e) => set('bankName')(e.target.value)}
              placeholder="ธนาคาร"
            />
            <Input
              value={form.bankAccountName}
              onChange={(e) => set('bankAccountName')(e.target.value)}
              placeholder="ชื่อบัญชี"
            />
            <Input
              value={form.bankAccountNo}
              onChange={(e) => set('bankAccountNo')(e.target.value)}
              placeholder="เลขที่บัญชี"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
