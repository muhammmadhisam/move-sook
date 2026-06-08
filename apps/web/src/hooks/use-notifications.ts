'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@movesook/shared';
import { api } from '@/lib/api';

interface NotificationList {
  items: NotificationDto[];
  nextCursor: string | null;
}

export function useNotifications() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: async (): Promise<NotificationList> => {
      const res = await api.me.notifications.$get({ query: {} });
      if (!res.ok) throw new Error('โหลดการแจ้งเตือนไม่สำเร็จ');
      return (await res.json()) as NotificationList;
    },
  });

  const unread = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async (): Promise<number> => {
      const res = await api.me.notifications['unread-count'].$get();
      if (!res.ok) return 0;
      const data = (await res.json()) as { count: number };
      return data.count;
    },
    refetchInterval: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.me.notifications[':id'].read.$post({ param: { id } });
    },
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.me.notifications['read-all'].$post();
    },
    onSuccess: invalidate,
  });

  return {
    items: list.data?.items ?? [],
    isLoading: list.isLoading,
    unreadCount: unread.data ?? 0,
    markRead,
    markAllRead,
  };
}
