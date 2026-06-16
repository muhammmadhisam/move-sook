'use client';

import { useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@movesook/ui';
import {
  JOB_STATUS_LABEL,
  PromoTypeSchema,
  type Paged,
  type PromoCodeDto,
  type PromoRedemptionDto,
  type PromoType,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

export default function PromosPage() {
  const queryClient = useQueryClient();
  const tbl = useTableState('createdAt');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', type: 'PERCENT' as PromoType, value: '', minOrder: '', maxUses: '' });
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null); // code whose redemption log is open
  const [usagePage, setUsagePage] = useState(1);

  const usage = useQuery({
    queryKey: ['admin', 'promos', viewing, 'redemptions', usagePage],
    enabled: viewing !== null,
    queryFn: async (): Promise<Paged<PromoRedemptionDto>> => {
      const res = await api.admin.promos[':code'].redemptions.$get({
        param: { code: viewing! },
        query: { page: String(usagePage) },
      });
      if (!res.ok) throw new Error('โหลดประวัติการใช้งานไม่สำเร็จ');
      return (await res.json()) as Paged<PromoRedemptionDto>;
    },
  });

  const promos = useQuery({
    queryKey: ['admin', 'promos', tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<Paged<PromoCodeDto>> => {
      const res = await api.admin.promos.$get({
        query: { page: String(tbl.page), sortBy: tbl.sortBy, sortDir: tbl.sortDir },
      });
      if (!res.ok) throw new Error('โหลดโค้ดส่วนลดไม่สำเร็จ');
      return (await res.json()) as Paged<PromoCodeDto>;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.admin.promos.$post({
        json: {
          code: form.code.trim(),
          type: form.type,
          value: Number(form.value),
          ...(form.minOrder.trim() ? { minOrder: Number(form.minOrder) } : {}),
          ...(form.maxUses.trim() ? { maxUses: Number(form.maxUses) } : {}),
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'สร้างโค้ดไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setCreating(false);
      setForm({ code: '', type: 'PERCENT', value: '', minOrder: '', maxUses: '' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'promos'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (args: { code: string; isActive: boolean }) => {
      const res = await api.admin.promos[':code'].$patch({
        param: { code: args.code },
        json: { isActive: args.isActive },
      });
      if (!res.ok) throw new Error('อัปเดตไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'promos'] }),
  });

  const onCreate = () => {
    setError(null);
    if (form.code.trim().length < 2) return setError('กรอกโค้ด');
    if (!Number(form.value)) return setError('กรอกมูลค่าส่วนลด');
    create.mutate();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">โค้ดส่วนลด</h1>
        <Button
          onClick={() => {
            setError(null);
            setCreating(true);
          }}
        >
          + สร้างโค้ด
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="โค้ด" col="code" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>ส่วนลด</TableHead>
            <TableHead>ขั้นต่ำ</TableHead>
            <SortHead label="ใช้ไป" col="usedCount" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {promos.data?.items.map((p) => (
            <TableRow key={p.code}>
              <TableCell className="font-mono font-medium">{p.code}</TableCell>
              <TableCell>{p.type === 'PERCENT' ? `${p.value}%` : `฿${p.value.toLocaleString()}`}</TableCell>
              <TableCell>{p.minOrder ? `฿${p.minOrder.toLocaleString()}` : '—'}</TableCell>
              <TableCell>
                {p.usedCount}
                {p.maxUses ? ` / ${p.maxUses}` : ''}
              </TableCell>
              <TableCell>
                <Badge variant={p.isActive ? 'success' : 'secondary'}>
                  {p.isActive ? 'เปิด' : 'ปิด'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setUsagePage(1);
                      setViewing(p.code);
                    }}
                  >
                    ดูการใช้งาน
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ code: p.code, isActive: !p.isActive })}
                  >
                    {p.isActive ? 'ปิด' : 'เปิด'}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {promos.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {promos.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีโค้ด'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {promos.data && (
        <Pager
          page={promos.data.page}
          pageSize={promos.data.pageSize}
          total={promos.data.total}
          onPage={tbl.setPage}
        />
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>สร้างโค้ดส่วนลด</DialogTitle>
            <DialogDescription>ใช้ลดราคาตอนสร้างงานให้ลูกค้า</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="code">โค้ด</Label>
              <Input id="code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ประเภท</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PromoType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PromoTypeSchema.options.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === 'PERCENT' ? 'เปอร์เซ็นต์ (%)' : 'จำนวนเงิน (฿)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="value">มูลค่า</Label>
                <Input id="value" type="number" min={1} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="minOrder">ราคาขั้นต่ำ (บาท)</Label>
                <Input id="minOrder" type="number" min={0} value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maxUses">จำกัดจำนวนครั้ง</Label>
                <Input id="maxUses" type="number" min={1} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={create.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={onCreate} disabled={create.isPending}>
              {create.isPending ? 'กำลังสร้าง…' : 'สร้าง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>การใช้งานโค้ด {viewing}</DialogTitle>
            <DialogDescription>
              รายการงานที่ใช้โค้ดนี้ — ใครใช้ เมื่อไหร่ และส่วนลดที่ได้รับ
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่ใช้</TableHead>
                <TableHead>ลูกค้า</TableHead>
                <TableHead>งาน</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="text-right">ราคา</TableHead>
                <TableHead className="text-right">ส่วนลด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.data?.items.map((r) => (
                <TableRow key={r.jobId}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                  <TableCell>{r.customerName ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs">{r.jobId.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{JOB_STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.priceQuoted != null ? `฿${r.priceQuoted.toLocaleString()}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-destructive">
                    {r.discountAmount ? `-฿${r.discountAmount.toLocaleString()}` : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {usage.data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {usage.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีการใช้งาน'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {usage.data && (
            <Pager
              page={usage.data.page}
              pageSize={usage.data.pageSize}
              total={usage.data.total}
              onPage={setUsagePage}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
