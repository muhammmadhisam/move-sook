'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@movesook/ui';
import {
  JOB_STATUS_LABEL,
  type AdminCustomerDetailResponse,
  type JobDto,
  type JobStatus,
} from '@movesook/shared';
import { api } from '@/lib/api';

const baht = (n: number) => `฿${n.toLocaleString()}`;

const STATUS_VARIANT: Record<JobStatus, 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline'> = {
  DRAFT: 'outline',
  PENDING_PAYMENT: 'warning',
  POSTED: 'warning',
  ACCEPTED: 'default',
  PICKED_UP: 'default',
  IN_TRANSIT: 'default',
  PENDING_CONFIRMATION: 'default',
  DELIVERED: 'success',
  FLAGGED_ILLEGAL: 'destructive',
  CANCELLED: 'destructive',
};

const initials = (name: string | null) =>
  (name ?? 'ลูกค้า').trim().slice(0, 2).toUpperCase() || '?';

const thDate = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [tagInput, setTagInput] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const detail = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: async (): Promise<AdminCustomerDetailResponse> => {
      const res = await api.admin.customers[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('โหลดข้อมูลลูกค้าไม่สำเร็จ');
      return (await res.json()) as AdminCustomerDetailResponse;
    },
  });

  const saveTags = useMutation({
    mutationFn: async (tags: string[]) => {
      const res = await api.admin.customers[':id'].$patch({ param: { id }, json: { tags } });
      if (!res.ok) throw new Error('บันทึกแท็กไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id] }),
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const res = await api.admin.customers[':id'].notes.$post({ param: { id }, json: { body } });
      if (!res.ok) throw new Error('บันทึกโน้ตไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setNoteBody('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id] });
    },
  });

  if (detail.isLoading) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (!detail.data) return <p className="text-sm text-destructive">ไม่พบลูกค้า</p>;

  const { customer, jobs, notes } = detail.data;

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || customer.tags.includes(tag)) return;
    saveTags.mutate([...customer.tags, tag]);
    setTagInput('');
  };
  const removeTag = (tag: string) => saveTags.mutate(customer.tags.filter((x) => x !== tag));

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const delivered = jobs.filter((j) => j.status === 'DELIVERED');
  const cancelled = jobs.filter((j) => j.status === 'CANCELLED');
  const active = jobs.filter(
    (j) => !(['DELIVERED', 'CANCELLED', 'DRAFT', 'FLAGGED_ILLEGAL'] as JobStatus[]).includes(j.status),
  );
  const totalSpend = delivered.reduce((sum, j) => sum + (j.priceQuoted ?? 0), 0);

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: 'งานทั้งหมด', value: jobs.length.toLocaleString() },
    { label: 'สำเร็จ', value: delivered.length.toLocaleString(), hint: 'จัดส่งแล้ว' },
    { label: 'กำลังดำเนินการ', value: active.length.toLocaleString() },
    { label: 'ยอดใช้จ่ายรวม', value: baht(totalSpend), hint: 'จากงานที่สำเร็จ' },
  ];

  return (
    <div className="space-y-6">
      <Link href="/customers" className="inline-flex text-sm text-muted-foreground hover:underline">
        ← กลับไปรายชื่อลูกค้า
      </Link>

      {/* ── Profile header ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl font-bold text-brand-700">
            {initials(customer.name)}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{customer.name ?? 'ลูกค้า'}</h1>
              {customer.userId ? (
                <Badge variant="success">มีบัญชีแอป</Badge>
              ) : (
                <Badge variant="secondary">เพิ่มโดยแอดมิน (offline)</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/70">โทร</span>
                {customer.phone ? (
                  <a href={`tel:${customer.phone}`} className="font-medium text-foreground hover:underline">
                    {customer.phone}
                  </a>
                ) : (
                  <span>—</span>
                )}
              </span>
              {customer.referralCode && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-muted-foreground/70">โค้ดแนะนำ</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {customer.referralCode}
                  </code>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/70">เป็นลูกค้าตั้งแต่</span>
                <span className="text-foreground">{thDate(customer.createdAt)}</span>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
              {s.hint && <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left: CRM sidebar ──────────────────────────────────────────── */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">รายละเอียด</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">เบอร์โทร</span>
                <span className="text-right font-medium">{customer.phone ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">หมายเหตุ</span>
                <span className="text-right">{customer.note ?? '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">ยกเลิกไปแล้ว</span>
                <span className="text-right font-medium">{cancelled.length} งาน</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">แท็กกลุ่มลูกค้า</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {customer.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer hover:bg-error-50 hover:text-error-700"
                    onClick={() => removeTag(tag)}
                  >
                    {tag} ✕
                  </Badge>
                ))}
                {customer.tags.length === 0 && (
                  <span className="text-sm text-muted-foreground">ยังไม่มีแท็ก</span>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="เช่น VIP, ลูกค้าประจำ"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag()}
                />
                <Button variant="outline" disabled={saveTags.isPending} onClick={addTag}>
                  เพิ่ม
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">บันทึกการติดต่อ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Textarea
                  placeholder="พิมพ์บันทึกการติดต่อ…"
                  rows={2}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                />
                <Button
                  className="w-full"
                  disabled={addNote.isPending || !noteBody.trim()}
                  onClick={() => addNote.mutate(noteBody.trim())}
                >
                  {addNote.isPending ? 'กำลังบันทึก…' : 'เพิ่มบันทึก'}
                </Button>
              </div>
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {n.authorName ?? 'แอดมิน'} · {new Date(n.createdAt).toLocaleString('th-TH')}
                    </div>
                  </li>
                ))}
                {notes.length === 0 && (
                  <li className="py-2 text-center text-sm text-muted-foreground">ยังไม่มีบันทึก</li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: job history ─────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">ประวัติงาน</CardTitle>
              <span className="text-sm text-muted-foreground">{jobs.length} รายการ</span>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>รายการ</TableHead>
                    <TableHead>เส้นทาง</TableHead>
                    <TableHead className="text-right">ราคา</TableHead>
                    <TableHead>สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((j: JobDto) => (
                    <TableRow
                      key={j.id}
                      className="cursor-pointer"
                      onClick={() => {
                        window.location.href = `/jobs/${j.id}`;
                      }}
                    >
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {thDate(j.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-48 truncate font-medium">{j.itemDescription}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {j.originProvince} → {j.destProvince}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {j.priceQuoted ? baht(j.priceQuoted) : '—'}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {j.paymentMethod === 'COD' ? 'COD' : ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[j.status]}>{JOB_STATUS_LABEL[j.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {jobs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        ยังไม่มีงาน
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
