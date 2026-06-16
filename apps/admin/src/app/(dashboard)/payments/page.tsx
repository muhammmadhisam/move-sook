'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@movesook/ui';
import { vehicleTypeLabel, type AdminJobListItem } from '@movesook/shared';
import { api } from '@/lib/api';
import { PaymentReview } from '@/components/payment-review';

type JobsResponse = {
  items: AdminJobListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export default function PaymentsQueuePage() {
  const queryClient = useQueryClient();

  const jobs = useQuery({
    queryKey: ['admin', 'payments'],
    queryFn: async (): Promise<JobsResponse> => {
      const res = await api.admin.jobs.$get({
        query: { status: 'PENDING_PAYMENT', pageSize: '100' },
      });
      if (!res.ok) throw new Error('โหลดรายการไม่สำเร็จ');
      return (await res.json()) as JobsResponse;
    },
    refetchInterval: 30_000,
  });

  const items = jobs.data?.items ?? [];
  // Slips waiting for review first; jobs where the customer hasn't paid yet last.
  const sorted = [...items].sort(
    (a, b) => Number(Boolean(b.paymentSlipUrl)) - Number(Boolean(a.paymentSlipUrl)),
  );
  const awaitingReview = items.filter((j) => j.paymentSlipUrl).length;
  const awaitingCustomer = items.length - awaitingReview;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">อนุมัติการโอน</h1>
        <p className="text-sm text-muted-foreground">
          ตรวจสลิปการโอนของลูกค้า — อนุมัติเพื่อเผยแพร่งานให้คนขับ ({awaitingReview} รอตรวจ /{' '}
          {items.length} ทั้งหมด)
        </p>
      </div>

      {awaitingReview > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <div className="text-sm">
            <p className="font-semibold">
              มี {awaitingReview} รายการรอตรวจสลิป
            </p>
            <p className="text-red-700/80">
              ลูกค้าโอนเงินและอัปโหลดสลิปแล้ว กรุณาตรวจสอบเพื่ออนุมัติและเผยแพร่งานให้คนขับ
              {awaitingCustomer > 0 ? ` · อีก ${awaitingCustomer} รายการรอลูกค้าโอน` : ''}
            </p>
          </div>
        </div>
      )}

      {jobs.isLoading && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}

      {!jobs.isLoading && items.length === 0 && (
        <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          ไม่มีงานที่รอชำระเงิน
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sorted.map((j) => (
          <Card key={j.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    <Link href={`/jobs/${j.id}`} className="hover:underline">
                      {j.itemDescription}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {j.originProvince} → {j.destProvince} · {vehicleTypeLabel(j.vehicleType)}
                  </CardDescription>
                  <p className="mt-1 text-xs text-muted-foreground">
                    ลูกค้า: {j.customerName ?? '—'}
                    {j.customerPhone ? ` · ${j.customerPhone}` : ''}
                  </p>
                </div>
                {j.paymentSlipUrl ? (
                  <Badge>รอตรวจสลิป</Badge>
                ) : (
                  <Badge variant="outline">รอลูกค้าโอน</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <PaymentReview job={j} onChanged={refresh} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
