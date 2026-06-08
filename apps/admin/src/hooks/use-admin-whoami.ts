'use client';

import { useQuery } from '@tanstack/react-query';
import type { AdminWhoamiResponse } from '@movesook/shared';
import { api } from '@/lib/api';

/** The signed-in admin's identity + tier. Drives role-based nav gating. */
export function useAdminWhoami() {
  return useQuery({
    queryKey: ['admin', 'whoami'],
    queryFn: async (): Promise<AdminWhoamiResponse> => {
      const res = await api.admin.whoami.$get();
      if (!res.ok) throw new Error('โหลดข้อมูลผู้ดูแลไม่สำเร็จ');
      return (await res.json()) as AdminWhoamiResponse;
    },
    retry: false,
  });
}
