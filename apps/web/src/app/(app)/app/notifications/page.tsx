'use client';

import Link from 'next/link';
import { Badge, Button, Card, CardContent } from '@movesook/ui';
import { NOTIFICATION_TYPE_LABEL } from '@movesook/shared';
import { useNotifications } from '@/hooks/use-notifications';
import { PageTour, type TourStep } from '@/components/tour/tour';

const NOTIFICATIONS_TOUR: TourStep[] = [
  {
    element: '[data-tour="notifications-head"]',
    popover: {
      title: 'การแจ้งเตือน',
      description:
        'อัปเดตทุกอย่างเกี่ยวกับงานของคุณ — มีคนขับรับงาน สถานะเปลี่ยน หรือต้องดำเนินการต่อ จะแจ้งที่นี่',
    },
  },
  {
    popover: {
      title: 'อ่านทั้งหมด',
      description: 'แตะการแจ้งเตือนเพื่อเปิดงานที่เกี่ยวข้อง หรือกด “อ่านทั้งหมด” เพื่อเคลียร์จุดแดง',
    },
  },
];

export default function NotificationsPage() {
  const { items, isLoading, unreadCount, markRead, markAllRead } = useNotifications();

  return (
    <main className="mx-auto max-w-md p-6">
      <PageTour id="notifications" steps={NOTIFICATIONS_TOUR} />
      <div className="mb-4 flex items-center justify-between">
        <h1 data-tour="notifications-head" className="text-2xl font-semibold tracking-tight">การแจ้งเตือน</h1>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()}>
            อ่านทั้งหมด
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {!isLoading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">ยังไม่มีการแจ้งเตือน</p>
      )}

      <div className="flex flex-col gap-2">
        {items.map((n) => {
          const unread = n.readAt === null;
          const card = (
            <Card className={unread ? 'border-primary/40 bg-primary/5' : undefined}>
              <CardContent className="flex items-start gap-3 p-4">
                {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {NOTIFICATION_TYPE_LABEL[n.type]}
                    </Badge>
                    {unread && <Badge variant="default" className="text-[10px]">ใหม่</Badge>}
                  </div>
                  <p className="truncate font-medium">{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                </div>
              </CardContent>
            </Card>
          );
          const onActivate = () => unread && markRead.mutate(n.id);
          return n.jobId ? (
            <Link key={n.id} href={`/app/jobs/${n.jobId}`} className="block" onClick={onActivate}>
              {card}
            </Link>
          ) : (
            <button key={n.id} type="button" className="block w-full text-left" onClick={onActivate}>
              {card}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <Button asChild variant="outline" className="w-full">
          <Link href="/app">กลับหน้าหลัก</Link>
        </Button>
      </div>
    </main>
  );
}
