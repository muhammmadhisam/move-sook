'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
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
  BLOG_STATUS_LABEL,
  BlogStatusSchema,
  type BlogPostDto,
  type BlogStatus,
  type Paged,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

const ALL = 'ALL' as const;

const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' });

export default function BlogListPage() {
  const tbl = useTableState('createdAt');
  const [status, setStatus] = useState<BlogStatus | typeof ALL>(ALL);

  const posts = useQuery({
    queryKey: ['admin', 'blog', status, tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<Paged<BlogPostDto>> => {
      const res = await api.admin.blog.$get({
        query: {
          page: String(tbl.page),
          sortBy: tbl.sortBy,
          sortDir: tbl.sortDir,
          ...(status === ALL ? {} : { status }),
        },
      });
      if (!res.ok) throw new Error('โหลดบทความไม่สำเร็จ');
      return (await res.json()) as Paged<BlogPostDto>;
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">บล็อก</h1>
        <div className="flex items-center gap-2">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as BlogStatus | typeof ALL);
              tbl.setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
              {BlogStatusSchema.options.map((s) => (
                <SelectItem key={s} value={s}>
                  {BLOG_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild>
            <Link href="/blog/new">+ เขียนบทความ</Link>
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="หัวข้อ" col="title" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>สถานะ</TableHead>
            <SortHead label="เผยแพร่เมื่อ" col="publishedAt" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <SortHead label="สร้างเมื่อ" col="createdAt" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.data?.items.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link href={`/blog/${p.id}`} className="font-medium text-primary hover:underline">
                  {p.title}
                </Link>
                <span className="block font-mono text-xs text-muted-foreground">/{p.slug}</span>
              </TableCell>
              <TableCell>
                <Badge variant={p.status === 'PUBLISHED' ? 'success' : 'secondary'}>
                  {BLOG_STATUS_LABEL[p.status]}
                </Badge>
              </TableCell>
              <TableCell>{p.publishedAt ? dateFmt.format(new Date(p.publishedAt)) : '—'}</TableCell>
              <TableCell>{dateFmt.format(new Date(p.createdAt))}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/blog/${p.id}`}>แก้ไข</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {posts.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {posts.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีบทความ'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {posts.data && (
        <Pager
          page={posts.data.page}
          pageSize={posts.data.pageSize}
          total={posts.data.total}
          onPage={tbl.setPage}
        />
      )}
    </div>
  );
}
