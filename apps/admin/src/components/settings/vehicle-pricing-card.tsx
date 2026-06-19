'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PreviewableImage,
  useConfirm,
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
  pricePerKm: '',
  pricePerKmShared: '',
  flatRate: '',
  perItemRate: '',
  maxActiveJobs: '',
  isActive: true,
};

export function VehiclePricingCard() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  // editing holds the slug being edited; `isNew` flips the dialog into create mode
  // where the slug is typed instead of fixed.
  const [editing, setEditing] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [slug, setSlug] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const config = useQuery({
    queryKey: ['admin', 'vehicle-pricing'],
    queryFn: async (): Promise<{ items: VehiclePricingDto[] }> => {
      const res = await api.admin['vehicle-pricing'].$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as { items: VehiclePricingDto[] };
    },
  });

  const items = config.data?.items ?? [];

  // In create mode the slug must be valid and not collide with an existing type.
  const slugError = isNew
    ? !VehicleTypeSlugSchema.safeParse(slug).success
      ? 'รหัสต้องขึ้นต้นด้วย A-Z และมีได้เฉพาะ A-Z, 0-9, _'
      : items.some((c) => c.vehicleType === slug)
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
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'vehicle-pricing'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (vt: string) => {
      const res = await api.admin['vehicle-pricing'][':vehicleType'].$delete({ param: { vehicleType: vt } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || 'ลบไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'vehicle-pricing'] });
    },
  });

  const openEdit = (c: VehiclePricingDto) => {
    setIsNew(false);
    setSlug(c.vehicleType);
    setDraft({
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
    setEditing(c.vehicleType);
  };

  const openNew = () => {
    setIsNew(true);
    setSlug('');
    setDraft(EMPTY_DRAFT);
    setEditing('');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>ประเภทรถที่รับเข้าร่วม</CardTitle>
            <CardDescription>
              กำหนดลักษณะ/สเปก, น้ำหนักบรรทุก, เรตราคา และเปิด/ปิดรับแต่ละประเภท — เพิ่มประเภทใหม่ได้เรื่อยๆ
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNew} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />
            เพิ่มประเภทรถ
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            ยังไม่มีประเภทรถ — กด “เพิ่มประเภทรถ” เพื่อเริ่ม
          </p>
        )}
        {items.map((c) => {
          const active = c.isActive;
          return (
            <div key={c.vehicleType} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="flex items-start gap-3 text-sm">
                {c.imageUrl ? (
                  <PreviewableImage
                    src={c.imageUrl}
                    alt={vehicleTypeLabel(c.vehicleType, c.label)}
                    className="h-14 w-14 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                    ไม่มีรูป
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{vehicleTypeLabel(c.vehicleType, c.label)}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {c.vehicleType}
                    </Badge>
                    <Badge variant={active ? 'success' : 'secondary'}>{active ? 'เปิดรับ' : 'ปิดรับ'}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.requirements || 'ยังไม่ได้กำหนดลักษณะรถ'}
                    {c.maxWeightKg ? ` · ≤ ${c.maxWeightKg.toLocaleString()} กก.` : ''}
                    {c.pricePerKm != null ? ` · ฿${c.pricePerKm}/กม.` : ' · ใช้เรตกลาง'}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                  ตั้งค่า
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={remove.isPending}
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'ลบประเภทรถ',
                      description: `ลบประเภทรถ "${vehicleTypeLabel(c.vehicleType, c.label)}" ?`,
                      confirmText: 'ลบ',
                      destructive: true,
                    });
                    if (ok) remove.mutate(c.vehicleType);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
        {remove.isError && <p className="text-sm text-destructive">{(remove.error as Error).message}</p>}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isNew ? 'เพิ่มประเภทรถ' : `ตั้งค่าประเภทรถ — ${vehicleTypeLabel(editing ?? '', draft.label)}`}
            </DialogTitle>
            <DialogDescription>กำหนดลักษณะรถที่รับ และเปิด/ปิดการเข้าร่วม</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {isNew && (
              <div className="space-y-1">
                <Label htmlFor="vslug">รหัสประเภทรถ (slug)</Label>
                <Input
                  id="vslug"
                  placeholder="เช่น VAN, TRUCK_10W"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={save.isPending}>
              ยกเลิก
            </Button>
            <Button
              onClick={() => {
                const vt = isNew ? slug : editing;
                if (vt) save.mutate(vt);
              }}
              disabled={save.isPending || (isNew && (slugError !== null || slug.length === 0))}
            >
              {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
