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
  DisputeStatusSchema,
  DISPUTE_STATUS_LABEL,
  DISPUTE_REASON_LABEL,
  type DisputeDto,
  type DisputeStatus,
  type Paged,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

const ALL = 'ALL';

type DisputesResponse = Paged<DisputeDto>;

const STATUS_VARIANT: Record<DisputeStatus, 'secondary' | 'success' | 'destructive'> = {
  OPEN: 'secondary',
  RESOLVED: 'success',
  REJECTED: 'destructive',
};

export default function DisputesPage() {
  const queryClient = useQueryClient();
  const tbl = useTableState('createdAt');
  const [status, setStatus] = useState<DisputeStatus | typeof ALL>('OPEN');
  const [target, setTarget] = useState<{ dispute: DisputeDto; decision: 'RESOLVED' | 'REJECTED' } | null>(
    null,
  );
  const [resolution, setResolution] = useState('');
  const [refund, setRefund] = useState(false);

  const disputes = useQuery({
    queryKey: ['admin', 'disputes', status, tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<DisputesResponse> => {
      const query = {
        page: String(tbl.page),
        sortBy: tbl.sortBy,
        sortDir: tbl.sortDir,
        ...(status === ALL ? {} : { status }),
      };
      const res = await api.admin.disputes.$get({ query });
      if (!res.ok) throw new Error('โหลดข้อร้องเรียนไม่สำเร็จ');
      return (await res.json()) as DisputesResponse;
    },
  });

  const resolve = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const res = await api.admin.disputes[':id'].$patch({
        param: { id: target.dispute.id },
        json: {
          status: target.decision,
          ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
          ...(refund ? { refund: true } : {}),
        },
      });
      if (!res.ok) throw new Error('อัปเดตไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setTarget(null);
      setResolution('');
      setRefund(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] });
    },
  });

  const open = (dispute: DisputeDto, decision: 'RESOLVED' | 'REJECTED') => {
    setResolution('');
    setRefund(false);
    setTarget({ dispute, decision });
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">ข้อร้องเรียน</h1>
        <div className="w-full sm:w-48">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as DisputeStatus | typeof ALL);
              tbl.resetPage();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
              {DisputeStatusSchema.options.map((s) => (
                <SelectItem key={s} value={s}>
                  {DISPUTE_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <SortHead label="เหตุผล" col="reason" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>รายละเอียด</TableHead>
            <SortHead label="สถานะ" col="status" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <SortHead label="เมื่อ" col="createdAt" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {disputes.data?.items.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs">
                <Link href={`/jobs/${d.jobId}`} className="text-primary hover:underline">
                  {d.jobId.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell>{DISPUTE_REASON_LABEL[d.reason]}</TableCell>
              <TableCell className="max-w-48 truncate text-muted-foreground">
                {d.detail ?? '—'}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[d.status]}>{DISPUTE_STATUS_LABEL[d.status]}</Badge>
              </TableCell>
              <TableCell>{new Date(d.createdAt).toLocaleDateString('th-TH')}</TableCell>
              <TableCell className="space-x-2 text-right">
                {d.status === 'OPEN' ? (
                  <>
                    <Button size="sm" onClick={() => open(d, 'RESOLVED')}>
                      แก้ไขแล้ว
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => open(d, 'REJECTED')}>
                      ปฏิเสธ
                    </Button>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{d.resolution ?? '—'}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
          {disputes.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {disputes.isLoading ? 'กำลังโหลด…' : 'ไม่มีข้อร้องเรียน'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {disputes.data && (
        <Pager
          page={disputes.data.page}
          pageSize={disputes.data.pageSize}
          total={disputes.data.total}
          onPage={tbl.setPage}
        />
      )}

      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.decision === 'RESOLVED' ? 'ปิดข้อร้องเรียน (แก้ไขแล้ว)' : 'ปฏิเสธข้อร้องเรียน'}
            </DialogTitle>
            <DialogDescription>บันทึกผลการพิจารณา — จะถูกเก็บใน audit log</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="resolution">หมายเหตุการพิจารณา</Label>
              <Input
                id="resolution"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
              คืนเงิน (ตั้งธุรกรรมของงานนี้เป็น REFUNDED)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={resolve.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant={target?.decision === 'REJECTED' ? 'destructive' : 'default'}
              disabled={resolve.isPending}
              onClick={() => resolve.mutate()}
            >
              {resolve.isPending ? 'กำลังบันทึก…' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
