'use client';

import Link from 'next/link';
import { Gift } from 'lucide-react';
import { Button, Card, CardContent } from '@movesook/ui';
import { useAuth } from '@/hooks/use-auth';
import { AvailabilityToggle } from '@/components/availability-toggle';
import { IncentivesCard } from '@/components/incentives-card';
import { DriverJobsMap } from '@/components/driver-jobs-map';

// Authenticated home dashboard. The (app) layout's AppShell redirects
// unauthenticated visitors to /login, so `me` is present here in practice.
export default function AppHomePage() {
  const { me } = useAuth();

  if (!me) return null;

  const isDriver = me.role === 'DRIVER';
  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <div>
        <p className="text-sm text-muted-foreground">สวัสดี</p>
        <h2 className="text-xl font-semibold tracking-tight">{me.displayName ?? 'ผู้ใช้'}</h2>
      </div>

      {isDriver && (
        <>
          <Card>
            <CardContent className="p-4">
              <AvailabilityToggle initial={me.isAvailable} />
            </CardContent>
          </Card>
          <IncentivesCard />
          {/* Jobs near you — tap a pin on the map to accept without opening the list. */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">งานใกล้คุณ</h3>
              <Link href="/jobs" className="text-xs text-primary hover:underline">
                ดูแบบรายการ →
              </Link>
            </div>
            <DriverJobsMap />
          </div>
        </>
      )}

      <div className="grid gap-3">
        {isDriver ? (
          <Button asChild size="lg" variant="outline">
            <Link href="/active">งานที่รับไว้</Link>
          </Button>
        ) : (
          <>
            <Button asChild size="lg">
              <Link href="/jobs/new">โพสต์งานขนย้าย</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/my-jobs">งานของฉัน</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/referral">
                <Gift className="h-4 w-4" />
                แนะนำเพื่อน รับส่วนลด
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
