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
  CardDescription,
  Input,
  Label,
} from '@movesook/ui';
import { VehicleTypeSlugSchema, vehicleTypeLabel, type VehiclePricingDto } from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

type Draft = {
  label: string;
  description: string;
  imageUrl: string | null;
  requirements: string;
  maxWeightKg: string;
  pricePerKm: string;
  pricePerKmShared: string;
  flatRate: string;
  perItemRate: string;
  maxActiveJobs: string;
  isActive: boolean;
};

const EMPTY_DRAFT: Draft = {
  label: '',
  description: '',
  imageUrl: null,
  requirements: '',
  maxWeightKg: '',
  pricePerKmShared: '',
  pricePerKm: '',
  flatRate: '',
  perItemRate: '',
  maxActiveJobs: '',
  isActive: true,
};

const toDraft = (c: VehiclePricingDto): Draft => ({
  label: c.label ?? '',
  description: c.description ?? '',
  imageUrl: c.imageUrl ?? null,
  requirements: c.requirements ?? '',
  maxWeightKg: c.maxWeightKg != null ? String(c.maxWeightKg) : '',
  pricePerKm: c.pricePerKm != null ? String(c.pricePerKm) : '',
  pricePerKmShared: c.pricePerKmShared != null ? String(c.pricePerKmShared) : '',
  flatRate: c.flatRate != null ? String(c.flatRate) : '',
  perItemRate: c.perItemRate != null ? String(c.perItemRate) : '',
  maxActiveJobs: c.maxActiveJobs != null ? String(c.maxActiveJobs) : '',
  isActive: c.isActive,
});

const BACK_HREF = '/settings?tab=vehicles';

/**
 * Full-page editor for one vehicle type — used by both the "new" and "[slug]"
 * routes (replaces the former modal). `slug` undefined → create mode (the slug
 * is typed); a slug → edit the existing type loaded from the shared list query.
 */
export function VehiclePricingForm({ slug }: { slug?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNew = !slug;

  const config = useQuery({
    queryKey: ['admin', 'vehicle-pricing'],
    queryFn: async (): Promise<{ items: VehiclePricingDto[] }> => {
      const res = await api.admin['vehicle-pricing'].$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as { items: VehiclePricingDto[] };
    },
  });
  const items = config.data?.items ?? [];
  const existing = slug ? items.find((c) => c.vehicleType === slug) : undefined;

  const [newSlug, setNewSlug] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);

  // Populate the edit form once the list resolves (only once, so user edits stick).
  useEffect(() => {
    if (!isNew && existing && !hydrated) {
      setDraft(toDraft(existing));
      setHydrated(true);
    }
  }, [isNew, existing, hydrated]);

  const slugError = isNew
    ? !VehicleTypeSlugSchema.safeParse(newSlug).success
      ? 'รหัสต้องขึ้นต้นด้วย A-Z และมีได้เฉพาะ A-Z, 0-9, _'
      : items.some((c) => c.vehicleType === newSlug)
        ? 'มีประเภทรถรหัสนี้อยู่แล้ว'
        : null
    : null;

  const save = useMutation({
    mutationFn: async (vt: string) => {
      const res = await api.admin['vehicle-pricing'].$put({
        json: {
          vehicleType: vt,
          label: draft.label.trim() || null,
          description: draft.description.trim() || null,
          imageUrl: draft.imageUrl,
          requirements: draft.requirements.trim() || null,
          maxWeightKg: draft.maxWeightKg.trim() ? Number(draft.maxWeightKg) : null,
          pricePerKm: draft.pricePerKm.trim() ? Number(draft.pricePerKm) : null,
          pricePerKmShared: draft.pricePerKmShared.trim() ? Number(draft.pricePerKmShared) : null,
          flatRate: draft.flatRate.trim() ? Number(draft.flatRate) : null,
          perItemRate: draft.perItemRate.trim() ? Number(draft.perItemRate) : null,
          maxActiveJobs: draft.maxActiveJobs.trim() ? Number(draft.maxActiveJobs) : null,
          isActive: draft.isActive,
        },
      });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'vehicle-pricing'] });
      toast.success('บันทึกประเภทรถแล้ว');
      router.push(BACK_HREF);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Edit mode but the list loaded and the slug isn't there (bad URL / deleted).
  if (!isNew && config.isSuccess && !existing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ไม่พบประเภทรถ</CardTitle>
          <CardDescription>ประเภทรถ “{slug}” อาจถูกลบไปแล้ว</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.push(BACK_HREF)}>
            กลับไปหน้าประเภทรถ
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isNew ? 'เพิ่มประเภทรถ' : `ตั้งค่าประเภทรถ — ${vehicleTypeLabel(slug ?? '', draft.label)}`}
        </CardTitle>
        <CardDescription>กำหนดลักษณะรถที่รับ และเปิด/ปิดการเข้าร่วม</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isNew && (
          <div className="space-y-1">
            <Label htmlFor="vslug">รหัสประเภทรถ (slug)</Label>
            <Input
              id="vslug"
              placeholder="เช่น VAN, TRUCK_10W"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
            />
            {slugError ? (
              <p className="text-xs text-destructive">{slugError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">ตัวพิมพ์ใหญ่ A-Z, 0-9, _ เท่านั้น · ตั้งแล้วเปลี่ยนไม่ได้</p>
            )}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
          />
          เปิดรับประเภทรถนี้ (ถ้าปิด คนขับสมัคร/สร้างงานด้วยรถประเภทนี้ไม่ได้)
        </label>
        <div className="space-y-1">
          <Label htmlFor="vlabel">ชื่อที่แสดง</Label>
          <Input id="vlabel" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>รูปตัวอย่างรถ (โชว์ให้ลูกค้าเห็น)</Label>
          <ImageUpload
            folder="vehicle"
            value={draft.imageUrl}
            onUploaded={(url) => setDraft({ ...draft, imageUrl: url })}
            label={draft.imageUrl ? 'เปลี่ยนรูป' : 'อัปโหลดรูปรถ'}
          />
          {draft.imageUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDraft({ ...draft, imageUrl: null })}
            >
              ลบรูป
            </Button>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor="vreq">ลักษณะ/สเปกรถที่รับ</Label>
          <Input
            id="vreq"
            placeholder="เช่น กระบะตอนเดียว ปี 2010 ขึ้นไป สภาพดี"
            value={draft.requirements}
            onChange={(e) => setDraft({ ...draft, requirements: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="vmax">น้ำหนักบรรทุกสูงสุด (กก.)</Label>
            <Input
              id="vmax"
              type="number"
              min={0}
              value={draft.maxWeightKg}
              onChange={(e) => setDraft({ ...draft, maxWeightKg: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vprice">ราคา/กม. เหมาลำ (เว้นว่าง = เรตกลาง)</Label>
            <Input
              id="vprice"
              type="number"
              min={0}
              value={draft.pricePerKm}
              onChange={(e) => setDraft({ ...draft, pricePerKm: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="vpriceshared">ราคา/กม. ไม่เหมาลำ (เว้นว่าง = เรตกลาง)</Label>
            <Input
              id="vpriceshared"
              type="number"
              min={0}
              value={draft.pricePerKmShared}
              onChange={(e) => setDraft({ ...draft, pricePerKmShared: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="vflat">ค่าเหมาลำ (เว้นว่าง = เรตกลาง)</Label>
            <Input
              id="vflat"
              type="number"
              min={0}
              value={draft.flatRate}
              onChange={(e) => setDraft({ ...draft, flatRate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vitem">ค่าต่อชิ้น (เว้นว่าง = เรตกลาง)</Label>
            <Input
              id="vitem"
              type="number"
              min={0}
              value={draft.perItemRate}
              onChange={(e) => setDraft({ ...draft, perItemRate: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          เหมาลำ = ค่าเหมา + (ระยะ×เรต/กม.เหมาลำ) · ไม่เหมาลำ = (จำนวน×ค่าต่อชิ้น) + (ระยะ×เรต/กม.ไม่เหมาลำ) — เรตไม่เหมาลำควรถูกกว่า
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="vmaxjobs">รับงานพร้อมกันได้สูงสุด (งาน)</Label>
            <Input
              id="vmaxjobs"
              type="number"
              min={1}
              placeholder="เว้นว่าง = ใช้ค่ากลาง"
              value={draft.maxActiveJobs}
              onChange={(e) => setDraft({ ...draft, maxActiveJobs: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              จำนวนงานที่คนขับรถประเภทนี้ถือพร้อมกันได้ · เว้นว่าง = ใช้ค่ากลาง (ปกติ 3)
            </p>
          </div>
        </div>
        {save.isError && <p className="text-sm text-destructive">{(save.error as Error).message}</p>}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => {
              const vt = isNew ? newSlug : slug;
              if (vt) save.mutate(vt);
            }}
            disabled={save.isPending || (isNew && (slugError !== null || newSlug.length === 0))}
          >
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
          <Button variant="outline" onClick={() => router.push(BACK_HREF)} disabled={save.isPending}>
            ยกเลิก
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
