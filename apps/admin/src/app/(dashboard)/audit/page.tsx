'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
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
import type { AuditLogDto, Paged } from '@movesook/shared';
import { api } from '@/lib/api';
import { Pager, SortHead, useTableState } from '@/components/data-table';

const ALL = 'ALL';

const ACTIONS = [
  'driver.verify',
  'driver.create',
  'driver.connect',
  'driver.bank',
  'user.ban',
  'user.unban',
  'job.patch',
  'job.create',
  'customer.create',
  'transaction.update',
  'payout.create',
  'payout.paid',
  'dispute.resolve',
  'settings.commission',
  'settings.pricing',
  'settings.system',
  'settings.service_area',
  'settings.vehicle_pricing',
  'pii.view',
  'pdpa.export',
  'pdpa.anonymize',
  'pdpa.consent',
  'driver.kyc',
  'blacklist.add',
  'blacklist.remove',
  'promo.create',
  'promo.update',
  'customer.update',
  'admin.invite',
];

type AuditResponse = Paged<AuditLogDto>;

export default function AuditPage() {
  const tbl = useTableState('createdAt');
  const [action, setAction] = useState<string>(ALL);

  const logs = useQuery({
    queryKey: ['admin', 'audit', action, tbl.page, tbl.sortBy, tbl.sortDir],
    queryFn: async (): Promise<AuditResponse> => {
      const query = {
        page: String(tbl.page),
        sortBy: tbl.sortBy,
        sortDir: tbl.sortDir,
        ...(action === ALL ? {} : { action }),
      };
      const res = await api.admin['audit-logs'].$get({ query });
      if (!res.ok) throw new Error('โหลดบันทึกไม่สำเร็จ');
      return (await res.json()) as AuditResponse;
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">บันทึกการใช้งาน (Audit Log)</h1>
        <div className="w-full sm:w-56">
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              tbl.resetPage();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>ทุกการกระทำ</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortHead label="เวลา" col="createdAt" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>ผู้ดำเนินการ</TableHead>
            <SortHead label="การกระทำ" col="action" sortBy={tbl.sortBy} sortDir={tbl.sortDir} onSort={tbl.toggleSort} />
            <TableHead>เป้าหมาย</TableHead>
            <TableHead>รายละเอียด</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.data?.items.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap text-xs">
                {new Date(log.createdAt).toLocaleString('th-TH')}
              </TableCell>
              <TableCell>{log.actorName ?? log.actorId.slice(0, 8)}</TableCell>
              <TableCell>
                <Badge variant="secondary">{log.action}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {log.targetType === 'job' ? (
                  <Link href={`/jobs/${log.targetId}`} className="text-primary hover:underline">
                    job/{log.targetId.slice(0, 8)}
                  </Link>
                ) : (
                  `${log.targetType}/${log.targetId.slice(0, 8)}`
                )}
              </TableCell>
              <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                {log.metadata ? JSON.stringify(log.metadata) : '—'}
              </TableCell>
            </TableRow>
          ))}
          {logs.data?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                {logs.isLoading ? 'กำลังโหลด…' : 'ยังไม่มีบันทึก'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {logs.data && (
        <Pager
          page={logs.data.page}
          pageSize={logs.data.pageSize}
          total={logs.data.total}
          onPage={tbl.setPage}
        />
      )}
    </div>
  );
}
