'use client';

import { useEffect, useState } from 'react';
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
} from '@movesook/ui';
import {
  DriverUpdateInput,
  VehicleTypeSchema,
  VEHICLE_TYPE_LABEL,
  type DriverDto,
  type VehicleType,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

export default function DriverEditPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicleType: 'PICKUP' as VehicleType,
    plateNumber: '',
    serviceProvince: '',
    phone: '',
    bankName: '',
    bankAccountName: '',
    bankAccountNo: '',
  });
  const [licenseTw2, setLicenseTw2] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ['driver-me'],
    queryFn: async (): Promise<DriverDto> => {
      const res = await api.drivers.me.$get();
      if (!res.ok) throw new Error('โหลดข้อมูลคนขับไม่สำเร็จ');
      return (await res.json()) as DriverDto;
    },
  });

  // Seed the form once the driver record loads.
  useEffect(() => {
    const d = me.data;
    if (!d) return;
    setForm({
      vehicleType: d.vehicleType,
      plateNumber: d.plateNumber ?? '',
      serviceProvince: d.serviceProvince ?? '',
      phone: d.phone ?? '',
      bankName: d.bankName ?? '',
      bankAccountName: d.bankAccountName ?? '',
      bankAccountNo: d.bankAccountNo ?? '',
    });
    setLicenseTw2(d.licenseTw2 ?? null);
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
        licenseTw2: licenseTw2 || undefined,
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
      router.push('/profile');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (me.isLoading) {
    return <div className="mx-auto max-w-md p-6 text-sm text-muted-foreground">กำลังโหลด…</div>;
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลคนขับ</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>ประเภทรถ</Label>
            <Select value={form.vehicleType} onValueChange={(v) => set('vehicleType')(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VehicleTypeSchema.options.map((v) => (
                  <SelectItem key={v} value={v}>
                    {VEHICLE_TYPE_LABEL[v]}
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

          <div className="grid gap-2">
            <Label>จังหวัดที่ให้บริการ</Label>
            <ProvinceSelect
              value={form.serviceProvince}
              onChange={set('serviceProvince')}
              placeholder="เลือกจังหวัด"
            />
          </div>

          <div className="grid gap-2">
            <Label>ใบขับขี่ ท.2</Label>
            <ImageUpload
              value={licenseTw2}
              label={licenseTw2 ? 'เปลี่ยนรูปใบขับขี่' : 'อัปโหลดรูปใบขับขี่'}
              onUploaded={setLicenseTw2}
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
