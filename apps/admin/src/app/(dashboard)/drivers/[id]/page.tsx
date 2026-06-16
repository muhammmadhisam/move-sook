'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import {
  DRIVER_SCREENING_QUESTIONS,
  DRIVER_VERIFY_STATUS_LABEL,
  GENDER_LABEL,
  JOB_STATUS_LABEL,
  ROLE_LABEL,
  VEHICLE_TYPE_LABEL,
  type AdminDriverDetailResponse,
  type AdminUserListItem,
  type DriverVerifyStatus,
} from '@movesook/shared';
import { api } from '@/lib/api';

const STATUS_VARIANT: Record<
  DriverVerifyStatus,
  'default' | 'secondary' | 'destructive' | 'warning'
> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  SUSPENDED: 'warning',
};

const baht = (n: number) => `฿${n.toLocaleString()}`;
const isUrl = (s: string) => /^https?:\/\//i.test(s);
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
function expiry(iso: string | null): { text: string; warn: boolean; expired: boolean } {
  if (!iso) return { text: '—', warn: false, expired: false };
  const d = new Date(iso);
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const ds = d.toLocaleDateString('th-TH');
  if (days < 0) return { text: `${ds} (หมดอายุ)`, warn: false, expired: true };
  if (days <= 30) return { text: `${ds} (อีก ${days} วัน)`, warn: true, expired: false };
  return { text: ds, warn: false, expired: false };
}

export default function DriverDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [reasonModal, setReasonModal] = useState<'REJECT' | 'SUSPEND' | null>(null);
  const [reason, setReason] = useState('');
  const [bankOpen, setBankOpen] = useState(false);
  const [bankName, setBankName] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [kycOpen, setKycOpen] = useState(false);
  const [kyc, setKyc] = useState({
    nationalId: '',
    licenseNo: '',
    licenseExpiry: '',
    vehicleRegExpiry: '',
    insuranceExpiry: '',
  });
  const [connectOpen, setConnectOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['admin', 'driver', id],
    queryFn: async (): Promise<AdminDriverDetailResponse> => {
      const res = await api.admin.drivers[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('โหลดข้อมูลคนขับไม่สำเร็จ');
      return (await res.json()) as AdminDriverDetailResponse;
    },
  });

  const verify = useMutation({
    mutationFn: async (args: { decision: 'APPROVE' | 'REJECT' | 'SUSPEND'; reason?: string }) => {
      const res = await api.admin.drivers[':id'].verify.$post({
        param: { id },
        json: { decision: args.decision, ...(args.reason ? { reason: args.reason } : {}) },
      });
      if (!res.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setReasonModal(null);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'driver', id] });
    },
  });

  const saveBank = useMutation({
    mutationFn: async () => {
      const res = await api.admin.drivers[':id'].bank.$patch({
        param: { id },
        json: {
          bankName: bankName.trim() || null,
          bankAccountName: bankAccountName.trim() || null,
          bankAccountNo: bankAccountNo.trim() || null,
        },
      });
      if (!res.ok) throw new Error('บันทึกบัญชีไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setBankOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'driver', id] });
    },
  });

  const saveKyc = useMutation({
    mutationFn: async () => {
      const res = await api.admin.drivers[':id'].kyc.$patch({
        param: { id },
        json: {
          nationalId: kyc.nationalId.trim() || null,
          licenseNo: kyc.licenseNo.trim() || null,
          licenseExpiry: kyc.licenseExpiry ? new Date(kyc.licenseExpiry) : null,
          vehicleRegExpiry: kyc.vehicleRegExpiry ? new Date(kyc.vehicleRegExpiry) : null,
          insuranceExpiry: kyc.insuranceExpiry ? new Date(kyc.insuranceExpiry) : null,
        },
      });
      if (!res.ok) throw new Error('บันทึก KYC ไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setKycOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'driver', id] });
    },
  });

  const userResults = useQuery({
    queryKey: ['admin', 'users', 'connect', userSearch.trim()],
    enabled: connectOpen && userSearch.trim().length > 0,
    queryFn: async (): Promise<{ items: AdminUserListItem[] }> => {
      const res = await api.admin.users.$get({ query: { search: userSearch.trim() } });
      if (!res.ok) throw new Error('ค้นหาผู้ใช้ไม่สำเร็จ');
      return (await res.json()) as { items: AdminUserListItem[] };
    },
  });

  const connect = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.admin.drivers[':id'].connect.$post({
        param: { id },
        json: { userId },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'เชื่อมบัญชีไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setConnectOpen(false);
      setUserSearch('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'driver', id] });
    },
    onError: (e: Error) => setConnectError(e.message),
  });

  if (detail.isLoading) return <p className="text-sm text-muted-foreground">กำลังโหลด…</p>;
  if (!detail.data) return <p className="text-sm text-destructive">ไม่พบคนขับ</p>;

  const { driver, recentJobs, reviews, earnings } = detail.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/drivers" className="text-sm text-muted-foreground hover:underline">
            ← กลับ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{driver.displayName ?? 'คนขับ'}</h1>
        </div>
        <div className="space-x-2">
          {driver.verifyStatus !== 'APPROVED' && (
            <Button disabled={verify.isPending} onClick={() => verify.mutate({ decision: 'APPROVE' })}>
              อนุมัติ
            </Button>
          )}
          {driver.verifyStatus === 'PENDING' && (
            <Button
              variant="destructive"
              disabled={verify.isPending}
              onClick={() => setReasonModal('REJECT')}
            >
              ปฏิเสธ
            </Button>
          )}
          {driver.verifyStatus === 'APPROVED' && (
            <Button
              variant="destructive"
              disabled={verify.isPending}
              onClick={() => setReasonModal('SUSPEND')}
            >
              ระงับ
            </Button>
          )}
        </div>
      </div>

      {!driver.userId && (
        <div className="flex items-center justify-between rounded-lg border border-warningScale-200 bg-warningScale-50 px-4 py-3 text-sm text-warningScale-700">
          <span>คนขับนี้ยังไม่ได้เชื่อมกับบัญชีแอป (admin เพิ่มไว้) — เชื่อมเมื่อคนขับสมัครแล้ว</span>
          <Button
            size="sm"
            onClick={() => {
              setConnectError(null);
              setUserSearch('');
              setConnectOpen(true);
            }}
          >
            เชื่อมกับผู้ใช้
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลคนขับ</CardTitle>
            <CardDescription>
              <Badge variant={STATUS_VARIANT[driver.verifyStatus]}>
                {DRIVER_VERIFY_STATUS_LABEL[driver.verifyStatus]}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>ประเภทรถ: {VEHICLE_TYPE_LABEL[driver.vehicleType]}</p>
            <p>ทะเบียน: {driver.plateNumber ?? '—'}</p>
            <p>จังหวัดบริการ: {driver.serviceProvince ?? '—'}</p>
            <p>ออนไลน์: {driver.isAvailable ? 'ใช่' : 'ไม่'}</p>
            <p>
              เรตติ้ง:{' '}
              {driver.ratingCount > 0
                ? `${driver.ratingAvg.toFixed(1)} (${driver.ratingCount} รีวิว)`
                : '—'}
            </p>
            <p>
              เอกสาร ท.2:{' '}
              {driver.licenseTw2 ? (
                isUrl(driver.licenseTw2) ? (
                  <a
                    href={driver.licenseTw2}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    ดูเอกสาร
                  </a>
                ) : (
                  driver.licenseTw2
                )
              ) : (
                '—'
              )}
            </p>
            {driver.rejectionReason && (
              <p className="text-destructive">เหตุผลปฏิเสธ/ระงับ: {driver.rejectionReason}</p>
            )}
            {driver.appealMessage && (
              <div className="rounded-lg border border-warning/50 bg-warning/10 p-2">
                <p className="font-medium">
                  คำอุทธรณ์จากคนขับ
                  {driver.appealAt
                    ? ` · ${new Date(driver.appealAt).toLocaleString('th-TH')}`
                    : ''}
                </p>
                <p className="whitespace-pre-wrap">{driver.appealMessage}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รายได้</CardTitle>
            <CardDescription>สรุปจากธุรกรรมทั้งหมด</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>ยอดงานรวม: {baht(earnings.totalGross)}</p>
            <p>คอมมิชชั่นแพลตฟอร์ม: {baht(earnings.totalCommission)}</p>
            <p>จ่ายให้คนขับสุทธิ: {baht(earnings.totalNet)}</p>
            <p>
              จ่ายแล้ว {earnings.paidCount} รายการ · ค้างจ่าย {earnings.pendingCount} รายการ
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>บัญชีรับเงิน</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setBankName(driver.bankName ?? '');
                setBankAccountName(driver.bankAccountName ?? '');
                setBankAccountNo(driver.bankAccountNo ?? '');
                setBankOpen(true);
              }}
            >
              แก้ไข
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>ธนาคาร: {driver.bankName ?? '—'}</p>
            <p>ชื่อบัญชี: {driver.bankAccountName ?? '—'}</p>
            <p>เลขบัญชี: {driver.bankAccountNo ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>KYC & สถิติ</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setKyc({
                  nationalId: driver.nationalId ?? '',
                  licenseNo: driver.licenseNo ?? '',
                  licenseExpiry: dateInput(driver.licenseExpiry),
                  vehicleRegExpiry: dateInput(driver.vehicleRegExpiry),
                  insuranceExpiry: dateInput(driver.insuranceExpiry),
                });
                setKycOpen(true);
              }}
            >
              แก้ไข
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              ชื่อ-สกุล:{' '}
              {[driver.firstName, driver.lastName].filter(Boolean).join(' ') || '—'}
            </p>
            <p>
              วันเกิด: {driver.birthDate ? new Date(driver.birthDate).toLocaleDateString('th-TH') : '—'}
              {driver.gender ? ` · เพศ: ${GENDER_LABEL[driver.gender]}` : ''}
            </p>
            <p>อีเมล: {driver.email ?? '—'}</p>
            <p>
              ผู้ติดต่อฉุกเฉิน:{' '}
              {driver.emergencyContactName || driver.emergencyContactPhone
                ? `${driver.emergencyContactName ?? ''} ${driver.emergencyContactPhone ?? ''}`.trim()
                : '—'}
            </p>
            <p>เลขบัตรประชาชน: {driver.nationalId ?? '—'}</p>
            <p>ที่อยู่: {driver.address ?? '—'}</p>
            {driver.nationalIdUrl && (
              <p>
                รูปบัตรประชาชน:{' '}
                <a
                  href={driver.nationalIdUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  ดูรูป
                </a>
              </p>
            )}
            <p>เลขใบขับขี่: {driver.licenseNo ?? '—'}</p>
            {(
              [
                ['ใบขับขี่หมดอายุ', driver.licenseExpiry],
                ['ทะเบียน/พรบ.หมดอายุ', driver.vehicleRegExpiry],
                ['ประกันหมดอายุ', driver.insuranceExpiry],
              ] as const
            ).map(([label, iso]) => {
              const e = expiry(iso);
              return (
                <p key={label}>
                  {label}:{' '}
                  <span
                    className={e.expired ? 'text-destructive' : e.warn ? 'text-warningScale-700' : ''}
                  >
                    {e.text}
                  </span>
                </p>
              );
            })}
            <p className="pt-1">
              งานสำเร็จ {driver.completedCount} · ยกเลิก {driver.cancelCount}
              {driver.completedCount + driver.cancelCount > 0 &&
                ` · อัตรายกเลิก ${Math.round(
                  (driver.cancelCount / (driver.completedCount + driver.cancelCount)) * 100,
                )}%`}
            </p>
          </CardContent>
        </Card>

        {driver.screening && (
          <Card>
            <CardHeader>
              <CardTitle>แบบสอบถามคัดกรอง</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {DRIVER_SCREENING_QUESTIONS.map((q) => {
                const answer = driver.screening?.[q.key];
                const label = q.options.find((o) => o.value === answer)?.label;
                return (
                  <div key={q.key}>
                    <p className="text-muted-foreground">{q.question}</p>
                    <p className="font-medium">{label ?? '—'}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">งานล่าสุด</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>รายการ</TableHead>
              <TableHead>เส้นทาง</TableHead>
              <TableHead>ราคา</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentJobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="max-w-48 truncate">{j.itemDescription}</TableCell>
                <TableCell>
                  {j.originProvince} → {j.destProvince}
                </TableCell>
                <TableCell>{j.priceQuoted ? baht(j.priceQuoted) : '—'}</TableCell>
                <TableCell>
                  <Badge variant={j.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
                    {JOB_STATUS_LABEL[j.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {recentJobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  ยังไม่มีงาน
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">รีวิว</h2>
        <div className="space-y-2">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{'★'.repeat(r.rating)}</span>
                  <span className="text-muted-foreground">
                    {r.customerName ?? 'ลูกค้า'} · {new Date(r.createdAt).toLocaleDateString('th-TH')}
                  </span>
                </div>
                {r.comment && <p className="mt-1">{r.comment}</p>}
              </CardContent>
            </Card>
          ))}
          {reviews.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีรีวิว</p>}
        </div>
      </div>

      <Dialog open={reasonModal !== null} onOpenChange={(open) => !open && setReasonModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonModal === 'REJECT' ? 'ปฏิเสธคนขับ' : 'ระงับคนขับ'}</DialogTitle>
            <DialogDescription>ระบุเหตุผล (คนขับจะเห็น และถูกบันทึกใน audit log)</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">เหตุผล</Label>
            <Input
              id="reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonModal(null)} disabled={verify.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              disabled={verify.isPending}
              onClick={() =>
                reasonModal &&
                verify.mutate({ decision: reasonModal, reason: reason.trim() || undefined })
              }
            >
              {verify.isPending ? 'กำลังบันทึก…' : 'ยืนยัน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bankOpen} onOpenChange={setBankOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>บัญชีรับเงินคนขับ</DialogTitle>
            <DialogDescription>ใช้สำหรับรอบจ่ายเงิน (payout)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="bankName">ธนาคาร</Label>
              <Input id="bankName" value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bankAccountName">ชื่อบัญชี</Label>
              <Input
                id="bankAccountName"
                value={bankAccountName}
                onChange={(e) => setBankAccountName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bankAccountNo">เลขบัญชี</Label>
              <Input
                id="bankAccountNo"
                value={bankAccountNo}
                onChange={(e) => setBankAccountNo(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankOpen(false)} disabled={saveBank.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={() => saveBank.mutate()} disabled={saveBank.isPending}>
              {saveBank.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KYC edit */}
      <Dialog open={kycOpen} onOpenChange={setKycOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ข้อมูล KYC คนขับ</DialogTitle>
            <DialogDescription>เลขเอกสาร + วันหมดอายุ (เตือนเมื่อใกล้/เกินกำหนด)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nid">เลขบัตรประชาชน</Label>
              <Input id="nid" value={kyc.nationalId} onChange={(e) => setKyc({ ...kyc, nationalId: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lno">เลขใบขับขี่</Label>
              <Input id="lno" value={kyc.licenseNo} onChange={(e) => setKyc({ ...kyc, licenseNo: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="lexp">ใบขับขี่หมดอายุ</Label>
                <Input id="lexp" type="date" value={kyc.licenseExpiry} onChange={(e) => setKyc({ ...kyc, licenseExpiry: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vexp">ทะเบียน/พรบ.</Label>
                <Input id="vexp" type="date" value={kyc.vehicleRegExpiry} onChange={(e) => setKyc({ ...kyc, vehicleRegExpiry: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="iexp">ประกัน</Label>
                <Input id="iexp" type="date" value={kyc.insuranceExpiry} onChange={(e) => setKyc({ ...kyc, insuranceExpiry: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKycOpen(false)} disabled={saveKyc.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={() => saveKyc.mutate()} disabled={saveKyc.isPending}>
              {saveKyc.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect this admin-added driver to a signed-up user */}
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เชื่อมคนขับกับบัญชีผู้ใช้</DialogTitle>
            <DialogDescription>
              ค้นหาผู้ใช้ที่สมัครเข้ามา แล้วเลือกเพื่อเชื่อมกับคนขับนี้ (ผู้ใช้จะถูกตั้งเป็น DRIVER)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="ค้นหาชื่อ / เบอร์โทรผู้ใช้"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
            <div className="max-h-64 space-y-1 overflow-auto">
              {userResults.data?.items.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={connect.isPending}
                  onClick={() => connect.mutate(u.id)}
                  className="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  {u.displayName ?? '—'} {u.phone ? `· ${u.phone}` : ''}{' '}
                  <span className="text-muted-foreground">({ROLE_LABEL[u.role]})</span>
                </button>
              ))}
              {userSearch.trim() && userResults.data?.items.length === 0 && (
                <p className="text-sm text-muted-foreground">ไม่พบผู้ใช้</p>
              )}
            </div>
            {connectError && <p className="text-sm text-destructive">{connectError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConnectOpen(false)} disabled={connect.isPending}>
              ปิด
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
