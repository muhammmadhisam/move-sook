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
  AdminRoleSchema,
  ADMIN_ROLE_LABEL,
  type AdminListItem,
  type AdminRole,
  type Paged,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

export default function AdminsPage() {
  const queryClient = useQueryClient();
  const tbl = useTableState('createdAt');
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adminRole, setAdminRole] = useState<AdminRole>('OPS');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const admins = useQuery({
    queryKey: ['admin', 'admins', tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<Paged<AdminListItem>> => {
      const res = await api.admin.admins.$get({
        query: { page: String(tbl.page), sortBy: tbl.sortBy, sortDir: tbl.sortDir },
      });
      if (!res.ok) throw new Error('โหลดรายชื่อผู้ดูแลไม่สำเร็จ');
      return (await res.json()) as Paged<AdminListItem>;
    },
  });

  const invite = useMutation({
    mutationFn: async () => {
      const res = await api.admin.admins.$post({
        json: { email: email.trim(), displayName: displayName.trim(), adminRole, password },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'เพิ่มผู้ดูแลไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      setInviting(false);
      setEmail('');
      setDisplayName('');
      setPassword('');
      setAdminRole('OPS');
      queryClient.invalidateQueries({ queryKey: ['admin', 'admins'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const onInvite = () => {
    setError(null);
    if (!email.includes('@')) return setError('อีเมลไม่ถูกต้อง');
    if (displayName.trim().length < 1) return setError('กรอกชื่อ');
    if (password.length < 8) return setError('รหัสผ่านอย่างน้อย 8 ตัว');
    invite.mutate();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">ผู้ดูแลระบบ</h1>
        <Button
          onClick={() => {
            setError(null);
            setInviting(true);
          }}
        >
          + เพิ่มผู้ดูแล
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ</TableHead>
            <SortHead label="อีเมล" col="email" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <SortHead label="สิทธิ์" col="adminRole" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <SortHead label="เพิ่มเมื่อ" col="createdAt" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {admins.data?.items.map((a) => (
            <TableRow key={a.userId}>
              <TableCell>{a.displayName ?? '—'}</TableCell>
              <TableCell>{a.email}</TableCell>
              <TableCell>
                <Badge variant={a.adminRole === 'SUPER' ? 'destructive' : 'secondary'}>
                  {ADMIN_ROLE_LABEL[a.adminRole]}
                </Badge>
              </TableCell>
              <TableCell>{new Date(a.createdAt).toLocaleDateString('th-TH')}</TableCell>
            </TableRow>
          ))}
          {admins.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                {admins.isLoading ? 'กำลังโหลด…' : 'ไม่มีผู้ดูแล'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {admins.data && (
        <Pager
          page={admins.data.page}
          pageSize={admins.data.pageSize}
          total={admins.data.total}
          onPage={tbl.setPage}
        />
      )}

      <Dialog open={inviting} onOpenChange={setInviting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ดูแลระบบ</DialogTitle>
            <DialogDescription>สร้างบัญชีแอดมินใหม่พร้อมกำหนดสิทธิ์</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">อีเมล</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dn">ชื่อ</Label>
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>สิทธิ์</Label>
              <Select value={adminRole} onValueChange={(v) => setAdminRole(v as AdminRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AdminRoleSchema.options.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ADMIN_ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw">รหัสผ่านชั่วคราว (≥ 8 ตัว)</Label>
              <Input id="pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviting(false)} disabled={invite.isPending}>
              ยกเลิก
            </Button>
            <Button onClick={onInvite} disabled={invite.isPending}>
              {invite.isPending ? 'กำลังสร้าง…' : 'สร้าง'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
