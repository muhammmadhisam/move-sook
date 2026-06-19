'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
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
  DriverApplyInput,
  DRIVER_SCREENING_QUESTIONS,
  GenderSchema,
  GENDER_LABEL,
  vehicleTypeLabel,
  type Gender,
  type JobPricingResponse,
  type VehicleType,
} from '@movesook/shared';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

const STEPS = ['ข้อมูลส่วนตัว', 'บัตร & ที่อยู่', 'ข้อมูลรถ & ใบขับขี่', 'รูปรถ', 'คำถามคัดกรอง'] as const;

// Vehicle photo angles the applicant uploads (front/back/left/right + plate).
const VEHICLE_PHOTOS = [
  { key: 'vehiclePhotoFront', label: 'รูปรถ ด้านหน้า' },
  { key: 'vehiclePhotoBack', label: 'รูปรถ ด้านหลัง' },
  { key: 'vehiclePhotoLeft', label: 'รูปรถ ด้านซ้าย' },
  { key: 'vehiclePhotoRight', label: 'รูปรถ ด้านขวา' },
  { key: 'vehiclePhotoPlate', label: 'รูปป้ายทะเบียน' },
] as const;
type VehiclePhotoKey = (typeof VEHICLE_PHOTOS)[number]['key'];

export default function DriverApplyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { me, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    gender: '' as Gender | '',
    email: '',
    phone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    nationalId: '',
    address: '',
    licenseNo: '',
    licenseExpiry: '',
    vehicleType: 'PICKUP' as VehicleType,
    plateNumber: '',
    serviceProvince: '',
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
  const [screening, setScreening] = useState<Record<string, string>>({});

  // Vehicle types come from admin settings (VehiclePricing) so the applicant only
  // sees the types the platform currently serves — same source as the posting form.
  const pricing = useQuery({
    queryKey: ['jobs', 'pricing'],
    queryFn: async (): Promise<JobPricingResponse> => {
      const res = await api.jobs.pricing.$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as JobPricingResponse;
    },
  });
  const activeVehicleTypes = useMemo(
    () => pricing.data?.rates.filter((r) => r.isActive).map((r) => r.vehicleType) ?? [],
    [pricing.data],
  );
  const vehicleLabel = useMemo(() => {
    const byType = new Map(pricing.data?.rates.map((r) => [r.vehicleType, r.label]) ?? []);
    return (vt: VehicleType) => vehicleTypeLabel(vt, byType.get(vt));
  }, [pricing.data]);

  useEffect(() => {
    if (!activeVehicleTypes.includes(form.vehicleType) && activeVehicleTypes[0]) {
      setForm((f) => ({ ...f, vehicleType: activeVehicleTypes[0] as VehicleType }));
    }
  }, [activeVehicleTypes, form.vehicleType]);

  // Must be signed in to apply (LINE login). Existing drivers go to edit instead.
  useEffect(() => {
    if (isLoading) return;
    if (!me) router.replace('/login');
    else if (me.isDriver) router.replace('/app/driver/edit');
  }, [me, isLoading, router]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const apply = useMutation({
    mutationFn: async () => {
      const parsed = DriverApplyInput.safeParse({
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
        nationalId: form.nationalId || undefined,
        nationalIdUrl: nationalIdUrl || undefined,
        address: form.address || undefined,
        licenseNo: form.licenseNo || undefined,
        licenseExpiry: form.licenseExpiry || undefined,
        licenseTw2: licenseTw2 || undefined,
        vehiclePhotoFront: vehiclePhotos.vehiclePhotoFront || undefined,
        vehiclePhotoBack: vehiclePhotos.vehiclePhotoBack || undefined,
        vehiclePhotoLeft: vehiclePhotos.vehiclePhotoLeft || undefined,
        vehiclePhotoRight: vehiclePhotos.vehiclePhotoRight || undefined,
        vehiclePhotoPlate: vehiclePhotos.vehiclePhotoPlate || undefined,
        screening,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'กรุณากรอกข้อมูลให้ครบ');
      }
      const res = await api.drivers.apply.$post({ json: parsed.data });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'สมัครไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: async () => {
      toast.success('ส่งใบสมัครแล้ว — รอแอดมินตรวจสอบ');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/app/profile');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !me || me.isDriver) {
    return <div className="mx-auto max-w-md p-6 text-sm text-muted-foreground">กำลังโหลด…</div>;
  }

  // Per-step completion gates.
  const stepValid = [
    form.firstName.trim() !== '' && form.lastName.trim() !== '' && form.phone.trim().length >= 6,
    form.nationalId.length === 13,
    form.serviceProvince !== '',
    VEHICLE_PHOTOS.every((p) => vehiclePhotos[p.key]),
    DRIVER_SCREENING_QUESTIONS.every((q) => screening[q.key]),
  ];
  const isLastStep = step === STEPS.length - 1;
  const canAdvance = stepValid[step];

  const next = () => {
    setError(null);
    if (isLastStep) apply.mutate();
    else setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>สมัครเป็นคนขับ</CardTitle>
          {/* Step indicator */}
          <div className="mt-3 flex items-center gap-1.5">
            {STEPS.map((label, i) => (
              <div key={label} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                    i < step
                      ? 'bg-primary text-primary-foreground'
                      : i === step
                        ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    'text-center text-[10px] leading-tight',
                    i === step ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* ── Step 0: ข้อมูลส่วนตัว ── */}
          {step === 0 && (
            <>
              <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">
                    ชื่อจริง <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    value={form.firstName}
                    onChange={(e) => set('firstName')(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lastName">
                    นามสกุล <span className="text-destructive">*</span>
                  </Label>
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
                <Label htmlFor="phone">
                  เบอร์โทร <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => set('phone')(e.target.value)}
                  placeholder="เบอร์ติดต่อ"
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

              {/* เพศ — full-width at the bottom so the narrow Mini App layout
                  isn't cramped pairing it next to วันเกิด. */}
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
            </>
          )}

          {/* ── Step 1: บัตร & ที่อยู่ ── */}
          {step === 1 && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="nationalId">
                  เลขบัตรประชาชน <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="nationalId"
                  inputMode="numeric"
                  maxLength={13}
                  value={form.nationalId}
                  onChange={(e) => set('nationalId')(e.target.value.replace(/\D/g, ''))}
                  placeholder="เลข 13 หลัก"
                />
                {form.nationalId !== '' && form.nationalId.length !== 13 && (
                  <p className="text-xs text-destructive">เลขบัตรประชาชนต้องมี 13 หลัก</p>
                )}
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

              <div className="grid gap-2">
                <Label>รูปบัตรประชาชน</Label>
                <ImageUpload
                  folder="driver"
                  value={nationalIdUrl}
                  label={nationalIdUrl ? 'เปลี่ยนรูปบัตรประชาชน' : 'อัปโหลดรูปบัตรประชาชน'}
                  onUploaded={setNationalIdUrl}
                />
              </div>
            </>
          )}

          {/* ── Step 2: ข้อมูลรถ & ใบขับขี่ ── */}
          {step === 2 && (
            <>
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
              </div>

              <div className="grid gap-2">
                <Label>
                  จังหวัดที่ให้บริการ <span className="text-destructive">*</span>
                </Label>
                <ProvinceSelect
                  value={form.serviceProvince}
                  onChange={set('serviceProvince')}
                  placeholder="เลือกจังหวัด"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="plate">ทะเบียนรถ</Label>
                <Input
                  id="plate"
                  value={form.plateNumber}
                  onChange={(e) => set('plateNumber')(e.target.value)}
                  placeholder="เช่น 1กก 1234"
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
                <Label>ใบขับขี่</Label>
                <ImageUpload
                  folder="driver"
                  value={licenseTw2}
                  label={licenseTw2 ? 'เปลี่ยนรูปใบขับขี่' : 'อัปโหลดรูปใบขับขี่'}
                  onUploaded={setLicenseTw2}
                />
              </div>
            </>
          )}

          {/* ── Step 3: รูปรถ ── */}
          {step === 3 && (
            <>
              <p className="text-sm text-muted-foreground">
                ถ่ายรูปรถให้เห็นทั้ง 4 ด้าน และรูปป้ายทะเบียนให้ชัดเจน เพื่อใช้ยืนยันตัวรถ
              </p>
              {VEHICLE_PHOTOS.map((p) => (
                <div key={p.key} className="grid gap-2">
                  <Label>
                    {p.label} <span className="text-destructive">*</span>
                  </Label>
                  <ImageUpload
                    folder="driver"
                    value={vehiclePhotos[p.key]}
                    label={vehiclePhotos[p.key] ? `เปลี่ยน${p.label}` : `อัปโหลด${p.label}`}
                    onUploaded={(url) => setVehiclePhotos((v) => ({ ...v, [p.key]: url }))}
                  />
                </div>
              ))}
            </>
          )}

          {/* ── Step 4: คำถามคัดกรอง ── */}
          {step === 4 && (
            <>
              <p className="text-sm text-muted-foreground">
                ตอบคำถามต่อไปนี้เพื่อให้ทีมงานพิจารณาการรับสมัคร
              </p>
              {DRIVER_SCREENING_QUESTIONS.map((q) => (
                <div key={q.key} className="grid gap-2">
                  <Label>
                    {q.question} <span className="text-destructive">*</span>
                  </Label>
                  <div className="grid gap-2">
                    {q.options.map((o) => {
                      const selected = screening[q.key] === o.value;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => setScreening((s) => ({ ...s, [q.key]: o.value }))}
                          className={cn(
                            'flex items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm transition-colors',
                            selected
                              ? 'border-primary bg-primary/5 font-medium'
                              : 'border-input hover:bg-muted',
                          )}
                        >
                          {o.label}
                          {selected && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Navigation */}
          <div className="mt-2 flex gap-3">
            {step > 0 && (
              <Button
                variant="outline"
                className="flex-1"
                disabled={apply.isPending}
                onClick={() => {
                  setError(null);
                  setStep((s) => Math.max(s - 1, 0));
                }}
              >
                ย้อนกลับ
              </Button>
            )}
            <Button className="flex-1" disabled={!canAdvance || apply.isPending} onClick={next}>
              {isLastStep
                ? apply.isPending
                  ? 'กำลังส่งใบสมัคร…'
                  : 'ส่งใบสมัคร'
                : 'ถัดไป'}
            </Button>
          </div>
          {!canAdvance && (
            <p className="text-center text-xs text-muted-foreground">
              กรุณากรอกข้อมูลที่มีเครื่องหมาย <span className="text-destructive">*</span> ให้ครบก่อนไปต่อ
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
