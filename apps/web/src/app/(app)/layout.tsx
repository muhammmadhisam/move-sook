import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';

// Authenticated app shell (top bar + bottom tab nav). Public marketing pages
// live in the (marketing) group and never mount this.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
