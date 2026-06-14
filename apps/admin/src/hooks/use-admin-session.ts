'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AdminStatsResponse } from '@movesook/shared';

/**
 * Admin session gate. The admin session lives in a separate cookie and there is
 * no /me for it, so we probe a protected admin endpoint. A 401/403 means the
 * caller is not an authenticated ADMIN -> redirect to /login (client guard;
 * the API still enforces RBAC server-side regardless).
 */
export function useAdminSession() {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async (): Promise<AdminStatsResponse> => {
      const res = await api.admin.stats.$get();
      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error('unauthorized'), { unauthorized: true });
      }
      if (!res.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ');
      return (await res.json()) as AdminStatsResponse;
    },
    // Keep-alive: re-probe periodically while the tab is focused so the API
    // sliding-refresh rolls the admin cookie forward even when the rest of the
    // UI is serving cached reads. Pauses when backgrounded (refetchInterval does
    // not run unfocused unless refetchIntervalInBackground), so idle sessions
    // still lapse at the full TTL by design.
    refetchInterval: 10 * 60 * 1000, // 10 minutes
  });

  useEffect(() => {
    if (query.error && (query.error as { unauthorized?: boolean }).unauthorized) {
      router.replace('/login');
    }
  }, [query.error, router]);

  return query;
}
