'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@movesook/ui';
import { ClaimDriverInput } from '@movesook/shared';
import { api } from '@/lib/api';

export default function DriverClaimPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const claim = useMutation({
    mutationFn: async () => {
      const parsed = ClaimDriverInput.safeParse({ code });
      if (!parsed.success) throw new Error('กรอกโค้ดให้ถูกต้อง');
      const res = await api.drivers.claim.$post({ json: parsed.data });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ใช้โค้ดไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: async () => {
      toast.success('ยืนยันคนขับสำเร็จ — กรอกข้อมูลให้ครบเพื่อรออนุมัติ');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/driver/edit');
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>กรอกโค้ดเชิญคนขับ</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            แอดมินจะส่งโค้ดเชิญให้คุณหลังสร้างใบสมัคร นำโค้ดมากรอกที่นี่เพื่อเริ่มใช้งาน
          </p>
          <div className="grid gap-2">
            <Label htmlFor="code">โค้ดเชิญ</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="เช่น A1B2C3D4"
              autoCapitalize="characters"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={claim.isPending || code.trim().length < 4} onClick={() => claim.mutate()}>
            {claim.isPending ? 'กำลังยืนยัน…' : 'ยืนยันโค้ด'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
