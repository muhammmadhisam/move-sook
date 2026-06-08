'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@movesook/ui';
import { useAuth } from '@/hooks/use-auth';

const IS_DEV = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const router = useRouter();
  const { me, isLoading, login, devLogin } = useAuth();

  // Already signed in → straight to the app.
  useEffect(() => {
    if (me) router.replace('/app');
  }, [me, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm">
          MS
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">MoveSook</h1>
        <p className="mt-1 text-sm text-muted-foreground">เรียกคนขับขนย้ายใกล้คุณ</p>
      </Link>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด…</p>
      ) : (
        <Button
          size="lg"
          className="w-full bg-[#06C755] text-white hover:bg-[#06C755]/90"
          disabled={login.isPending}
          onClick={() => login.mutate()}
        >
          {login.isPending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย LINE'}
        </Button>
      )}
      {login.isError && (
        <p className="text-sm text-destructive">เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง</p>
      )}

      {IS_DEV && (
        <div className="w-full rounded-lg border border-dashed p-4">
          <p className="mb-2 text-center text-xs font-medium text-muted-foreground">
            โหมดทดสอบ (dev) — เข้าระบบโดยไม่ใช้ LINE
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={devLogin.isPending}
              onClick={() => devLogin.mutate('USER')}
            >
              เข้าเป็นลูกค้า
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={devLogin.isPending}
              onClick={() => devLogin.mutate('DRIVER')}
            >
              เข้าเป็นคนขับ
            </Button>
          </div>
        </div>
      )}

      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← กลับหน้าแรก
      </Link>
    </main>
  );
}
