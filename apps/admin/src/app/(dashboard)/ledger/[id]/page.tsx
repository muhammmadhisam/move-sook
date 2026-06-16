'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LedgerEntryDto } from '@movesook/shared';
import { api } from '@/lib/api';
import { LedgerForm } from '@/components/ledger-form';

export default function EditLedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const entry = useQuery({
    queryKey: ['admin', 'ledger', id],
    queryFn: async (): Promise<LedgerEntryDto> => {
      const res = await api.admin.ledger[':id'].$get({ param: { id } });
      if (!res.ok) throw new Error('ไม่พบรายการ');
      return (await res.json()) as LedgerEntryDto;
    },
  });

  if (entry.isLoading) return <p className="text-muted-foreground">กำลังโหลด…</p>;
  if (entry.error || !entry.data)
    return <p className="text-destructive">ไม่พบรายการนี้</p>;

  return <LedgerForm entry={entry.data} />;
}
