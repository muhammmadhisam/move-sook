'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { Button, cn } from '@movesook/ui';
import { AppEntryLink } from '@/components/marketing/app-entry-link';

const NAV = [
  { href: '/how-it-works', label: 'วิธีใช้งาน' },
  { href: '/drivers', label: 'สำหรับคนขับ' },
  { href: '/pricing', label: 'ค่าบริการ' },
  { href: '/about', label: 'เกี่ยวกับเรา' },
  { href: '/faq', label: 'คำถามที่พบบ่อย' },
  { href: '/blog', label: 'บล็อก' },
  { href: '/contact', label: 'ติดต่อเรา' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-navy-800 bg-navy-900 text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Image
            src="/brand-mark.png"
            alt="MoveSook"
            width={36}
            height={36}
            className="h-9 w-9 rounded-lg"
            priority
          />
          <span className="text-lg font-semibold tracking-tight">MoveSook</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="เมนูหลัก">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-navy-100 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button asChild size="sm">
            <AppEntryLink>เข้าใช้งาน</AppEntryLink>
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-navy-800 md:hidden"
          aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className={cn('border-t border-navy-800 md:hidden', open ? 'block' : 'hidden')}>
        <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label="เมนูบนมือถือ">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-navy-100 hover:bg-navy-800 hover:text-white"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <Button asChild className="mt-2">
            <AppEntryLink onClick={() => setOpen(false)}>เข้าใช้งาน</AppEntryLink>
          </Button>
        </nav>
      </div>
    </header>
  );
}
