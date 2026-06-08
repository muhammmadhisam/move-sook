'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PreviewableImage,
} from '@movesook/ui';
import {
  JOB_STATUS_LABEL,
  VEHICLE_TYPE_LABEL,
  type AdminJobDetailResponse,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { PaymentReview } from '@/components/payment-review';

const baht = (n: number) => `฿${n.toLocaleString()}`;

function Photos({ title, urls }: { title: string; urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <PreviewableImage
            key={u}
            src={u}
            gallery={urls}
            alt={title}
            className="h-24 w-24 rounded-md border object-cover"
          />
        ))}
      </div>
    </div>
  );
}

export default function AdminJobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['admin', 'job', id],
    queryFn: async (): Promise<AdminJobDetailResponse> => {
      const res = await api.admin.jobs[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('โหลดข้อมูลงานไม่สำเร็จ');
      return (await res.json()) as AdminJobDetailResponse;
    },
  });

  if (detail.isLoading) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (!detail.data) return <p className="text-sm text-destructive">ไม่พบงาน</p>;

  const j = detail.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
            ← กลับ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{j.itemDescription}</h1>
          <p className="font-mono text-xs text-muted-foreground">{j.id}</p>
        </div>
        <Badge variant={j.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
          {JOB_STATUS_LABEL[j.status]}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>รายละเอียดงาน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>ประเภทรถ: {VEHICLE_TYPE_LABEL[j.vehicleType]}</p>
            <p>
              ต้นทาง: {j.originAddress} ({j.originProvince})
            </p>
            <p>
              ปลายทาง: {j.destAddress} ({j.destProvince})
            </p>
            <p>นัดหมาย: {j.scheduledAt ? new Date(j.scheduledAt).toLocaleString('th-TH') : '—'}</p>
            <p>สร้างเมื่อ: {new Date(j.createdAt).toLocaleString('th-TH')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ราคา & คู่กรณี</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>ราคา: {j.priceQuoted != null ? baht(j.priceQuoted) : '—'}</p>
            {j.discountAmount != null && j.discountAmount > 0 && (
              <p className="text-emerald-600">
                ส่วนลด: -{baht(j.discountAmount)} {j.promoCode ? `(${j.promoCode})` : ''}
              </p>
            )}
            <p>คอมมิชชั่น: {j.commissionPct != null ? `${j.commissionPct}%` : '—'}</p>
            <p>
              ลูกค้า:{' '}
              <Link href={`/customers/${j.customerId}`} className="text-primary hover:underline">
                {j.customerName ?? '—'}
              </Link>
              {j.customerPhone ? ` · ${j.customerPhone}` : ''}
            </p>
            <p>คนขับ: {j.driverName ?? (j.driverId ? 'มอบหมายแล้ว' : '— ยังไม่มีคนรับ')}</p>
            <p>
              ลูกค้ายืนยันรับของ:{' '}
              {j.customerConfirmedAt ? (
                <span className="font-medium text-emerald-600">
                  ✓ ยืนยันแล้ว ({new Date(j.customerConfirmedAt).toLocaleString('th-TH')})
                </span>
              ) : (
                <span className="text-muted-foreground">ยังไม่ยืนยัน</span>
              )}
            </p>
            {j.createdByAdminId && <Badge variant="outline">สร้างโดยแอดมิน</Badge>}
          </CardContent>
        </Card>
      </div>

      {/* Up-front payment slip review (gates publishing to drivers). */}
      {(j.status === 'PENDING_PAYMENT' || j.paymentSlipUrl) && (
        <Card>
          <CardHeader>
            <CardTitle>การชำระเงินของลูกค้า</CardTitle>
            <CardDescription>ตรวจสลิปการโอนก่อนเผยแพร่งานให้คนขับ</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentReview
              job={j}
              onChanged={() => queryClient.invalidateQueries({ queryKey: ['admin', 'job', id] })}
            />
          </CardContent>
        </Card>
      )}

      {(j.itemPhotos.length > 0 || j.pickupProofUrls.length > 0 || j.deliveryProofUrls.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>รูปภาพ</CardTitle>
            <CardDescription>สิ่งของ / หลักฐานรับ-ส่ง</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Photos title="รูปสิ่งของ" urls={j.itemPhotos} />
            <Photos title="หลักฐานตอนรับของ" urls={j.pickupProofUrls} />
            <Photos title="หลักฐานตอนส่ง" urls={j.deliveryProofUrls} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
