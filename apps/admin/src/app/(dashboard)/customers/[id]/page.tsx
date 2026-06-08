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
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@movesook/ui';
import { JOB_STATUS_LABEL, type AdminCustomerDetailResponse } from '@movesook/shared';
import { api } from '@/lib/api';

const baht = (n: number) => `฿${n.toLocaleString()}`;

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

  return (
    <div className="space-y-6">
      <div>
        <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
          ← กลับ
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{customer.name ?? 'ลูกค้า'}</h1>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>ข้อมูลลูกค้า</CardTitle>
          <CardDescription>
            {customer.userId ? (
              <Badge variant="default">มีบัญชีแอป</Badge>
            ) : (
              <Badge variant="secondary">offline</Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>เบอร์โทร: {customer.phone ?? '—'}</p>
          <p>หมายเหตุ: {customer.note ?? '—'}</p>
          <p>เพิ่มเมื่อ: {new Date(customer.createdAt).toLocaleDateString('th-TH')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CRM</CardTitle>
          <CardDescription>แท็กกลุ่มลูกค้า + บันทึกการติดต่อ</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="mb-1 text-sm font-medium">แท็ก</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {customer.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                  {tag} ✕
                </Badge>
              ))}
              {customer.tags.length === 0 && <span className="text-sm text-muted-foreground">ยังไม่มีแท็ก</span>}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="เพิ่มแท็ก เช่น VIP, ลูกค้าประจำ"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                className="max-w-xs"
              />
              <Button variant="outline" disabled={saveTags.isPending} onClick={addTag}>
                เพิ่ม
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">บันทึกการติดต่อ</p>
            <div className="mb-2 flex gap-2">
              <Input
                placeholder="พิมพ์บันทึก…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <Button
                disabled={addNote.isPending || !noteBody.trim()}
                onClick={() => addNote.mutate(noteBody.trim())}
              >
                บันทึก
              </Button>
            </div>
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="text-xs text-muted-foreground">
                    {n.authorName ?? 'แอดมิน'} · {new Date(n.createdAt).toLocaleString('th-TH')}
                  </div>
                  <p>{n.body}</p>
                </li>
              ))}
              {notes.length === 0 && <li className="text-sm text-muted-foreground">ยังไม่มีบันทึก</li>}
            </ul>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-lg font-semibold">งานทั้งหมด</h2>
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
            {jobs.map((j) => (
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
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  ยังไม่มีงาน
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
