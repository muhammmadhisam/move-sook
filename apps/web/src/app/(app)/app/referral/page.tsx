'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Gift, Copy, Check } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@movesook/ui';
import type { ReferralResponse } from '@movesook/shared';
import { api } from '@/lib/api';

export default function ReferralPage() {
  const queryClient = useQueryClient();
  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referral = useQuery({
    queryKey: ['me', 'referral'],
    queryFn: async (): Promise<ReferralResponse> => {
      const res = await api.me.referral.$get();
      if (!res.ok) throw new Error('โหลดข้อมูลแนะนำเพื่อนไม่สำเร็จ');
      return (await res.json()) as ReferralResponse;
    },
  });

  const apply = useMutation({
    mutationFn: async (code: string) => {
      const res = await api.me.referral.apply.$post({ json: { code } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ใช้โค้ดไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('ใช้โค้ดแนะนำสำเร็จ');
      setCodeInput('');
      queryClient.invalidateQueries({ queryKey: ['me', 'referral'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const data = referral.data;

  const copyCode = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">แนะนำเพื่อน รับส่วนลด</h1>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">โค้ดของคุณ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            ชวนเพื่อนมาใช้ MoveSook เมื่อเพื่อนใช้งานจบงานแรก
            ทั้งคุณและเพื่อนรับส่วนลด ฿{data?.rewardThb ?? 50} ทันที
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-center text-2xl font-bold tracking-widest text-primary">
              {data?.code ?? '••••••'}
            </div>
            <Button variant="outline" size="icon" onClick={copyCode} disabled={!data}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-2xl font-bold">{data?.referredCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">เพื่อนที่ชวน</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-2xl font-bold">{data?.rewardedCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">ได้รับรางวัลแล้ว</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Apply someone else's code (only if not yet applied). */}
      {data && !data.referredByApplied && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">มีโค้ดแนะนำ?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="refcode" className="text-xs text-muted-foreground">
              กรอกโค้ดเพื่อนที่ชวนคุณ (ใช้ได้ครั้งเดียว)
            </Label>
            <div className="flex gap-2">
              <Input
                id="refcode"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.toUpperCase());
                  setError(null);
                }}
                placeholder="กรอกโค้ด"
                className="uppercase"
              />
              <Button
                disabled={apply.isPending || codeInput.trim().length < 4}
                onClick={() => apply.mutate(codeInput.trim())}
              >
                ใช้โค้ด
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {data?.referredByApplied && (
        <p className="flex items-center justify-center gap-1 text-center text-sm text-muted-foreground">
          คุณได้ใช้โค้ดแนะนำแล้ว
          <Check className="h-3.5 w-3.5 shrink-0" />
          รับส่วนลดเมื่อจบงานแรก
        </p>
      )}
    </div>
  );
}
