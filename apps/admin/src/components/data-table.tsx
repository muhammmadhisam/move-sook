'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button, TableHead, cn } from '@movesook/ui';

export type SortDir = 'asc' | 'desc';

/** Per-table page + sort state. Changing the sort or a filter should reset to page 1. */
export function useTableState(defaultSortBy: string, defaultSortDir: SortDir = 'desc') {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(defaultSortBy);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);

  const toggleSort = (col: string) => {
    if (col === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  // Call when a filter changes so results start from the first page again.
  const resetPage = () => setPage(1);

  return { page, setPage, sortBy, sortDir, toggleSort, resetPage };
}

export function SortHead({
  label,
  col,
  sortBy,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: string;
  sortBy: string;
  sortDir: SortDir;
  onSort: (col: string) => void;
  className?: string;
}) {
  const active = sortBy === col;
  const Icon = !active ? ChevronsUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          active ? 'text-foreground' : '',
        )}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} จาก {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ก่อนหน้า
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          ถัดไป
        </Button>
      </div>
    </div>
  );
}
