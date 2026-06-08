'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
} from '@movesook/ui';
import { VehicleTypeSchema, type VehiclePricingDto, type VehicleType } from '@movesook/shared';
import { api } from '@/lib/api';
import { ImageUpload } from '@/components/image-upload';

type Draft = {
  label: string;
  description: string;
  imageUrl: string | null;
  requirements: string;
  maxWeightKg: string;
  pricePerKm: string;
  flatRate: string;
  perItemRate: string;
  isActive: boolean;
};

export function VehiclePricingCard() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<VehicleType | null>(null);
  const [draft, setDraft] = useState<Draft>({
    label: '',
    description: '',
    imageUrl: null,
    requirements: '',
    maxWeightKg: '',
    pricePerKm: '',
    flatRate: '',
    perItemRate: '',
    isActive: true,
  });

  const config = useQuery({
    queryKey: ['admin', 'vehicle-pricing'],
    queryFn: async (): Promise<{ items: VehiclePricingDto[] }> => {
      const res = await api.admin['vehicle-pricing'].$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as { items: VehiclePricingDto[] };
    },
  });

  const byType = new Map((config.data?.items ?? []).map((c) => [c.vehicleType, c]));

  const save = useMutation({
    mutationFn: async (vt: VehicleType) => {
      const res = await api.admin['vehicle-pricing'].$put({
        json: {
          vehicleType: vt,
          label: draft.label.trim() || null,
          description: draft.description.trim() || null,
          imageUrl: draft.imageUrl,
          requirements: draft.requirements.trim() || null,
          maxWeightKg: draft.maxWeightKg.trim() ? Number(draft.maxWeightKg) : null,
          pricePerKm: draft.pricePerKm.trim() ? Number(draft.pricePerKm) : null,
          flatRate: draft.flatRate.trim() ? Number(draft.flatRate) : null,
          perItemRate: draft.perItemRate.trim() ? Number(draft.perItemRate) : null,
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

  const open = (vt: VehicleType) => {
    const c = byType.get(vt);
    setDraft({
      label: c?.label ?? '',
      description: c?.description ?? '',
      imageUrl: c?.imageUrl ?? null,
      requirements: c?.requirements ?? '',
      maxWeightKg: c?.maxWeightKg != null ? String(c.maxWeightKg) : '',
      pricePerKm: c?.pricePerKm != null ? String(c.pricePerKm) : '',
      flatRate: c?.flatRate != null ? String(c.flatRate) : '',
      perItemRate: c?.perItemRate != null ? String(c.perItemRate) : '',
      isActive: c?.isActive ?? true,
    });
    setEditing(vt);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>ประเภทรถที่รับเข้าร่วม</CardTitle>
        <CardDescription>กำหนดลักษณะ/สเปก, น้ำหนักบรรทุก, เรตราคา และเปิด/ปิดรับแต่ละประเภท</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {VehicleTypeSchema.options.map((vt) => {
          const c = byType.get(vt);
          const active = c?.isActive ?? true;
          return (
            <div key={vt} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="flex items-start gap-3 text-sm">
                {c?.imageUrl ? (
                  <PreviewableImage
                    src={c.imageUrl}
                    alt={c.label || vt}
                    className="h-14 w-14 shrink-0 rounded-md border object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                    ไม่มีรูป
                  </div>
                )}
                <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c?.label || vt}</span>
                  <Badge variant={active ? 'success' : 'secondary'}>
                    {active ? 'เปิดรับ' : 'ปิดรับ'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {c?.requirements || 'ยังไม่ได้กำหนดลักษณะรถ'}
                  {c?.maxWeightKg ? ` · ≤ ${c.maxWeightKg.toLocaleString()} กก.` : ''}
                  {c?.pricePerKm != null ? ` · ฿${c.pricePerKm}/กม.` : ' · ใช้เรตกลาง'}
                </p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => open(vt)}>
                ตั้งค่า
              </Button>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตั้งค่าประเภทรถ — {editing}</DialogTitle>
            <DialogDescription>กำหนดลักษณะรถที่รับ และเปิด/ปิดการเข้าร่วม</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
                <Label htmlFor="vprice">ราคา/กม. (เว้นว่าง = เรตกลาง)</Label>
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
              เหมาลำ = ค่าเหมา + (ระยะ×เรต/กม.) · หลายสินค้า = (จำนวน×ค่าต่อชิ้น) + (ระยะ×เรต/กม.)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={save.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending}>
              {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
