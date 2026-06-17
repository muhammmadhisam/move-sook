'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
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
import { ROLE_LABEL, type AdminLineFollowerListItem, type Paged, type Role } from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

const ALL = 'ALL';

type FollowersResponse = Paged<AdminLineFollowerListItem>;

const ROLE_VARIANT: Record<Role, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  USER: 'secondary',
  DRIVER: 'default',
  ADMIN: 'destructive',
  SYSTEM: 'outline',
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('th-TH') : '—');

export default function LineFollowersPage() {
  const t = useTableState('lineFollowedAt');
  const [following, setFollowing] = useState<'ALL' | 'true' | 'false'>(ALL);
  const [search, setSearch] = useState('');

  const trimmed = search.trim();
  const followers = useQuery({
    queryKey: ['admin', 'line-followers', following, trimmed, t.page, t.sortBy, t.sortDir],
    queryFn: async (): Promise<FollowersResponse> => {
      const query: {
        following?: 'true' | 'false';
        search?: string;
        page: string;
        sortBy: string;
        sortDir: 'asc' | 'desc';
      } = { page: String(t.page), sortBy: t.sortBy, sortDir: t.sortDir };
      if (following !== ALL) query.following = following;
      if (trimmed) query.search = trimmed;
      const res = await api.admin['line-followers'].$get({ query });
      if (!res.ok) throw new Error('โหลดรายชื่อผู้ติดตาม LINE ไม่สำเร็จ');
      return (await res.json()) as FollowersResponse;
    },
  });

  const rows = followers.data?.items ?? [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ผู้ติดตาม LINE</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        สถานะการเพิ่มเพื่อน LINE OA ของผู้ใช้ — เฉพาะคนที่ “ติดตาม” อยู่เท่านั้นที่ระบบส่งแจ้งเตือนผ่าน
        LINE ได้ (อัปเดตอัตโนมัติจาก webhook follow/unfollow)
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          placeholder="ค้นหาชื่อ"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            t.resetPage();
          }}
          className="max-w-xs"
        />
        <div className="w-44">
          <Select
            value={following}
            onValueChange={(v) => {
              setFollowing(v as 'ALL' | 'true' | 'false');
              t.resetPage();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
              <SelectItem value="true">กำลังติดตาม</SelectItem>
              <SelectItem value="false">ไม่ได้ติดตาม</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="ชื่อ" col="displayName" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <TableHead>บทบาท</TableHead>
            <TableHead>สถานะติดตาม</TableHead>
            <SortHead label="ติดตามเมื่อ" col="lineFollowedAt" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
            <TableHead>เลิกติดตามเมื่อ</TableHead>
            <SortHead label="สมัครเมื่อ" col="createdAt" sortBy={t.sortBy} sortDir={t.sortDir} onSort={t.toggleSort} />
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
              <TableCell>
                {u.lineFollowing ? (
                  <Badge variant="success">กำลังติดตาม</Badge>
                ) : (
                  <Badge variant="secondary">ไม่ได้ติดตาม</Badge>
                )}
              </TableCell>
              <TableCell>{fmtDate(u.lineFollowedAt)}</TableCell>
              <TableCell>{fmtDate(u.lineUnfollowedAt)}</TableCell>
              <TableCell>{fmtDate(u.createdAt)}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {followers.isLoading ? 'กำลังโหลด…' : 'ไม่พบผู้ใช้ที่เชื่อม LINE'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {followers.data && (
        <Pager
          page={followers.data.page}
          pageSize={followers.data.pageSize}
          total={followers.data.total}
          onPage={t.setPage}
        />
      )}
    </div>
  );
}
