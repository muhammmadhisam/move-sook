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
  ProvinceSelect,
} from '@movesook/ui';
import type { ServiceAreaDto } from '@movesook/shared';
import { api } from '@/lib/api';

export function ServiceAreasCard() {
  const queryClient = useQueryClient();
  const [province, setProvince] = useState('');

  const areas = useQuery({
    queryKey: ['admin', 'service-areas'],
    queryFn: async (): Promise<{ items: ServiceAreaDto[] }> => {
      const res = await api.admin['service-areas'].$get();
      if (!res.ok) throw new Error('โหลดพื้นที่บริการไม่สำเร็จ');
      return (await res.json()) as { items: ServiceAreaDto[] };
    },
  });

  const setArea = useMutation({
    mutationFn: async (args: { province: string; isActive: boolean }) => {
      const res = await api.admin['service-areas'].$put({ json: args });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setProvince('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'service-areas'] });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>พื้นที่ให้บริการ</CardTitle>
        <CardDescription>เปิด/ปิดจังหวัดที่รับงาน (สร้างงานนอกพื้นที่ที่เปิดจะถูกบล็อก)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <ProvinceSelect value={province} onChange={setProvince} placeholder="เพิ่มจังหวัด" />
          </div>
          <Button
            disabled={!province || setArea.isPending}
            onClick={() => setArea.mutate({ province, isActive: true })}
          >
            เพิ่ม
          </Button>
        </div>
        <div className="space-y-1">
          {areas.data?.items.map((a) => (
            <div key={a.province} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                {a.province}
                <Badge variant={a.isActive ? 'success' : 'secondary'}>
                  {a.isActive ? 'เปิด' : 'ปิด'}
                </Badge>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={setArea.isPending}
                onClick={() => setArea.mutate({ province: a.province, isActive: !a.isActive })}
              >
                {a.isActive ? 'ปิด' : 'เปิด'}
              </Button>
            </div>
          ))}
          {areas.data?.items.length === 0 && (
            <p className="text-sm text-muted-foreground">ยังไม่ได้กำหนดพื้นที่ (ถือว่าเปิดทุกจังหวัด)</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
