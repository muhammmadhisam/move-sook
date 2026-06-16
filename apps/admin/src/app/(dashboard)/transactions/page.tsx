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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@movesook/ui';
import type { Paged, TransactionDto } from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';
import { ImageUpload } from '@/components/image-upload';

type TxnResponse = Paged<TransactionDto>;

const baht = (n: number) => `฿${n.toLocaleString()}`;

/**
 * "ธุรกรรมกับลูกค้า" — money IN from customers, one row per delivered job:
 * what the customer paid (gross), the platform commission, and whether the
 * customer's transfer was approved. Paying the driver lives on /payouts.
 */
export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const tbl = useTableState('createdAt');
  const [refunding, setRefunding] = useState<TransactionDto | null>(null);
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  const txns = useQuery({
    queryKey: ['admin', 'transactions', tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<TxnResponse> => {
      const res = await api.admin.transactions.$get({
        query: { page: String(tbl.page), sortBy: tbl.sortBy, sortDir: tbl.sortDir },
      });
      if (!res.ok) throw new Error('โหลดรายการธุรกรรมไม่สำเร็จ');
      return (await res.json()) as TxnResponse;
    },
  });

  const refund = useMutation({
    mutationFn: async (args: { id: string; slipUrl?: string | null }) => {
      const res = await api.admin.transactions[':id'].$patch({
        param: { id: args.id },
        json: { status: 'REFUNDED', ...(args.slipUrl ? { slipUrl: args.slipUrl } : {}) },
      });
      if (!res.ok) throw new Error('อัปเดตธุรกรรมไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      toast.success('ทำเครื่องหมายคืนเงินลูกค้าแล้ว');
      setRefunding(null);
      setSlipUrl(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">ธุรกรรมกับลูกค้า</h1>
        <p className="text-sm text-muted-foreground">
          เงินที่ลูกค้าจ่ายให้องค์กร (ค่างาน + ส่วนแบ่งคอมมิชชั่น) ต่อหนึ่งงานที่จบ ·
          การจ่ายเงินให้คนขับดูที่หน้า “ธุรกรรมกับคนขับ”
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job ID</TableHead>
            <SortHead label="ยอดลูกค้าจ่าย" col="grossAmount" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} className="text-right" />
            <TableHead className="text-right">คอม %</TableHead>
            <TableHead className="text-right">ค่าคอมบริษัท</TableHead>
            <TableHead>ลูกค้าชำระ</TableHead>
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
              <TableCell className="text-right font-medium">{baht(t.grossAmount)}</TableCell>
              <TableCell className="text-right">{t.commissionPct}%</TableCell>
              <TableCell className="text-right">{baht(t.commissionAmount)}</TableCell>
              <TableCell>
                {t.status === 'REFUNDED' ? (
                  <Badge variant="destructive">คืนเงินแล้ว</Badge>
                ) : t.customerPaidAt ? (
                  <span className="text-xs font-medium text-successScale-600">
                    ✓ ชำระแล้ว
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {new Date(t.customerPaidAt).toLocaleDateString('th-TH')}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {t.customerSlipUrl ? (
                  <a
                    href={t.customerSlipUrl}
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
              <TableCell className="text-right">
                {t.status !== 'REFUNDED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSlipUrl(null);
                      setRefunding(t);
                    }}
                  >
                    คืนเงินลูกค้า
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {txns.isLoading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                กำลังโหลด…
              </TableCell>
            </TableRow>
          )}
          {txns.isError && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-destructive">
                {(txns.error as Error)?.message ?? 'โหลดรายการธุรกรรมไม่สำเร็จ'}
              </TableCell>
            </TableRow>
          )}
          {txns.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                ไม่พบธุรกรรม
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

      <Dialog open={refunding !== null} onOpenChange={(open) => !open && setRefunding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยืนยันการคืนเงินลูกค้า</DialogTitle>
            <DialogDescription>
              คืนเงินงานนี้ให้ลูกค้า {refunding ? baht(refunding.grossAmount) : ''}? (คนขับจะไม่ได้รับเงินจากงานนี้)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>สลิปการคืนเงิน (ถ้ามี)</Label>
            <ImageUpload value={slipUrl} onUploaded={setSlipUrl} label="อัปโหลดสลิป" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefunding(null)} disabled={refund.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={refund.isPending}
              onClick={() => refunding && refund.mutate({ id: refunding.id, slipUrl })}
            >
              {refund.isPending ? 'กำลังบันทึก…' : 'ยืนยันคืนเงิน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
