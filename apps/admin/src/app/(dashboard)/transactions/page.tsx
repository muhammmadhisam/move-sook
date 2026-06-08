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

type TxnResponse = Paged<TransactionDto>;

const STATUS_VARIANT: Record<TransactionStatus, 'default' | 'secondary' | 'destructive'> = {
  PENDING: 'secondary',
  PAID: 'default',
  REFUNDED: 'destructive',
};

const baht = (n: number) => `฿${n.toLocaleString()}`;

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const tbl = useTableState('createdAt');
  const [status, setStatus] = useState<TransactionStatus | typeof ALL>(ALL);
  const [action, setAction] = useState<{ txn: TransactionDto; to: 'PAID' | 'REFUNDED' } | null>(
    null,
  );
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  const txns = useQuery({
    queryKey: ['admin', 'transactions', status, tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<TxnResponse> => {
      const query = {
        page: String(tbl.page),
        sortBy: tbl.sortBy,
        sortDir: tbl.sortDir,
        ...(status === ALL ? {} : { status }),
      };
      const res = await api.admin.transactions.$get({ query });
      if (!res.ok) throw new Error('โหลดรายการธุรกรรมไม่สำเร็จ');
      return (await res.json()) as TxnResponse;
    },
  });

  const update = useMutation({
    mutationFn: async (args: {
      id: string;
      status: 'PENDING' | 'PAID' | 'REFUNDED';
      slipUrl?: string | null;
    }) => {
      const res = await api.admin.transactions[':id'].$patch({
        param: { id: args.id },
        json: { status: args.status, ...(args.slipUrl ? { slipUrl: args.slipUrl } : {}) },
      });
      if (!res.ok) throw new Error('อัปเดตธุรกรรมไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setAction(null);
      setSlipUrl(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'] });
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">ธุรกรรมกับลูกค้า</h1>
          <p className="text-sm text-muted-foreground">
            บันทึก<strong>อัตโนมัติเมื่อยืนยันส่งสำเร็จ</strong> — ค่างาน (ลูกค้าจ่าย), ส่วนแบ่งคอมมิชชั่น
            และ<strong>ยอดสุทธิที่คนขับจะได้รับ (net)</strong> สถานะ PENDING = ยังไม่ได้จ่ายคนขับ
            (ไปจ่ายจริงที่หน้า “ธุรกรรมกับคนขับ”)
          </p>
        </div>
        <div className="w-full sm:w-48">
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
            <TableHead>Job ID</TableHead>
            <SortHead label="ยอดรวม" col="grossAmount" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} className="text-right" />
            <TableHead className="text-right">คอม %</TableHead>
            <TableHead className="text-right">ยอดคอม</TableHead>
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
              <TableCell className="text-right">{baht(t.grossAmount)}</TableCell>
              <TableCell className="text-right">{t.commissionPct}%</TableCell>
              <TableCell className="text-right">{baht(t.commissionAmount)}</TableCell>
              <TableCell className="text-right">{baht(t.netToDriver)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[t.status]}>{TRANSACTION_STATUS_LABEL[t.status]}</Badge>
              </TableCell>
              <TableCell>
                {t.slipUrl ? (
                  <a
                    href={t.slipUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    ดูสลิป
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{new Date(t.createdAt).toLocaleDateString('th-TH')}</TableCell>
              <TableCell className="space-x-2 text-right">
                {t.status !== 'PAID' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSlipUrl(t.slipUrl);
                      setAction({ txn: t, to: 'PAID' });
                    }}
                  >
                    จ่ายแล้ว
                  </Button>
                )}
                {t.status !== 'REFUNDED' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setSlipUrl(t.slipUrl);
                      setAction({ txn: t, to: 'REFUNDED' });
                    }}
                  >
                    คืนเงิน
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {txns.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {txns.isLoading ? 'กำลังโหลด…' : 'ไม่พบธุรกรรม'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {txns.data && (
        <Pager
          page={txns.data.page}
          pageSize={txns.data.pageSize}
          total={txns.data.total}
          onPage={tbl.setPage}
        />
      )}

      <Dialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.to === 'PAID' ? 'ยืนยันการจ่ายเงิน' : 'ยืนยันการคืนเงิน'}
            </DialogTitle>
            <DialogDescription>
              {action?.to === 'PAID'
                ? `ทำเครื่องหมายว่าจ่ายคนขับแล้ว ${action ? baht(action.txn.netToDriver) : ''}?`
                : 'ทำเครื่องหมายว่าธุรกรรมนี้ถูกคืนเงิน?'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>สลิปการโอน (ถ้ามี)</Label>
            <ImageUpload value={slipUrl} onUploaded={setSlipUrl} label="อัปโหลดสลิป" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)} disabled={update.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant={action?.to === 'REFUNDED' ? 'destructive' : 'default'}
              disabled={update.isPending}
              onClick={() =>
                action && update.mutate({ id: action.txn.id, status: action.to, slipUrl })
              }
            >
              {update.isPending ? 'กำลังบันทึก…' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
