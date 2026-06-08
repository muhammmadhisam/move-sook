'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useConfirm,
} from '@movesook/ui';
import {
  CONSENT_TYPE_LABEL,
  DRIVER_VERIFY_STATUS_LABEL,
  JOB_STATUS_LABEL,
  ROLE_LABEL,
  type AdminUserDetailResponse,
  type ConsentDto,
} from '@movesook/shared';
import { api } from '@/lib/api';

const baht = (n: number) => `฿${n.toLocaleString()}`;
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const detail = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: async (): Promise<AdminUserDetailResponse> => {
      const res = await api.admin.users[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('โหลดข้อมูลผู้ใช้ไม่สำเร็จ');
      return (await res.json()) as AdminUserDetailResponse;
    },
  });

  const consents = useQuery({
    queryKey: ['admin', 'user', id, 'consents'],
    queryFn: async (): Promise<{ items: ConsentDto[] }> => {
      const res = await api.admin.users[':id'].consents.$get({ param: { id } });
      if (!res.ok) throw new Error('โหลดความยินยอมไม่สำเร็จ');
      return (await res.json()) as { items: ConsentDto[] };
    },
  });

  const setBan = useMutation({
    mutationFn: async (isBanned: boolean) => {
      const res = await api.admin.users[':id'].ban.$patch({ param: { id }, json: { isBanned } });
      if (!res.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ');
      return res.json();
    },
    onSuccess: (_d, isBanned) => {
      toast.success(isBanned ? 'แบนผู้ใช้แล้ว' : 'ปลดแบนผู้ใช้แล้ว');
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // DSAR: download the user's data bundle as JSON.
  const exportData = async () => {
    const res = await fetch(`${API_BASE}/admin/users/${id}/export`, { credentials: 'include' });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-${id}-data.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const anonymize = useMutation({
    mutationFn: async () => {
      const res = await api.admin.users[':id'].anonymize.$post({ param: { id } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'ลบข้อมูลไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('ลบ/ปิดบังข้อมูลส่วนบุคคลแล้ว');
      queryClient.invalidateQueries({ queryKey: ['admin', 'user', id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (detail.isLoading) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (!detail.data) return <p className="text-sm text-destructive">ไม่พบผู้ใช้</p>;

  const { user, driver, jobsAsCustomer, reviewsAuthored, counts } = detail.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/users" className="text-sm text-muted-foreground hover:underline">
            ← กลับ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{user.displayName ?? 'ผู้ใช้'}</h1>
        </div>
        {user.role !== 'ADMIN' && (
          <Button
            variant={user.isBanned ? 'outline' : 'destructive'}
            disabled={setBan.isPending}
            onClick={() => setBan.mutate(!user.isBanned)}
          >
            {setBan.isPending ? 'กำลังบันทึก…' : user.isBanned ? 'ปลดแบน' : 'แบน'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>โปรไฟล์</CardTitle>
            <CardDescription className="space-x-2">
              <Badge variant={user.role === 'ADMIN' ? 'destructive' : 'secondary'}>
                {ROLE_LABEL[user.role]}
              </Badge>
              {user.isBanned ? (
                <Badge variant="destructive">ถูกแบน</Badge>
              ) : (
                <Badge variant="success">ใช้งานปกติ</Badge>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>เบอร์โทร: {user.phone ?? '—'}</p>
            <p>สมัครเมื่อ: {new Date(user.createdAt).toLocaleDateString('th-TH')}</p>
            {driver && (
              <p>
                คนขับ:{' '}
                <Link href={`/drivers/${driver.id}`} className="text-primary hover:underline">
                  ดูโปรไฟล์คนขับ ({DRIVER_VERIFY_STATUS_LABEL[driver.verifyStatus]})
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>สรุปงาน (ในฐานะลูกค้า)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>งานทั้งหมด: {counts.jobsTotal}</p>
            <p>ส่งสำเร็จ: {counts.jobsDelivered}</p>
            <p>ยกเลิก: {counts.jobsCancelled}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>ข้อมูลส่วนบุคคล (PDPA)</CardTitle>
            <CardDescription>ความยินยอม + สิทธิเจ้าของข้อมูล</CardDescription>
          </div>
          <div className="space-x-2">
            <Button size="sm" variant="outline" onClick={exportData}>
              ส่งออกข้อมูล
            </Button>
            {!user.anonymizedAt && user.role !== 'ADMIN' && (
              <Button
                size="sm"
                variant="destructive"
                disabled={anonymize.isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'ลบข้อมูลส่วนบุคคล (PDPA)',
                    description:
                      'ลบ/ปิดบังข้อมูลส่วนบุคคลของผู้ใช้นี้? (เก็บประวัติธุรกรรมไว้เพื่อบัญชี) — ย้อนกลับไม่ได้',
                    confirmText: 'ลบข้อมูล',
                    destructive: true,
                  });
                  if (ok) anonymize.mutate();
                }}
              >
                {anonymize.isPending ? 'กำลังลบ…' : 'ลบข้อมูล (PDPA)'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          {user.anonymizedAt && (
            <p className="mb-2 text-destructive">ข้อมูลถูกปิดบังแล้ว (anonymized)</p>
          )}
          <p className="mb-1 font-medium">ความยินยอม</p>
          {consents.data && consents.data.items.length > 0 ? (
            <ul className="space-y-1">
              {consents.data.items.map((cs) => (
                <li key={cs.id} className="flex items-center gap-2">
                  <Badge variant={cs.granted ? 'success' : 'secondary'}>
                    {cs.granted ? 'ยินยอม' : 'ปฏิเสธ'}
                  </Badge>
                  <span>
                    {CONSENT_TYPE_LABEL[cs.type]} v{cs.version} ·{' '}
                    {new Date(cs.createdAt).toLocaleDateString('th-TH')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">ยังไม่มีบันทึกความยินยอม</p>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-lg font-semibold">งานที่โพสต์ล่าสุด</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รายการ</TableHead>
              <TableHead>เส้นทาง</TableHead>
              <TableHead>ราคา</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobsAsCustomer.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="max-w-48 truncate">{j.itemDescription}</TableCell>
                <TableCell>
                  {j.originProvince} → {j.destProvince}
                </TableCell>
                <TableCell>{j.priceQuoted ? baht(j.priceQuoted) : '—'}</TableCell>
                <TableCell>
                  <Badge variant={j.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
                    {JOB_STATUS_LABEL[j.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {jobsAsCustomer.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  ยังไม่มีงาน
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">รีวิวที่เขียน</h2>
        <div className="space-y-2">
          {reviewsAuthored.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{'★'.repeat(r.rating)}</span>
                  <span className="text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString('th-TH')}
                  </span>
                </div>
                {r.comment && <p className="mt-1">{r.comment}</p>}
              </CardContent>
            </Card>
          ))}
          {reviewsAuthored.length === 0 && (
            <p className="text-sm text-muted-foreground">ยังไม่มีรีวิว</p>
          )}
        </div>
      </div>
    </div>
  );
}
