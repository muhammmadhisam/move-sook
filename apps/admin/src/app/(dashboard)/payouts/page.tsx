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
  PayoutStatusSchema,
  PAYOUT_STATUS_LABEL,
  type DriverDto,
  type Paged,
  type PayoutDto,
  type PayoutStatus,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';
import { ImageUpload } from '@/components/image-upload';

const ALL = 'ALL';
const baht = (n: number) => `฿${n.toLocaleString()}`;

type PayoutsResponse = Paged<PayoutDto>;

export default function PayoutsPage() {
  const queryClient = useQueryClient();
  const tbl = useTableState('createdAt');
  const [status, setStatus] = useState<PayoutStatus | typeof ALL>(ALL);
  const [creating, setCreating] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [paying, setPaying] = useState<PayoutDto | null>(null);
  const [reference, setReference] = useState('');
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payouts = useQuery({
    queryKey: ['admin', 'payouts', status, tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<PayoutsResponse> => {
      const query = {
        page: String(tbl.page),
        sortBy: tbl.sortBy,
        sortDir: tbl.sortDir,
        ...(status === ALL ? {} : { status }),
      };
      const res = await api.admin.payouts.$get({ query });
      if (!res.ok) throw new Error('โหลดรายการจ่ายเงินไม่สำเร็จ');
      return (await res.json()) as PayoutsResponse;
    },
  });

  const drivers = useQuery({
    queryKey: ['admin', 'drivers', 'APPROVED'],
    enabled: creating,
    queryFn: async (): Promise<{ items: DriverDto[] }> => {
      const res = await api.admin.drivers.$get({ query: { status: 'APPROVED' } });
      if (!res.ok) throw new Error('โหลดคนขับไม่สำเร็จ');
      return (await res.json()) as { items: DriverDto[] };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.admin.payouts.$post({ json: { driverId } });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'สร้างรอบจ่ายไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setCreating(false);
      setDriverId('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      if (!paying) return;
      const res = await api.admin.payouts[':id'].$patch({
        param: { id: paying.id },
        json: {
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          ...(slipUrl ? { slipUrl } : {}),
        },
      });
      if (!res.ok) throw new Error('อัปเดตไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setPaying(null);
      setReference('');
      setSlipUrl(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] });
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">ธุรกรรมกับคนขับ</h1>
          <p className="text-sm text-muted-foreground">
            รายการ<strong>ขึ้นอัตโนมัติเมื่อยืนยันส่งสำเร็จ</strong> (รวมยอดค้างจ่ายของคนขับแต่ละคนเป็นรอบเดียว) —
            กด <strong>“ทำเครื่องหมายจ่ายแล้ว”</strong> เพื่ออัปสลิป + เลขอ้างอิง · ปุ่ม “สร้างรอบจ่าย”
            ใช้กรณีอยากรวมยอดเพิ่มเอง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-40">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as PayoutStatus | typeof ALL);
                tbl.resetPage();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
                {PayoutStatusSchema.options.map((s) => (
                  <SelectItem key={s} value={s}>
                    {PAYOUT_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setError(null);
              setCreating(true);
            }}
          >
            + สร้างรอบจ่าย
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>คนขับ</TableHead>
            <SortHead label="ยอด" col="amount" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} className="text-right" />
            <TableHead className="text-right">จำนวนรายการ</TableHead>
            <SortHead label="สถานะ" col="status" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>อ้างอิง</TableHead>
            <SortHead label="สร้างเมื่อ" col="createdAt" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payouts.data?.items.map((p) => (
            <TableRow key={p.id}>
              <TableCell>{p.driverName ?? '—'}</TableCell>
              <TableCell className="text-right">{baht(p.amount)}</TableCell>
              <TableCell className="text-right">{p.transactionCount}</TableCell>
              <TableCell>
                <Badge variant={p.status === 'PAID' ? 'success' : 'secondary'}>
                  {PAYOUT_STATUS_LABEL[p.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {p.slipUrl ? (
                  <a
                    href={p.slipUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    ดูสลิป
                  </a>
                ) : (
                  (p.reference ?? '—')
                )}
              </TableCell>
              <TableCell>{new Date(p.createdAt).toLocaleDateString('th-TH')}</TableCell>
              <TableCell className="text-right">
                {p.status === 'PENDING' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setReference('');
                      setSlipUrl(null);
                      setPaying(p);
                    }}
                  >
                    ทำเครื่องหมายจ่ายแล้ว
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {payouts.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {payouts.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีรอบจ่าย'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {payouts.data && (
        <Pager
          page={payouts.data.page}
          pageSize={payouts.data.pageSize}
          total={payouts.data.total}
          onPage={tbl.setPage}
        />
      )}

      {/* Create payout run */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>สร้างรอบจ่ายเงิน</DialogTitle>
            <DialogDescription>
              รวมค่าคอมที่ยังค้างจ่าย (PENDING) ของคนขับที่เลือกเป็นหนึ่งรอบ
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>คนขับ</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="เลือกคนขับ" />
              </SelectTrigger>
              <SelectContent>
                {drivers.data?.items.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.displayName ?? d.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)} disabled={create.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !driverId}>
              {create.isPending ? 'กำลังสร้าง…' : 'สร้าง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark paid */}
      <Dialog open={paying !== null} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการจ่ายเงิน</DialogTitle>
            <DialogDescription>
              จ่าย {paying ? baht(paying.amount) : ''} ให้ {paying?.driverName ?? 'คนขับ'} — รายการคอมจะถูกตั้งเป็น PAID
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="ref">เลขอ้างอิงการโอน (ถ้ามี)</Label>
            <Input id="ref" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>สลิปการโอนเงิน (ถ้ามี)</Label>
            <ImageUpload
              value={slipUrl}
              label={slipUrl ? 'เปลี่ยนสลิป' : 'อัปโหลดสลิป'}
              onUploaded={setSlipUrl}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaying(null)} disabled={markPaid.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={() => markPaid.mutate()} disabled={markPaid.isPending}>
              {markPaid.isPending ? 'กำลังบันทึก…' : 'ยืนยันจ่ายแล้ว'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
