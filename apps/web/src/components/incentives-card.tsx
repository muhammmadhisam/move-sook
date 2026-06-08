'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@movesook/ui';
import { Flame, Trophy, Target } from 'lucide-react';
import type { DriverIncentivesResponse } from '@movesook/shared';
import { api } from '@/lib/api';

/** Driver-only weekly progress card: goal bar, streak, and rank. */
export function IncentivesCard() {
  const { data } = useQuery({
    queryKey: ['drivers', 'incentives'],
    queryFn: async (): Promise<DriverIncentivesResponse> => {
      const res = await api.drivers.me.incentives.$get();
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      return (await res.json()) as DriverIncentivesResponse;
    },
    staleTime: 60 * 1000,
  });

  if (!data) return null;
  const pct = Math.round(data.goalProgress * 100);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">เป้าหมายสัปดาห์นี้</p>
          <p className="text-xs text-muted-foreground">
            {data.weekDelivered}/{data.weeklyGoal} งาน
          </p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <div className="rounded-lg bg-muted/40 p-2">
            <Trophy className="mx-auto mb-1 h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">
              ฿{data.weekEarnings.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground">รายได้สัปดาห์</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <Flame className="mx-auto mb-1 h-4 w-4 text-orange-500" />
            <p className="text-sm font-semibold">{data.streakDays} วัน</p>
            <p className="text-[10px] text-muted-foreground">ต่อเนื่อง</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <Target className="mx-auto mb-1 h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">
              {data.rank ? `#${data.rank}` : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              อันดับ{data.totalRanked > 0 ? `/${data.totalRanked}` : ''}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
