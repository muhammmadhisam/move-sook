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
  ProvinceSelect,
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
  DriverVerifyStatusSchema,
  VehicleTypeSchema,
  DRIVER_VERIFY_STATUS_LABEL,
  VEHICLE_TYPE_LABEL,
  type DriverDto,
  type DriverVerifyStatus,
  type Paged,
  type VehicleType,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

type DriversResponse = Paged<DriverDto>;

const STATUS_VARIANT: Record<
  DriverVerifyStatus,
  'default' | 'secondary' | 'destructive' | 'warning'
> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  SUSPENDED: 'warning',
};

type Decision = 'APPROVE' | 'REJECT' | 'SUSPEND';

export default function DriversPage() {
  const queryClient = useQueryClient();
  const t = useTableState('createdAt');
  const [status, setStatus] = useState<DriverVerifyStatus>('PENDING');
  const [reasonModal, setReasonModal] = useState<{
    driver: DriverDto;
    decision: 'REJECT' | 'SUSPEND';
  } | null>(null);
  const [reason, setReason] = useState('');

  // Admin-add-driver form.
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    vehicleType: 'PICKUP' as VehicleType,
    plateNumber: '',
    serviceProvince: '',
    verifyStatus: 'APPROVED' as 'PENDING' | 'APPROVED',
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null); // claim code shown after create
  const [copied, setCopied] = useState(false);

  const drivers = useQuery({
    queryKey: ['admin', 'drivers', status, t.page, t.sortBy, t.sortDir],
    queryFn: async (): Promise<DriversResponse> => {
      const res = await api.admin.drivers.$get({
        query: { status, page: String(t.page), sortBy: t.sortBy, sortDir: t.sortDir },
      });
      if (!res.ok) throw new Error('โหลดรายชื่อคนขับไม่สำเร็จ');
      return (await res.json()) as DriversResponse;
    },
  });

  const verify = useMutation({
    mutationFn: async (args: { id: string; decision: Decision; reason?: string }) => {
      const res = await api.admin.drivers[':id'].verify.$post({
        param: { id: args.id },
        json: { decision: args.decision, ...(args.reason ? { reason: args.reason } : {}) },
      });
      if (!res.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setReasonModal(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    },
  });

  const createDriver = useMutation({
    mutationFn: async () => {
      const res = await api.admin.drivers.$post({
        json: {
          name: form.name.trim(),
          vehicleType: form.vehicleType,
          verifyStatus: form.verifyStatus,
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.plateNumber.trim() ? { plateNumber: form.plateNumber.trim() } : {}),
          ...(form.serviceProvince ? { serviceProvince: form.serviceProvince } : {}),
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'เพิ่มคนขับไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: (data) => {
      // Keep the dialog open to reveal the invite code for the admin to hand over.
      setNewCode((data as { claimCode?: string }).claimCode ?? null);
      setCopied(false);
      setForm({
        name: '',
        phone: '',
        vehicleType: 'PICKUP',
        plateNumber: '',
        serviceProvince: '',
        verifyStatus: 'APPROVED',
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'drivers'] });
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const closeCreate = () => {
    setCreating(false);
    setNewCode(null);
    setCreateError(null);
  };

  const onCreate = () => {
    setCreateError(null);
    if (form.name.trim().length < 1) {
      setCreateError('กรอกชื่อคนขับ');
      return;
    }
    createDriver.mutate();
  };

  const openReason = (driver: DriverDto, decision: 'REJECT' | 'SUSPEND') => {
    setReason('');
    setReasonModal({ driver, decision });
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">จัดการคนขับ</h1>
        <div className="flex items-center gap-3">
          <div className="w-48">
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v as DriverVerifyStatus);
                t.resetPage();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DriverVerifyStatusSchema.options.map((s) => (
                  <SelectItem key={s} value={s}>
                    {DRIVER_VERIFY_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setCreateError(null);
              setCreating(true);
            }}
          >
            + เพิ่มคนขับ
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <TableHead>ประเภทรถ</TableHead>
            <TableHead>ทะเบียน</TableHead>
            <SortHead label="จังหวัดที่ให้บริการ" col="serviceProvince" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <SortHead label="เรตติ้ง" col="ratingAvg" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <SortHead label="สถานะ" col="verifyStatus" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {drivers.data?.items.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                <Link
                  href={`/drivers/${d.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {d.displayName ?? '—'}
                </Link>
              </TableCell>
              <TableCell>{VEHICLE_TYPE_LABEL[d.vehicleType]}</TableCell>
              <TableCell>{d.plateNumber ?? '—'}</TableCell>
              <TableCell>{d.serviceProvince ?? '—'}</TableCell>
              <TableCell>
                {d.ratingCount > 0 ? `${d.ratingAvg.toFixed(1)} (${d.ratingCount})` : '—'}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[d.verifyStatus]}>
                  {DRIVER_VERIFY_STATUS_LABEL[d.verifyStatus]}
                </Badge>
              </TableCell>
              <TableCell className="space-x-2 text-right">
                {d.verifyStatus !== 'APPROVED' && (
                  <Button
                    size="sm"
                    disabled={verify.isPending}
                    onClick={() => verify.mutate({ id: d.id, decision: 'APPROVE' })}
                  >
                    อนุมัติ
                  </Button>
                )}
                {d.verifyStatus === 'PENDING' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={verify.isPending}
                    onClick={() => openReason(d, 'REJECT')}
                  >
                    ปฏิเสธ
                  </Button>
                )}
                {d.verifyStatus === 'APPROVED' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={verify.isPending}
                    onClick={() => openReason(d, 'SUSPEND')}
                  >
                    ระงับ
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {drivers.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                {drivers.isLoading ? 'กำลังโหลด…' : 'ไม่มีคนขับในสถานะนี้'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {drivers.data && (
        <Pager
          page={drivers.data.page}
          pageSize={drivers.data.pageSize}
          total={drivers.data.total}
          onPage={t.setPage}
        />
      )}

      <Dialog open={reasonModal !== null} onOpenChange={(open) => !open && setReasonModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reasonModal?.decision === 'REJECT' ? 'ปฏิเสธคนขับ' : 'ระงับคนขับ'}
            </DialogTitle>
            <DialogDescription>
              {reasonModal?.decision === 'REJECT'
                ? `ปฏิเสธ “${reasonModal?.driver.displayName ?? reasonModal?.driver.id}” — ระบุเหตุผล (คนขับจะเห็น)`
                : `ระงับ “${reasonModal?.driver.displayName ?? reasonModal?.driver.id}” ชั่วคราว — คนขับจะรับงานไม่ได้`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">เหตุผล</Label>
            <Input
              id="reason"
              value={reason}
              maxLength={500}
              placeholder="เช่น เอกสารไม่ชัด / มีข้อร้องเรียน"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReasonModal(null)}
              disabled={verify.isPending}
            >
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={verify.isPending}
              onClick={() =>
                reasonModal &&
                verify.mutate({
                  id: reasonModal.driver.id,
                  decision: reasonModal.decision,
                  reason: reason.trim() || undefined,
                })
              }
            >
              {verify.isPending
                ? 'กำลังบันทึก…'
                : reasonModal?.decision === 'REJECT'
                  ? 'ปฏิเสธ'
                  : 'ระงับ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin adds a driver (no app account yet) */}
      <Dialog open={creating} onOpenChange={(open) => (open ? setCreating(true) : closeCreate())}>
        <DialogContent>
          {newCode ? (
            <>
              <DialogHeader>
                <DialogTitle>สร้างใบสมัครแล้ว</DialogTitle>
                <DialogDescription>
                  ส่งโค้ดเชิญนี้ให้คนขับ เพื่อนำไปกรอกในแอปและกรอกข้อมูลเพิ่มเติม
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg border bg-muted/40 p-4 text-center">
                  <p className="text-xs text-muted-foreground">โค้ดเชิญคนขับ</p>
                  <p className="font-mono text-2xl font-bold tracking-widest">{newCode}</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard?.writeText(newCode);
                    setCopied(true);
                  }}
                >
                  {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกโค้ด'}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeCreate}>เสร็จสิ้น</Button>
              </DialogFooter>
            </>
          ) : (
            <>
          <DialogHeader>
            <DialogTitle>เพิ่มคนขับ</DialogTitle>
            <DialogDescription>
              ลงทะเบียนคนขับล่วงหน้า (ยังไม่มีบัญชีแอป) — เชื่อมกับผู้ใช้ภายหลังได้เมื่อคนขับสมัคร
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="dname">ชื่อ *</Label>
              <Input
                id="dname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dphone">เบอร์โทร</Label>
              <Input
                id="dphone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ประเภทรถ</Label>
                <Select
                  value={form.vehicleType}
                  onValueChange={(v) => setForm({ ...form, vehicleType: v as VehicleType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VehicleTypeSchema.options.map((v) => (
                      <SelectItem key={v} value={v}>
                        {VEHICLE_TYPE_LABEL[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dplate">ทะเบียน</Label>
                <Input
                  id="dplate"
                  value={form.plateNumber}
                  onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>จังหวัดที่ให้บริการ</Label>
              <ProvinceSelect
                value={form.serviceProvince}
                onChange={(v) => setForm({ ...form, serviceProvince: v })}
              />
            </div>
            <div className="space-y-1">
              <Label>สถานะเริ่มต้น</Label>
              <Select
                value={form.verifyStatus}
                onValueChange={(v) => setForm({ ...form, verifyStatus: v as 'PENDING' | 'APPROVED' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPROVED">{DRIVER_VERIFY_STATUS_LABEL.APPROVED} (พร้อมรับงาน)</SelectItem>
                  <SelectItem value="PENDING">{DRIVER_VERIFY_STATUS_LABEL.PENDING}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate} disabled={createDriver.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={onCreate} disabled={createDriver.isPending}>
              {createDriver.isPending ? 'กำลังบันทึก…' : 'เพิ่มคนขับ'}
            </Button>
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
