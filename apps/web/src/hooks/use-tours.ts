'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeToursResponse, TourSeenDto } from '@movesook/shared';
import { api } from '@/lib/api';

// Onboarding-tour "learned" state, stored per-user in the DB (replaces the old
// localStorage flag so it follows the account across devices). Shared by the
// header lightbulb (<TourButton>) and every page's <PageTour>; one cached query.
export function useTours() {
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['tours'],
    queryFn: async (): Promise<MeToursResponse> => {
      const res = await api.me.tours.$get();
      if (!res.ok) throw new Error('โหลดสถานะการสอนไม่สำเร็จ');
      return (await res.json()) as MeToursResponse;
    },
    staleTime: 5 * 60 * 1000,
  });

  const mark = useMutation({
    mutationFn: async (input: { tourId: string; version: number }): Promise<MeToursResponse> => {
      const res = await api.me.tours.$post({ json: input });
      if (!res.ok) throw new Error('บันทึกสถานะการสอนไม่สำเร็จ');
      return (await res.json()) as MeToursResponse;
    },
    onSuccess: (data) => queryClient.setQueryData(['tours'], data),
  });

  const tours: TourSeenDto[] = list.data?.tours ?? [];

  return {
    tours,
    isFetched: list.isFetched,
    // A tour counts as learned only when the stored version is at least the
    // client's current version (bumping a tour's version re-highlights it).
    isLearned: (tourId: string, version: number) =>
      tours.some((t) => t.tourId === tourId && t.version >= version),
    markSeen: (tourId: string, version: number) => mark.mutate({ tourId, version }),
  };
}
