import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@movesook/ui';

/** Page hero/title block for inner marketing pages. */
export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <section className="bg-navy-900 text-white">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
        {eyebrow && (
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-navy-200">
            {description}
          </p>
        )}
      </div>
    </section>
  );
}

/** Constrained content container with vertical rhythm. */
export function Section({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mx-auto max-w-6xl px-4 py-14 sm:py-20', className)}>{children}</section>
  );
}

/** Prose container for long-form legal / article copy. */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ul]:text-muted-foreground">
      {children}
    </div>
  );
}

/** Primary CTA band shown near the end of most pages. */
export function CtaBand({
  title = 'พร้อมเริ่มขนย้ายแล้วหรือยัง?',
  description = 'โพสต์งานขนย้ายของคุณวันนี้ แล้วให้คนขับที่อยู่ใกล้รับงานทันที',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-16 text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        <p className="max-w-xl text-base leading-relaxed opacity-90">{description}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/app"
            className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-white/90"
          >
            เริ่มใช้งาน
          </Link>
          <Link
            href="/drivers"
            className="rounded-lg border border-white/70 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            สมัครเป็นคนขับ
          </Link>
        </div>
      </div>
    </section>
  );
}
