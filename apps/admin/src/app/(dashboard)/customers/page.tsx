'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
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
import type { CustomerDto, Paged } from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

type CustomersResponse = Paged<CustomerDto>;

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const t = useTableState('createdAt');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = search.trim();
  const customers = useQuery({
    queryKey: ['admin', 'customers', trimmed, t.page, t.sortBy, t.sortDir],
    queryFn: async (): Promise<CustomersResponse> => {
      const query = {
        page: String(t.page),
        sortBy: t.sortBy,
        sortDir: t.sortDir,
        ...(trimmed ? { search: trimmed } : {}),
      };
      const res = await api.admin.customers.$get({ query });
      if (!res.ok) throw new Error('โหลดรายชื่อลูกค้าไม่สำเร็จ');
      return (await res.json()) as CustomersResponse;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.admin.customers.$post({
        json: {
          name: name.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      if (!res.ok) throw new Error('สร้างลูกค้าไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setCreating(false);
      setName('');
      setPhone('');
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
  });

  const onCreate = () => {
    setError(null);
    if (name.trim().length < 1) {
      setError('กรอกชื่อลูกค้า');
      return;
    }
    create.mutate();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">ลูกค้า</h1>
        <Button onClick={() => setCreating(true)}>+ เพิ่มลูกค้า (offline)</Button>
      </div>

      <div className="mb-4">
        <Input
          placeholder="ค้นหาชื่อ / เบอร์โทร"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            t.resetPage();
          }}
          className="max-w-xs"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="ชื่อ" col="name" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <TableHead>เบอร์โทร</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>หมายเหตุ</TableHead>
            <SortHead label="เพิ่มเมื่อ" col="createdAt" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.data?.items.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <Link
                  href={`/customers/${c.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {c.name ?? '—'}
                </Link>
              </TableCell>
              <TableCell>{c.phone ?? '—'}</TableCell>
              <TableCell>
                {c.userId ? (
                  <Badge variant="default">มีบัญชีแอป</Badge>
                ) : (
                  <Badge variant="secondary">offline</Badge>
                )}
              </TableCell>
              <TableCell className="max-w-48 truncate text-muted-foreground">
                {c.note ?? '—'}
              </TableCell>
              <TableCell>{new Date(c.createdAt).toLocaleDateString('th-TH')}</TableCell>
            </TableRow>
          ))}
          {customers.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {customers.isLoading ? 'กำลังโหลด…' : 'ไม่พบลูกค้า'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {customers.data && (
        <Pager
          page={customers.data.page}
          pageSize={customers.data.pageSize}
          total={customers.data.total}
          onPage={t.setPage}
        />
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มลูกค้า (offline)</DialogTitle>
            <DialogDescription>ลูกค้าที่ไม่มีบัญชีแอป เช่น โทรมาจอง / walk-in</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">ชื่อ *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">เบอร์โทร</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="note">หมายเหตุ</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={create.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={onCreate} disabled={create.isPending}>
              {create.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
