'use client';

import Link from 'next/link';
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
  PreviewableImage,
  useConfirm,
} from '@movesook/ui';
import { vehicleTypeLabel, type VehiclePricingDto } from '@movesook/shared';
import { api } from '@/lib/api';

export function VehiclePricingCard() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const config = useQuery({
    queryKey: ['admin', 'vehicle-pricing'],
    queryFn: async (): Promise<{ items: VehiclePricingDto[] }> => {
      const res = await api.admin['vehicle-pricing'].$get();
      if (!res.ok) throw new Error('โหลดประเภทรถไม่สำเร็จ');
      return (await res.json()) as { items: VehiclePricingDto[] };
    },
  });

  const items = config.data?.items ?? [];

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
          <Button size="sm" asChild className="shrink-0">
            <Link href="/settings/vehicles/new">
              <Plus className="mr-1 h-4 w-4" />
              เพิ่มประเภทรถ
            </Link>
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
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/settings/vehicles/${encodeURIComponent(c.vehicleType)}`}>ตั้งค่า</Link>
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
    </Card>
  );
}
