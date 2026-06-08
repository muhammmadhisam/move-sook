'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@movesook/ui';
import type { BlacklistDto, Paged } from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, useTableState } from '@/components/data-table';

export default function BlacklistPage() {
  const queryClient = useQueryClient();
  const tbl = useTableState('createdAt');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ nationalId: '', plateNumber: '', reason: '' });
  const [error, setError] = useState<string | null>(null);

  const trimmed = search.trim();
  const list = useQuery({
    queryKey: ['admin', 'blacklist', trimmed, tbl.page],
    queryFn: async (): Promise<Paged<BlacklistDto>> => {
      const res = await api.admin.blacklist.$get({
        query: { page: String(tbl.page), ...(trimmed ? { search: trimmed } : {}) },
      });
      if (!res.ok) throw new Error('โหลดบัญชีดำไม่สำเร็จ');
      return (await res.json()) as Paged<BlacklistDto>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.admin.blacklist.$post({
        json: {
          ...(form.nationalId.trim() ? { nationalId: form.nationalId.trim() } : {}),
          ...(form.plateNumber.trim() ? { plateNumber: form.plateNumber.trim() } : {}),
          ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'เพิ่มไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setCreating(false);
      setForm({ nationalId: '', plateNumber: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.admin.blacklist[':id'].$delete({ param: { id } });
      if (!res.ok) throw new Error('ลบไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'blacklist'] }),
  });

  const onCreate = () => {
    setError(null);
    if (!form.nationalId.trim() && !form.plateNumber.trim()) {
      return setError('กรอกเลขบัตรหรือทะเบียนรถอย่างน้อยหนึ่งอย่าง');
    }
    create.mutate();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">บัญชีดำ (Blacklist)</h1>
        <Button
          onClick={() => {
            setError(null);
            setCreating(true);
          }}
        >
          + เพิ่มรายการ
        </Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="ค้นหาเลขบัตร / ทะเบียน"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            tbl.resetPage();
          }}
          className="max-w-xs"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขบัตรประชาชน</TableHead>
            <TableHead>ทะเบียนรถ</TableHead>
            <TableHead>เหตุผล</TableHead>
            <TableHead>เพิ่มเมื่อ</TableHead>
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.data?.items.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-mono">{b.nationalId ?? '—'}</TableCell>
              <TableCell>{b.plateNumber ?? '—'}</TableCell>
              <TableCell className="max-w-48 truncate text-muted-foreground">{b.reason ?? '—'}</TableCell>
              <TableCell>{new Date(b.createdAt).toLocaleDateString('th-TH')}</TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(b.id)}
                >
                  เอาออก
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {list.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {list.isLoading ? 'กำลังโหลด…' : 'ไม่มีรายการ'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {list.data && (
        <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={tbl.setPage} />
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มเข้าบัญชีดำ</DialogTitle>
            <DialogDescription>บล็อกการสมัครคนขับด้วยเลขบัตร/ทะเบียนรถนี้</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nid">เลขบัตรประชาชน</Label>
              <Input id="nid" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plate">ทะเบียนรถ</Label>
              <Input id="plate" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reason">เหตุผล</Label>
              <Input id="reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={create.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={onCreate} disabled={create.isPending}>
              {create.isPending ? 'กำลังบันทึก…' : 'เพิ่ม'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
