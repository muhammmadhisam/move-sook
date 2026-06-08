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
  Input,
  Label,
} from '@movesook/ui';
import { toast } from 'sonner';
import type { SystemSettingsResponse } from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

export function SystemSettingsCard() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SystemSettingsResponse | null>(null);

  const settings = useQuery({
    queryKey: ['admin', 'settings', 'system'],
    queryFn: async (): Promise<SystemSettingsResponse> => {
      const res = await api.admin.settings.system.$get();
      if (!res.ok) throw new Error('โหลดการตั้งค่าระบบไม่สำเร็จ');
      return (await res.json()) as SystemSettingsResponse;
    },
  });

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (body: SystemSettingsResponse) => {
      const res = await api.admin.settings.system.$put({ json: body });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as SystemSettingsResponse;
    },
    onSuccess: () => {
      toast.success('บันทึกการตั้งค่าระบบแล้ว');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'system'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!form) return null;

  const numField = (key: keyof SystemSettingsResponse, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        type="number"
        min={0}
        value={String(form[key] as number)}
        onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
      />
    </div>
  );

  const strField = (key: keyof SystemSettingsResponse, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={String(form[key] as string)}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  const Section = ({ title }: { title: string }) => (
    <p className="border-t pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </p>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>ตั้งค่าระบบ</CardTitle>
        <CardDescription>
          โหมดปิดปรับปรุง, ราคา/ค่าธรรมเนียม, กฎการใช้งาน, คนขับ/รางวัล, ติดต่อ และเวอร์ชันนโยบาย
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.maintenanceMode}
            onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
          />
          โหมดปิดปรับปรุง (maintenance mode)
        </label>
        {strField('maintenanceMessage', 'ข้อความตอนปิดปรับปรุง')}

        <Section title="ราคา & ค่าธรรมเนียม" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {numField('minJobPrice', 'ราคาต่ำสุด (บาท)')}
          {numField('maxJobPrice', 'ราคาสูงสุด (บาท, 0=ไม่จำกัด)')}
          {numField('cancellationFee', 'ค่าธรรมเนียมยกเลิก (บาท)')}
          {numField('freeCancelMinutes', 'ยกเลิกฟรีภายใน (นาที)')}
        </div>

        <Section title="กฎการใช้งาน" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {numField('maxActiveJobsPerDriver', 'งานพร้อมกันสูงสุด/คนขับ (0=ไม่จำกัด)')}
          {numField('maxScheduleDays', 'จองล่วงหน้าได้กี่วัน')}
          {numField('minDistanceKm', 'ระยะขั้นต่ำ (กม., 0=ไม่จำกัด)')}
          {numField('maxDistanceKm', 'ระยะสูงสุด (กม., 0=ไม่จำกัด)')}
        </div>

        <Section title="คนขับ & รางวัล" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {numField('verifySlaHours', 'SLA ตรวจคนขับ (ชม.)')}
          {numField('idleNudgeDays', 'นับวันก่อน nudge คนขับเงียบ')}
          {numField('referralRewardThb', 'รางวัลแนะนำเพื่อน (บาท)')}
          {numField('driverWeeklyGoal', 'เป้างาน/สัปดาห์ของคนขับ')}
        </div>

        <Section title="ติดต่อซัพพอร์ต" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {strField('supportPhone', 'เบอร์โทรซัพพอร์ต')}
          {strField('supportLineId', 'LINE OA / LINE ID')}
          {strField('supportEmail', 'อีเมล')}
        </div>

        <Section title="บัญชีรับเงิน (แสดงหน้าจ่ายเงินลูกค้า)" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {strField('payBankName', 'ธนาคาร')}
          {strField('payAccountName', 'ชื่อบัญชี')}
          {strField('payAccountNumber', 'เลขที่บัญชี')}
        </div>
        <div className="space-y-1">
          <Label>QR Code รับเงิน (พร้อมเพย์ / ธนาคาร)</Label>
          <ImageUpload
            value={form.payQrUrl || null}
            label={form.payQrUrl ? 'เปลี่ยน QR' : 'อัปโหลด QR'}
            onUploaded={(url) => setForm({ ...form, payQrUrl: url })}
          />
          {form.payQrUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setForm({ ...form, payQrUrl: '' })}
            >
              ลบ QR
            </Button>
          )}
        </div>

        <Section title="นโยบาย" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {strField('termsVersion', 'เวอร์ชันข้อตกลง')}
          {strField('privacyVersion', 'เวอร์ชันนโยบายความเป็นส่วนตัว')}
        </div>

        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
      </CardContent>
    </Card>
  );
}
