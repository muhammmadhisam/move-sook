'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '@movesook/ui';
import { SessionExpiredGate } from '@/components/session-expired-gate';
import { CookieConsent } from '@/components/cookie-consent';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        {children}
        <SessionExpiredGate />
        <CookieConsent />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
