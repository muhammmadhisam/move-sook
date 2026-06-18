'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, Gift, HandCoins, ReceiptText, ScrollText, Wrench } from 'lucide-react';
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
  Textarea,
} from '@movesook/ui';
import { DEFAULT_PROHIBITED_ITEMS, type SystemSettingsResponse } from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

type SS = SystemSettingsResponse;

// ── Shared data layer: one query for the whole system-settings blob, plus a
// partial-patch mutation. Every card reads the same cached query and saves only
// its own slice (the API merges per-key), so cards stay independent. ──────────
function useSystemSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'settings', 'system'],
    queryFn: async (): Promise<SS> => {
      const res = await api.admin.settings.system.$get();
      if (!res.ok) throw new Error('โหลดการตั้งค่าระบบไม่สำเร็จ');
      return (await res.json()) as SS;
    },
  });
  const mutation = useMutation({
    mutationFn: async (patch: Partial<SS>) => {
      const res = await api.admin.settings.system.$put({ json: patch });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return (await res.json()) as SS;
    },
    onSuccess: () => {
      toast.success('บันทึกการตั้งค่าแล้ว');
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'system'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return {
    data: query.data,
    save: (patch: Partial<SS>) => mutation.mutate(patch),
    saving: mutation.isPending,
  };
}

function pick<K extends keyof SS>(obj: SS, keys: readonly K[]): Pick<SS, K> {
  const out = {} as Pick<SS, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

/** A settings card bound to a fixed slice of keys: handles seed-once + dirty + save. */
function useSlice<K extends keyof SS>(keys: readonly K[]) {
  const { data, save, saving } = useSystemSettings();
  const [form, setForm] = useState<Pick<SS, K> | null>(null);
  useEffect(() => {
    // Seed once so saving another card (which invalidates the query) never wipes
    // unsaved edits here. Dirty is still computed against the latest server data.
    if (data && !form) setForm(pick(data, keys));
  }, [data, form, keys]);
  const dirty = !!form && !!data && keys.some((k) => form[k] !== data[k]);
  return { form, setForm, dirty, save, saving };
}

// ── Presentational field helpers (non-generic, value/onChange) ────────────────
function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
  min = 0,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
  min?: number;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SaveButton({ onClick, saving, dirty }: { onClick: () => void; saving: boolean; dirty: boolean }) {
  return (
    <Button onClick={onClick} disabled={saving || !dirty}>
      {saving ? 'กำลังบันทึก…' : 'บันทึก'}
    </Button>
  );
}

function SettingsCard({
  icon,
  title,
  description,
  badge,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {title}
          {badge && <span className="ml-auto">{badge}</span>}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

// ── Pricing tab: price limits & fees ──────────────────────────────────────────
const LIMIT_KEYS = [
  'minJobPrice',
  'maxJobPrice',
  'cancellationFee',
  'addressChangeFee',
  'freeCancelMinutes',
  'pendingPaymentExpireDays',
] as const;

export function PriceLimitsCard() {
  const { form, setForm, dirty, save, saving } = useSlice(LIMIT_KEYS);
  if (!form) return null;
  return (
    <SettingsCard
      icon={<ReceiptText className="h-4 w-4" />}
      title="ขีดจำกัดราคา & ค่าธรรมเนียม"
      description="เพดาน/พื้นราคางาน ค่าธรรมเนียมยกเลิก–เปลี่ยนที่อยู่ และเวลาผ่อนผัน"
    >
      <div className={GRID}>
        <NumberField id="minJobPrice" label="ราคาต่ำสุด (บาท)" value={form.minJobPrice} onChange={(v) => setForm({ ...form, minJobPrice: v })} />
        <NumberField id="maxJobPrice" label="ราคาสูงสุด (บาท, 0=ไม่จำกัด)" value={form.maxJobPrice} onChange={(v) => setForm({ ...form, maxJobPrice: v })} />
        <NumberField id="cancellationFee" label="ค่าธรรมเนียมยกเลิก (บาท)" value={form.cancellationFee} onChange={(v) => setForm({ ...form, cancellationFee: v })} />
        <NumberField id="addressChangeFee" label="ค่าเปลี่ยนที่อยู่ (บาท, +ตามระยะ)" value={form.addressChangeFee} onChange={(v) => setForm({ ...form, addressChangeFee: v })} />
        <NumberField id="freeCancelMinutes" label="ยกเลิกฟรีภายใน (นาที)" value={form.freeCancelMinutes} onChange={(v) => setForm({ ...form, freeCancelMinutes: v })} />
        <NumberField id="pendingPaymentExpireDays" label="ยกเลิกงานไม่จ่ายเงินใน (วัน, 0=ไม่ยกเลิก)" value={form.pendingPaymentExpireDays} onChange={(v) => setForm({ ...form, pendingPaymentExpireDays: v })} />
      </div>
      <SaveButton onClick={() => save(form)} saving={saving} dirty={dirty} />
    </SettingsCard>
  );
}

// ── Pricing tab: COD ──────────────────────────────────────────────────────────
const COD_KEYS = ['codEnabled', 'codMinPrice', 'codMaxPrice'] as const;

export function CodCard() {
  const { form, setForm, dirty, save, saving } = useSlice(COD_KEYS);
  if (!form) return null;
  return (
    <SettingsCard
      icon={<HandCoins className="h-4 w-4" />}
      title="เก็บเงินปลายทาง (COD)"
      badge={<Badge variant={form.codEnabled ? 'success' : 'secondary'}>{form.codEnabled ? 'เปิด' : 'ปิด'}</Badge>}
      description="ให้ลูกค้าเลือกจ่ายปลายทาง — คนขับโอนค่าธรรมเนียม (ค่าคอม) ให้แพลตฟอร์มและรอแอดมินอนุมัติก่อนเริ่มงาน แล้วเก็บเงินสดเต็มจำนวนที่ปลายทาง"
    >
      <label className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <Checkbox checked={form.codEnabled} onCheckedChange={(v) => setForm({ ...form, codEnabled: v === true })} />
        <span>เปิดให้ลูกค้าเลือกเก็บเงินปลายทาง (COD)</span>
      </label>
      <div className={GRID}>
        <NumberField id="codMinPrice" label="ราคาขั้นต่ำที่ใช้ COD ได้ (บาท, 0=ไม่จำกัด)" value={form.codMinPrice} onChange={(v) => setForm({ ...form, codMinPrice: v })} />
        <NumberField id="codMaxPrice" label="ราคาสูงสุดที่ใช้ COD ได้ (บาท, 0=ไม่จำกัด)" value={form.codMaxPrice} onChange={(v) => setForm({ ...form, codMaxPrice: v })} />
      </div>
      <SaveButton onClick={() => save(form)} saving={saving} dirty={dirty} />
    </SettingsCard>
  );
}

// ── Drivers tab: driver SLA & rewards ─────────────────────────────────────────
const DRIVER_KEYS = ['verifySlaHours', 'idleNudgeDays', 'referralRewardThb', 'driverWeeklyGoal'] as const;

export function DriverRewardsCard() {
  const { form, setForm, dirty, save, saving } = useSlice(DRIVER_KEYS);
  if (!form) return null;
  return (
    <SettingsCard
      icon={<Gift className="h-4 w-4" />}
      title="คนขับ & รางวัล"
      description="SLA ตรวจคนขับ, การ nudge คนขับเงียบ, รางวัลแนะนำเพื่อน และเป้างานรายสัปดาห์"
    >
      <div className={GRID}>
        <NumberField id="verifySlaHours" label="SLA ตรวจคนขับ (ชม.)" min={1} value={form.verifySlaHours} onChange={(v) => setForm({ ...form, verifySlaHours: v })} />
        <NumberField id="idleNudgeDays" label="นับวันก่อน nudge คนขับเงียบ" min={1} value={form.idleNudgeDays} onChange={(v) => setForm({ ...form, idleNudgeDays: v })} />
        <NumberField id="referralRewardThb" label="รางวัลแนะนำเพื่อน (บาท)" value={form.referralRewardThb} onChange={(v) => setForm({ ...form, referralRewardThb: v })} />
        <NumberField id="driverWeeklyGoal" label="เป้างาน/สัปดาห์ของคนขับ" min={1} value={form.driverWeeklyGoal} onChange={(v) => setForm({ ...form, driverWeeklyGoal: v })} />
      </div>
      <SaveButton onClick={() => save(form)} saving={saving} dirty={dirty} />
    </SettingsCard>
  );
}

// ── Rules tab: usage limits + policy versions + prohibited items ──────────────
const RULES_KEYS = [
  'maxActiveJobsPerDriver',
  'maxScheduleDays',
  'minDistanceKm',
  'maxDistanceKm',
  'termsVersion',
  'privacyVersion',
  'prohibitedItemsList',
] as const;

export function RulesCard() {
  const { form, setForm, dirty, save, saving } = useSlice(RULES_KEYS);
  if (!form) return null;
  return (
    <SettingsCard
      icon={<ScrollText className="h-4 w-4" />}
      title="กฎการใช้งาน & นโยบาย"
      description="ขีดจำกัดงาน/ระยะทาง, เวอร์ชันข้อตกลง–ความเป็นส่วนตัว และรายการของต้องห้าม"
    >
      <div className={GRID}>
        <NumberField id="maxActiveJobsPerDriver" label="งานพร้อมกันสูงสุด/คนขับ (0=ไม่จำกัด)" value={form.maxActiveJobsPerDriver} onChange={(v) => setForm({ ...form, maxActiveJobsPerDriver: v })} />
        <NumberField id="maxScheduleDays" label="จองล่วงหน้าได้กี่วัน" value={form.maxScheduleDays} onChange={(v) => setForm({ ...form, maxScheduleDays: v })} />
        <NumberField id="minDistanceKm" label="ระยะขั้นต่ำ (กม., 0=ไม่จำกัด)" value={form.minDistanceKm} onChange={(v) => setForm({ ...form, minDistanceKm: v })} />
        <NumberField id="maxDistanceKm" label="ระยะสูงสุด (กม., 0=ไม่จำกัด)" value={form.maxDistanceKm} onChange={(v) => setForm({ ...form, maxDistanceKm: v })} />
        <TextField id="termsVersion" label="เวอร์ชันข้อตกลง" value={form.termsVersion} onChange={(v) => setForm({ ...form, termsVersion: v })} />
        <TextField id="privacyVersion" label="เวอร์ชันนโยบายความเป็นส่วนตัว" value={form.privacyVersion} onChange={(v) => setForm({ ...form, privacyVersion: v })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="prohibitedItemsList">รายการของต้องห้าม (1 รายการต่อบรรทัด)</Label>
        <Textarea
          id="prohibitedItemsList"
          rows={7}
          placeholder={DEFAULT_PROHIBITED_ITEMS.join('\n')}
          value={form.prohibitedItemsList}
          onChange={(e) => setForm({ ...form, prohibitedItemsList: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">แสดงให้ลูกค้าเห็นตอนโพสต์งาน · เว้นว่างไว้เพื่อใช้รายการมาตรฐาน</p>
      </div>
      <SaveButton onClick={() => save(form)} saving={saving} dirty={dirty} />
    </SettingsCard>
  );
}

// ── Billing tab: receiving account + company info (PDF docs) ───────────────────
const BILLING_KEYS = [
  'payBankName',
  'payAccountName',
  'payAccountNumber',
  'payQrUrl',
  'companyName',
  'companyTaxId',
  'companyAddress',
  'companyLogoUrl',
] as const;

export function BillingCompanyCard() {
  const { form, setForm, dirty, save, saving } = useSlice(BILLING_KEYS);
  if (!form) return null;
  return (
    <SettingsCard
      icon={<Banknote className="h-4 w-4" />}
      title="บัญชีรับเงิน & ข้อมูลบริษัท"
      description="บัญชีที่แสดงบนหน้าจ่ายเงินลูกค้า และข้อมูลบริษัทที่ใช้บนหัวเอกสาร/ใบเสร็จ PDF"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">บัญชีรับเงิน</p>
      <div className={GRID}>
        <TextField id="payBankName" label="ธนาคาร" value={form.payBankName} onChange={(v) => setForm({ ...form, payBankName: v })} />
        <TextField id="payAccountName" label="ชื่อบัญชี" value={form.payAccountName} onChange={(v) => setForm({ ...form, payAccountName: v })} />
        <TextField id="payAccountNumber" label="เลขที่บัญชี" value={form.payAccountNumber} onChange={(v) => setForm({ ...form, payAccountNumber: v })} />
      </div>
      <div className="space-y-1">
        <Label>QR Code รับเงิน (พร้อมเพย์ / ธนาคาร)</Label>
        <ImageUpload
          folder="settings"
          value={form.payQrUrl || null}
          label={form.payQrUrl ? 'เปลี่ยน QR' : 'อัปโหลด QR'}
          onUploaded={(url) => setForm({ ...form, payQrUrl: url })}
        />
        {form.payQrUrl && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setForm({ ...form, payQrUrl: '' })}>
            ลบ QR
          </Button>
        )}
      </div>

      <p className="border-t pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ข้อมูลบริษัท (หัวเอกสาร PDF)</p>
      <div className={GRID}>
        <TextField id="companyName" label="ชื่อบริษัท" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} />
        <TextField id="companyTaxId" label="เลขผู้เสียภาษี" value={form.companyTaxId} onChange={(v) => setForm({ ...form, companyTaxId: v })} />
      </div>
      <TextField id="companyAddress" label="ที่อยู่บริษัท" value={form.companyAddress} onChange={(v) => setForm({ ...form, companyAddress: v })} />
      <div className="space-y-1">
        <Label>โลโก้ (แสดงบนเอกสาร PDF)</Label>
        <ImageUpload
          folder="settings"
          value={form.companyLogoUrl || null}
          label={form.companyLogoUrl ? 'เปลี่ยนโลโก้' : 'อัปโหลดโลโก้'}
          onUploaded={(url) => setForm({ ...form, companyLogoUrl: url })}
        />
        {form.companyLogoUrl && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setForm({ ...form, companyLogoUrl: '' })}>
            ลบโลโก้
          </Button>
        )}
      </div>
      <SaveButton onClick={() => save(form)} saving={saving} dirty={dirty} />
    </SettingsCard>
  );
}

// ── System tab: maintenance + support contact + ops LINE alerts ───────────────
const SYSTEM_KEYS = [
  'maintenanceMode',
  'maintenanceMessage',
  'supportPhone',
  'supportLineId',
  'supportEmail',
  'adminLineGroupId',
] as const;

export function MaintenanceContactCard() {
  const { form, setForm, dirty, save, saving } = useSlice(SYSTEM_KEYS);
  if (!form) return null;
  return (
    <SettingsCard
      icon={<Wrench className="h-4 w-4" />}
      title="ระบบ & ช่องทางติดต่อ"
      badge={form.maintenanceMode ? <Badge variant="secondary">ปิดปรับปรุง</Badge> : undefined}
      description="โหมดปิดปรับปรุง, ช่องทางติดต่อซัพพอร์ตที่แสดงให้ผู้ใช้ และกลุ่ม LINE แจ้งเตือนทีมงาน"
    >
      <label className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <Checkbox checked={form.maintenanceMode} onCheckedChange={(v) => setForm({ ...form, maintenanceMode: v === true })} />
        <span>โหมดปิดปรับปรุง (maintenance mode)</span>
      </label>
      <TextField id="maintenanceMessage" label="ข้อความตอนปิดปรับปรุง" value={form.maintenanceMessage} onChange={(v) => setForm({ ...form, maintenanceMessage: v })} />

      <p className="border-t pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">ติดต่อซัพพอร์ต</p>
      <div className={GRID}>
        <TextField id="supportPhone" label="เบอร์โทรซัพพอร์ต" value={form.supportPhone} onChange={(v) => setForm({ ...form, supportPhone: v })} />
        <TextField id="supportLineId" label="LINE OA / LINE ID" value={form.supportLineId} onChange={(v) => setForm({ ...form, supportLineId: v })} />
        <TextField id="supportEmail" label="อีเมล" value={form.supportEmail} onChange={(v) => setForm({ ...form, supportEmail: v })} />
      </div>

      <p className="border-t pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">แจ้งเตือนทีมงานผ่าน LINE</p>
      <TextField
        id="adminLineGroupId"
        label="LINE Group ID สำหรับแจ้งเตือนแอดมิน"
        value={form.adminLineGroupId}
        onChange={(v) => setForm({ ...form, adminLineGroupId: v })}
        hint="เพิ่ม LINE OA bot เข้ากลุ่มทีมงาน แล้ววาง Group ID ที่นี่ — ระบบจะส่งข้อความเข้ากลุ่มทันทีเมื่อลูกค้าอัปโหลดสลิป · เว้นว่าง = ปิด"
      />
      <SaveButton onClick={() => save(form)} saving={saving} dirty={dirty} />
    </SettingsCard>
  );
}
