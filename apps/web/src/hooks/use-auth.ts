'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getLineIdToken } from '@/lib/liff';
import { useAuthStore } from '@/store/auth';
import type { MeResponse } from '@movesook/shared';

async function fetchMe(): Promise<MeResponse | null> {
  const res = await api.me.$get();
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to load profile');
  return (await res.json()) as MeResponse;
}

export function useAuth() {
  const { setMe, setStatus } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const meQuery = useQuery({ queryKey: ['me'], queryFn: fetchMe });

  useEffect(() => {
    if (meQuery.isLoading) setStatus('loading');
    else setMe(meQuery.data ?? null);
  }, [meQuery.data, meQuery.isLoading, setMe, setStatus]);

  const login = useMutation({
    mutationFn: async () => {
      const idToken = await getLineIdToken();
      const res = await api.auth.line.$post({ json: { idToken } });
      if (!res.ok) throw new Error('LINE login failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  const logout = useMutation({
    mutationFn: async () => {
      await api.auth.logout.$post();
    },
    onSuccess: () => {
      useAuthStore.getState().reset();
      queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/'); // back to home after signing out
    },
  });

  // DEV ONLY — bypass LINE to log in as a mock USER/DRIVER (API 403s in prod).
  const devLogin = useMutation({
    mutationFn: async (role: 'USER' | 'DRIVER') => {
      const res = await api.auth.dev.login.$post({ json: { role } });
      if (!res.ok) throw new Error('dev login failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  return { me: meQuery.data ?? null, isLoading: meQuery.isLoading, login, logout, devLogin };
}
