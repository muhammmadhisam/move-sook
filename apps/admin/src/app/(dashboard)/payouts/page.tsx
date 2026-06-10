'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  TransactionStatusSchema,
  TRANSACTION_STATUS_LABEL,
  type Paged,
  type TransactionDto,
  type TransactionStatus,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';
import { ImageUpload } from '@/components/image-upload';

const ALL = 'ALL';
const baht = (n: number) => `฿${n.toLocaleString()}`;

type TxnResponse = Paged<TransactionDto>;

const STATUS_VARIANT: Record<TransactionStatus, 'secondary' | 'success' | 'destructive'> = {
  PENDING: 'secondary',
  PAID: 'success',
  REFUNDED: 'destructive',
};

/**
 * "ธุรกรรมกับคนขับ" — money OUT to drivers, ONE row per delivered job (a
 * commission-ledger Transaction). Admin pays each job and attaches a slip.
 */
export default function PayoutsPage() {
  const queryClient = useQueryClient();
  const tbl = useTableState('createdAt');
  const [status, setStatus] = useState<TransactionStatus | typeof ALL>(ALL);
  const [paying, setPaying] = useState<TransactionDto | null>(null);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  const txns = useQuery({
    queryKey: ['admin', 'payouts', 'txns', status, tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<TxnResponse> => {
      const res = await api.admin.transactions.$get({
        query: {
          page: String(tbl.page),
          sortBy: tbl.sortBy,
          sortDir: tbl.sortDir,
          ...(status === ALL ? {} : { status }),
        },
      });
      if (!res.ok) throw new Error('โหลดรายการจ่ายเงินไม่สำเร็จ');
      return (await res.json()) as TxnResponse;
    },
  });

  const markPaid = useMutation({
    mutationFn: async (args: { id: string; slipUrl?: string | null }) => {
      const res = await api.admin.transactions[':id'].$patch({
        param: { id: args.id },
        json: { status: 'PAID', ...(args.slipUrl ? { slipUrl: args.slipUrl } : {}) },
      });
      if (!res.ok) throw new Error('อัปเดตไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      toast.success('ทำเครื่องหมายจ่ายค่างานแล้ว');
      setPaying(null);
      setSlipUrl(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">ธุรกรรมกับคนขับ</h1>
          <p className="text-sm text-muted-foreground">
            จ่ายค่างานให้คนขับ <strong>ราย งาน</strong> — 1 งานที่ส่งสำเร็จ = 1 รายการ · กด
            “จ่ายแล้ว” แล้วแนบสลิปการโอน
          </p>
        </div>
        <div className="w-full sm:w-44">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as TransactionStatus | typeof ALL);
              tbl.resetPage();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
              {TransactionStatusSchema.options.map((s) => (
                <SelectItem key={s} value={s}>
                  {TRANSACTION_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>งาน (Job ID)</TableHead>
            <TableHead>คนขับ</TableHead>
            <SortHead label="ยอดรวม" col="grossAmount" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} className="text-right" />
            <TableHead className="text-right">ค่าคอม</TableHead>
            <SortHead label="จ่ายคนขับ" col="netToDriver" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} className="text-right" />
            <SortHead label="สถานะ" col="status" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>สลิป</TableHead>
            <SortHead label="วันที่" col="createdAt" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {txns.data?.items.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-mono text-xs">
                <Link href={`/jobs/${t.jobId}`} className="text-primary hover:underline">
                  {t.jobId.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell>{t.driverName ?? '—'}</TableCell>
              <TableCell className="text-right">{baht(t.grossAmount)}</TableCell>
              <TableCell className="text-right text-muted-foreground">{baht(t.commissionAmount)}</TableCell>
              <TableCell className="text-right font-medium">{baht(t.netToDriver)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[t.status]}>{TRANSACTION_STATUS_LABEL[t.status]}</Badge>
              </TableCell>
              <TableCell>
                {t.slipUrl ? (
                  <a href={t.slipUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    ดูสลิป
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{new Date(t.createdAt).toLocaleDateString('th-TH')}</TableCell>
              <TableCell className="text-right">
                {t.status === 'PENDING' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSlipUrl(t.slipUrl);
                      setPaying(t);
                    }}
                  >
                    จ่ายแล้ว
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {txns.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {txns.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีรายการ'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {txns.data && (
        <Pager page={txns.data.page} pageSize={txns.data.pageSize} total={txns.data.total} onPage={tbl.setPage} />
      )}

      <Dialog open={paying !== null} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการจ่ายค่างาน</DialogTitle>
            <DialogDescription>
              จ่าย {paying ? baht(paying.netToDriver) : ''} ให้ {paying?.driverName ?? 'คนขับ'} (งาน{' '}
              {paying?.jobId.slice(0, 8)})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>สลิปการโอน (ถ้ามี)</Label>
            <ImageUpload value={slipUrl} onUploaded={setSlipUrl} label="อัปโหลดสลิป" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaying(null)} disabled={markPaid.isPending}>
              ยกเลิก
            </Button>
            <Button
              disabled={markPaid.isPending}
              onClick={() => paying && markPaid.mutate({ id: paying.id, slipUrl })}
            >
              {markPaid.isPending ? 'กำลังบันทึก…' : 'ยืนยันจ่ายแล้ว'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
