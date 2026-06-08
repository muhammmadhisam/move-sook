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
import { ROLE_LABEL, type AdminUserListItem, type Paged, type Role } from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

const ALL = 'ALL';

type UsersResponse = Paged<AdminUserListItem>;

const ROLE_VARIANT: Record<Role, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  USER: 'secondary',
  DRIVER: 'default',
  ADMIN: 'destructive',
  SYSTEM: 'outline',
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const t = useTableState('createdAt');
  const [role, setRole] = useState<Role | typeof ALL>(ALL);
  const [banned, setBanned] = useState<'ALL' | 'true' | 'false'>(ALL);
  const [search, setSearch] = useState('');
  const [target, setTarget] = useState<AdminUserListItem | null>(null);

  const trimmed = search.trim();
  const users = useQuery({
    queryKey: ['admin', 'users', role, banned, trimmed, t.page, t.sortBy, t.sortDir],
    queryFn: async (): Promise<UsersResponse> => {
      const query: {
        role?: Role;
        isBanned?: 'true' | 'false';
        search?: string;
        page: string;
        sortBy: string;
        sortDir: 'asc' | 'desc';
      } = { page: String(t.page), sortBy: t.sortBy, sortDir: t.sortDir };
      if (role !== ALL) query.role = role;
      if (banned !== ALL) query.isBanned = banned;
      if (trimmed) query.search = trimmed;
      const res = await api.admin.users.$get({ query });
      if (!res.ok) throw new Error('โหลดรายชื่อผู้ใช้ไม่สำเร็จ');
      return (await res.json()) as UsersResponse;
    },
  });

  const setBan = useMutation({
    mutationFn: async (args: { id: string; isBanned: boolean }) => {
      const res = await api.admin.users[':id'].ban.$patch({
        param: { id: args.id },
        json: { isBanned: args.isBanned },
      });
      if (!res.ok) throw new Error('อัปเดตสถานะไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const rows = users.data?.items ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">ลูกค้า / ผู้ใช้</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="ค้นหาชื่อ / เบอร์โทร"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            t.resetPage();
          }}
          className="max-w-xs"
        />
        <div className="w-40">
          <Select
            value={role}
            onValueChange={(v) => {
              setRole(v as Role | typeof ALL);
              t.resetPage();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกบทบาท</SelectItem>
              <SelectItem value="USER">{ROLE_LABEL.USER}</SelectItem>
              <SelectItem value="DRIVER">{ROLE_LABEL.DRIVER}</SelectItem>
              <SelectItem value="ADMIN">{ROLE_LABEL.ADMIN}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={banned}
            onValueChange={(v) => {
              setBanned(v as 'ALL' | 'true' | 'false');
              t.resetPage();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
              <SelectItem value="false">ใช้งานปกติ</SelectItem>
              <SelectItem value="true">ถูกแบน</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="ชื่อ" col="displayName" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <SortHead label="บทบาท" col="role" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <TableHead>เบอร์โทร</TableHead>
            <TableHead>สถานะ</TableHead>
            <SortHead label="สมัครเมื่อ" col="createdAt" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell>
                <Link href={`/users/${u.id}`} className="font-medium text-primary hover:underline">
                  {u.displayName ?? '—'}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={ROLE_VARIANT[u.role]}>{ROLE_LABEL[u.role]}</Badge>
              </TableCell>
              <TableCell>{u.phone ?? '—'}</TableCell>
              <TableCell>
                {u.isBanned ? (
                  <Badge variant="destructive">ถูกแบน</Badge>
                ) : (
                  <Badge variant="success">ใช้งานปกติ</Badge>
                )}
              </TableCell>
              <TableCell>{new Date(u.createdAt).toLocaleDateString('th-TH')}</TableCell>
              <TableCell className="text-right">
                {u.role === 'ADMIN' ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <Button
                    size="sm"
                    variant={u.isBanned ? 'outline' : 'destructive'}
                    onClick={() => setTarget(u)}
                  >
                    {u.isBanned ? 'ปลดแบน' : 'แบน'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {users.isLoading ? 'กำลังโหลด…' : 'ไม่พบผู้ใช้'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {users.data && (
        <Pager
          page={users.data.page}
          pageSize={users.data.pageSize}
          total={users.data.total}
          onPage={t.setPage}
        />
      )}

      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{target?.isBanned ? 'ยืนยันการปลดแบน' : 'ยืนยันการแบน'}</DialogTitle>
            <DialogDescription>
              {target?.isBanned
                ? `ปลดแบน “${target?.displayName ?? target?.id}” ให้กลับมาเข้าสู่ระบบได้อีกครั้ง?`
                : `แบน “${target?.displayName ?? target?.id}” — ผู้ใช้จะเข้าสู่ระบบไม่ได้`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={setBan.isPending}>
              ยกเลิก
            </Button>
            <Button
              variant={target?.isBanned ? 'default' : 'destructive'}
              disabled={setBan.isPending}
              onClick={() => target && setBan.mutate({ id: target.id, isBanned: !target.isBanned })}
            >
              {setBan.isPending ? 'กำลังบันทึก…' : target?.isBanned ? 'ปลดแบน' : 'แบน'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
