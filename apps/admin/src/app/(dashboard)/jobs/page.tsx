'use client';

import { useEffect, useState } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movesook/ui';
import {
  JobStatusSchema,
  JOB_STATUS_LABEL,
  VEHICLE_TYPE_LABEL,
  type AdminJobListItem,
  type JobDto,
  type JobStatus,
  type Paged,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

const ALL = 'ALL';

type JobsResponse = Paged<AdminJobListItem>;

export default function JobsMonitorPage() {
  const queryClient = useQueryClient();
  const t = useTableState('createdAt');
  const [status, setStatus] = useState<JobStatus | typeof ALL>(ALL);
  const [editing, setEditing] = useState<JobDto | null>(null);
  const [nextStatus, setNextStatus] = useState<JobStatus>('POSTED');
  const [price, setPrice] = useState('');
  const [unassign, setUnassign] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const jobs = useQuery({
    queryKey: ['admin', 'jobs', status, t.page, t.sortBy, t.sortDir],
    queryFn: async (): Promise<JobsResponse> => {
      const query = {
        page: String(t.page),
        sortBy: t.sortBy,
        sortDir: t.sortDir,
        ...(status === ALL ? {} : { status }),
      };
      const res = await api.admin.jobs.$get({ query });
      if (!res.ok) throw new Error('โหลดงานไม่สำเร็จ');
      return (await res.json()) as JobsResponse;
    },
  });

  const patch = useMutation({
    mutationFn: async (args: {
      id: string;
      status?: JobStatus;
      driverId?: string | null;
      priceQuoted?: number | null;
    }) => {
      const { id, ...json } = args;
      const res = await api.admin.jobs[':id'].$patch({ param: { id }, json });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'แทรกแซงงานไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  // Seed dialog fields from the selected job.
  useEffect(() => {
    if (editing) {
      setNextStatus(editing.status);
      setPrice(editing.priceQuoted != null ? String(editing.priceQuoted) : '');
      setUnassign(false);
      setError(null);
    }
  }, [editing]);

  const onSubmit = () => {
    if (!editing) return;
    setError(null);
    const json: { id: string; status?: JobStatus; driverId?: null; priceQuoted?: number } = {
      id: editing.id,
    };
    if (nextStatus !== editing.status) json.status = nextStatus;
    if (unassign && editing.driverId) json.driverId = null;
    const trimmed = price.trim();
    if (trimmed !== '' && String(editing.priceQuoted ?? '') !== trimmed) {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n <= 0) {
        setError('ราคาต้องเป็นจำนวนเต็มบวก');
        return;
      }
      json.priceQuoted = n;
    }
    if (json.status === undefined && json.driverId === undefined && json.priceQuoted === undefined) {
      setError('ยังไม่มีการเปลี่ยนแปลง');
      return;
    }
    patch.mutate(json);
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">ติดตามงาน</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-48">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as JobStatus | typeof ALL);
                t.resetPage();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
                {JobStatusSchema.options.map((s) => (
                  <SelectItem key={s} value={s}>
                    {JOB_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button asChild>
            <Link href="/jobs/new">+ สร้างงาน</Link>
          </Button>
        </div>
      </div>

      {/* Surfaces row-action errors (e.g. confirm blocked: no price/driver) when no dialog is open. */}
      {error && !editing && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รายการ</TableHead>
            <TableHead>ลูกค้า</TableHead>
            <TableHead>เส้นทาง</TableHead>
            <TableHead>รถ</TableHead>
            <SortHead label="ราคา" col="priceQuoted" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <TableHead>คนขับ</TableHead>
            <SortHead label="สถานะ" col="status" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.data?.items.map((j) => (
            <TableRow key={j.id}>
              <TableCell className="max-w-48 truncate">
                <Link href={`/jobs/${j.id}`} className="text-primary hover:underline">
                  {j.itemDescription}
                </Link>
              </TableCell>
              <TableCell>
                {j.customerName ?? '—'}
                {j.createdByAdminId && (
                  <Badge variant="outline" className="ml-1">
                    admin
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {j.originProvince} → {j.destProvince}
              </TableCell>
              <TableCell>{VEHICLE_TYPE_LABEL[j.vehicleType]}</TableCell>
              <TableCell>{j.priceQuoted ? `฿${j.priceQuoted.toLocaleString()}` : '—'}</TableCell>
              <TableCell>
                {j.driverId ? (
                  <Badge variant="success">มอบหมายแล้ว</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    j.status === 'CANCELLED'
                      ? 'destructive'
                      : j.status === 'PENDING_CONFIRMATION'
                        ? 'warning'
                        : j.status === 'DELIVERED'
                          ? 'success'
                          : 'secondary'
                  }
                >
                  {JOB_STATUS_LABEL[j.status]}
                </Badge>
                {j.status === 'PENDING_CONFIRMATION' && (
                  <p
                    className={
                      j.customerConfirmedAt
                        ? 'mt-1 text-xs font-medium text-successScale-600'
                        : 'mt-1 text-xs text-muted-foreground'
                    }
                  >
                    {j.customerConfirmedAt ? '✓ ลูกค้ายืนยันแล้ว' : '• ลูกค้ายังไม่ยืนยัน'}
                  </p>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  {j.status === 'PENDING_CONFIRMATION' && (
                    <Button
                      size="sm"
                      className="bg-successScale-600 text-white hover:bg-successScale-700"
                      disabled={patch.isPending}
                      title={j.priceQuoted == null ? 'ต้องระบุราคางานก่อน จึงจะสร้างธุรกรรมได้' : undefined}
                      // Confirming creates the driver's commission transaction. If the
                      // job has no price yet, open the dialog to set it first.
                      onClick={() =>
                        j.priceQuoted == null
                          ? setEditing(j)
                          : patch.mutate({ id: j.id, status: 'DELIVERED' })
                      }
                    >
                      ยืนยันส่งสำเร็จ
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setEditing(j)}>
                    จัดการ
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {jobs.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {jobs.isLoading ? 'กำลังโหลด…' : 'ไม่พบงาน'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {jobs.data && (
        <Pager
          page={jobs.data.page}
          pageSize={jobs.data.pageSize}
          total={jobs.data.total}
          onPage={t.setPage}
        />
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>แทรกแซงงาน</DialogTitle>
            <DialogDescription className="truncate">
              {editing?.itemDescription} · {editing?.originProvince} → {editing?.destProvince}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>สถานะ</Label>
              <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as JobStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JobStatusSchema.options.map((s) => (
                    <SelectItem key={s} value={s}>
                      {JOB_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                อนุญาตเฉพาะการเปลี่ยนสถานะที่ถูกต้องตาม state machine
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="job-price">ราคา (บาท)</Label>
              <Input
                id="job-price"
                type="number"
                min={1}
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>

            {editing?.driverId && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={unassign}
                  onChange={(e) => setUnassign(e.target.checked)}
                />
                ปลดคนขับออกจากงานนี้
              </label>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={patch.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={onSubmit} disabled={patch.isPending}>
              {patch.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
