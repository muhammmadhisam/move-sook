'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Paperclip, Wallet } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import {
  LEDGER_ENTRY_TYPE_LABEL,
  LedgerEntryTypeSchema,
  type LedgerEntryDto,
  type LedgerEntryType,
  type LedgerSummaryResponse,
  type Paged,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

const ALL = 'ALL' as const;
const baht = (n: number) => `฿${n.toLocaleString()}`;
const dateFmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' });

export default function LedgerListPage() {
  const tbl = useTableState('occurredAt');
  const [type, setType] = useState<LedgerEntryType | typeof ALL>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Shared filter object for both the list and the summary queries.
  const filter = {
    ...(type === ALL ? {} : { type }),
    ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
  };

  const entries = useQuery({
    queryKey: ['admin', 'ledger', type, from, to, tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<Paged<LedgerEntryDto>> => {
      const res = await api.admin.ledger.$get({
        query: {
          page: String(tbl.page),
          sortBy: tbl.sortBy,
          sortDir: tbl.sortDir,
          ...filter,
        },
      });
      if (!res.ok) throw new Error('โหลดรายการไม่สำเร็จ');
      return (await res.json()) as Paged<LedgerEntryDto>;
    },
  });

  const summary = useQuery({
    queryKey: ['admin', 'ledger', 'summary', type, from, to],
    queryFn: async (): Promise<LedgerSummaryResponse> => {
      const res = await api.admin.ledger.summary.$get({ query: filter });
      if (!res.ok) throw new Error('โหลดสรุปไม่สำเร็จ');
      return (await res.json()) as LedgerSummaryResponse;
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">บัญชีรายรับ-รายจ่าย</h1>
        <Button asChild>
          <Link href="/ledger/new">+ เพิ่มรายการ</Link>
        </Button>
      </div>

      {/* Summary cards reflect the active filter */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ArrowUpCircle className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-sm text-muted-foreground">รายรับรวม</p>
              <p className="text-xl font-bold text-emerald-600">{baht(summary.data?.income ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <ArrowDownCircle className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-sm text-muted-foreground">รายจ่ายรวม</p>
              <p className="text-xl font-bold text-destructive">{baht(summary.data?.expense ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Wallet className="h-8 w-8 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">คงเหลือสุทธิ</p>
              <p
                className={`text-xl font-bold ${(summary.data?.net ?? 0) < 0 ? 'text-destructive' : 'text-foreground'}`}
              >
                {baht(summary.data?.net ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">ประเภท</label>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as LedgerEntryType | typeof ALL);
              tbl.setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกประเภท</SelectItem>
              {LedgerEntryTypeSchema.options.map((t) => (
                <SelectItem key={t} value={t}>
                  {LEDGER_ENTRY_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">ตั้งแต่วันที่</label>
          <Input
            type="date"
            value={from}
            className="w-44"
            onChange={(e) => {
              setFrom(e.target.value);
              tbl.setPage(1);
            }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">ถึงวันที่</label>
          <Input
            type="date"
            value={to}
            className="w-44"
            onChange={(e) => {
              setTo(e.target.value);
              tbl.setPage(1);
            }}
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="วันที่" col="occurredAt" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>ประเภท</TableHead>
            <TableHead>รายการ</TableHead>
            <TableHead>หมวดหมู่</TableHead>
            <SortHead label="จำนวนเงิน" col="amount" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} className="text-right" />
            <TableHead className="text-right">การดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.data?.items.map((e) => (
            <TableRow key={e.id}>
              <TableCell>{dateFmt.format(new Date(e.occurredAt))}</TableCell>
              <TableCell>
                <Badge variant={e.type === 'INCOME' ? 'success' : 'secondary'}>
                  {LEDGER_ENTRY_TYPE_LABEL[e.type]}
                </Badge>
              </TableCell>
              <TableCell>
                <Link href={`/ledger/${e.id}`} className="font-medium text-primary hover:underline">
                  {e.title}
                </Link>
                {e.attachments.length > 0 && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Paperclip className="h-3 w-3" />
                    {e.attachments.length}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{e.category}</TableCell>
              <TableCell
                className={`text-right font-medium ${e.type === 'INCOME' ? 'text-emerald-600' : 'text-destructive'}`}
              >
                {e.type === 'INCOME' ? '+' : '−'}
                {baht(e.amount)}
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/ledger/${e.id}`}>แก้ไข</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {entries.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {entries.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีรายการ'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {entries.data && (
        <Pager
          page={entries.data.page}
          pageSize={entries.data.pageSize}
          total={entries.data.total}
          onPage={tbl.setPage}
        />
      )}
    </div>
  );
}
