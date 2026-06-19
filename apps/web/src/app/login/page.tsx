"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Button } from "@movesook/ui";
import { useAuth } from "@/hooks/use-auth";

const IS_DEV = process.env.NODE_ENV !== "production";

// Resolve the post-login destination from ?next=, but only accept a same-origin
// path ("/foo") — never "//evil.com" or "http://…" — so the param can't be used
// as an open redirect. Falls back to the app home.
function safeNext(): string {
  if (typeof window === "undefined") return "/app";
  const raw = new URLSearchParams(window.location.search).get("next");
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/app";
}

export default function LoginPage() {
  const router = useRouter();
  const { me, isLoading, login, devLogin } = useAuth();

  // Already signed in → go to the requested page (?next=), else the app home.
  useEffect(() => {
    if (me) router.replace(safeNext());
  }, [me, router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <Link href="/" className="flex flex-col items-center text-center">
        <Image
          src="/logo.png"
          alt="MoveSook"
          width={200}
          height={150}
          className="h-auto w-48"
          priority
        />
        <p className="mt-1 text-sm text-muted-foreground">
          เรียกคนขับขนย้ายใกล้คุณ
        </p>
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
          {login.isPending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบด้วย LINE"}
        </Button>
      )}
      {login.isError &&
        // The redirect-to-LINE throw isn't a real failure (the page is
        // navigating away) — don't flash an error for it.
        login.error?.message !== "redirecting to LINE login" && (
          <p className="text-sm text-destructive">
            เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง
            {login.error instanceof Error && login.error.message && (
              <span className="mt-1 block text-xs opacity-70">
                ({login.error.message})
              </span>
            )}
          </p>
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
              onClick={() => devLogin.mutate("USER")}
            >
              เข้าเป็นลูกค้า
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={devLogin.isPending}
              onClick={() => devLogin.mutate("DRIVER")}
            >
              เข้าเป็นคนขับ
            </Button>
          </div>
        </div>
      )}

      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        กลับหน้าแรก
      </Link>
    </main>
  );
}
