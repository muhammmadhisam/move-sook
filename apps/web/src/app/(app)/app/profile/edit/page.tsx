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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@movesook/ui';
import {
  GENDER_LABEL,
  GenderSchema,
  UpdateCustomerProfileInput,
  type CustomerProfileDto,
  type Gender,
} from '@movesook/shared';
import { api } from '@/lib/api';

// Self-serve customer profile editor. Every field is optional — nothing here is
// required to use the app; it just lets customers keep their details on file.
export default function ProfileEditPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    gender: '' as Gender | '',
    birthDate: '',
    email: '',
    phone: '',
    address: '',
  });

  const profile = useQuery({
    queryKey: ['customer-profile'],
    queryFn: async (): Promise<CustomerProfileDto> => {
      const res = await api.me.profile.$get();
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      return (await res.json()) as CustomerProfileDto;
    },
  });

  // Seed the form once the profile loads.
  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setForm({
      firstName: p.firstName ?? '',
      lastName: p.lastName ?? '',
      gender: p.gender ?? '',
      birthDate: p.birthDate ?? '',
      email: p.email ?? '',
      phone: p.phone ?? '',
      address: p.address ?? '',
    });
  }, [profile.data]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      // Empty string → null so the customer can clear a previously-saved value.
      const parsed = UpdateCustomerProfileInput.safeParse({
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        gender: form.gender || null,
        birthDate: form.birthDate || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');
      const res = await api.me.profile.$patch({ json: parsed.data });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'บันทึกไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('บันทึกข้อมูลแล้ว');
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
      router.push('/app/profile');
    },
    onError: (e: Error) => setError(e.message),
  });

  if (profile.isLoading) {
    return <div className="mx-auto max-w-md p-4 text-sm text-muted-foreground">กำลังโหลด…</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">ข้อมูลส่วนตัว</CardTitle>
          <p className="text-sm text-muted-foreground">
            กรอกเฉพาะข้อมูลที่ต้องการ — ทุกช่องไม่บังคับ
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">ชื่อ</Label>
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(e) => set('firstName')(e.target.value)}
                placeholder="ชื่อจริง"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">นามสกุล</Label>
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(e) => set('lastName')(e.target.value)}
                placeholder="นามสกุล"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="birthDate">วันเกิด</Label>
            <Input
              id="birthDate"
              type="date"
              value={form.birthDate}
              onChange={(e) => set('birthDate')(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">เบอร์โทร</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => set('phone')(e.target.value)}
              placeholder="08xxxxxxxx"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">อีเมล</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="address">ที่อยู่</Label>
            <Textarea
              id="address"
              value={form.address}
              onChange={(e) => set('address')(e.target.value)}
              placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
              rows={3}
            />
          </div>

          {/* เพศ — moved to the bottom of the personal-info block for a
              consistent narrow Mini App layout across the driver/profile forms. */}
          <div className="space-y-1.5">
            <Label>เพศ</Label>
            <Select
              value={form.gender || undefined}
              onValueChange={(v) => set('gender')(v)}
            >
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => router.push('/app/profile')}
              disabled={save.isPending}
            >
              ยกเลิก
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setError(null);
                save.mutate();
              }}
              disabled={save.isPending}
            >
              {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
