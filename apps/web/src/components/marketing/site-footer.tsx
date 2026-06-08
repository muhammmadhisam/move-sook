import Link from 'next/link';
import { SITE } from '@/lib/site';

const GROUPS = [
  {
    title: 'บริการ',
    links: [
      { href: '/how-it-works', label: 'วิธีใช้งาน' },
      { href: '/pricing', label: 'ค่าบริการ' },
      { href: '/drivers', label: 'สมัครเป็นคนขับ' },
      { href: '/app', label: 'เข้าใช้งาน' },
    ],
  },
  {
    title: 'บริษัท',
    links: [
      { href: '/about', label: 'เกี่ยวกับเรา' },
      { href: '/blog', label: 'บล็อก' },
      { href: '/faq', label: 'คำถามที่พบบ่อย' },
      { href: '/contact', label: 'ติดต่อเรา' },
    ],
  },
  {
    title: 'กฎหมาย',
    links: [
      { href: '/terms', label: 'ข้อกำหนดการใช้งาน' },
      { href: '/privacy', label: 'นโยบายความเป็นส่วนตัว (PDPA)' },
    ],
  },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-navy-800 bg-navy-900 text-navy-200">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              MS
            </span>
            <span className="text-lg font-semibold tracking-tight">MoveSook</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed">{SITE.tagline}</p>
        </div>

        {GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-semibold text-white">{group.title}</h3>
            <ul className="mt-3 space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm transition-colors hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-navy-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.name} ({SITE.nameTh}). สงวนลิขสิทธิ์
          </p>
          <p>
            <a href={`mailto:${SITE.email}`} className="hover:text-white">
              {SITE.email}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
