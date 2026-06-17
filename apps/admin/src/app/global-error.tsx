'use client';

// App Router global error boundary — renders in place of the root layout when a
// client render throws, so it ships its own <html>/<body>. Reports to Sentry,
// then shows a minimal Thai recovery screen for the admin operator.
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="th">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-semibold">เกิดข้อผิดพลาด</h1>
          <p className="max-w-sm text-muted-foreground">
            ระบบแอดมินมีปัญหาชั่วคราว ทีมงานได้รับแจ้งแล้ว กรุณาลองใหม่อีกครั้ง
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground"
          >
            ลองใหม่
          </button>
        </main>
      </body>
    </html>
  );
}
