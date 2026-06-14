import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MapPin,
  Clock,
  ShieldCheck,
  Wallet,
  Star,
  Truck,
  PackageCheck,
  Smartphone,
  ArrowRight,
} from 'lucide-react';
import { Section, CtaBand } from '@/components/marketing/sections';
import { JsonLd } from '@/components/marketing/json-ld';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: '/' },
};

const FEATURES = [
  {
    icon: Clock,
    title: 'รับงานรวดเร็ว',
    desc: 'โพสต์งานแล้วคนขับที่ว่างและอยู่ใกล้รับงานได้เลย',
  },
  {
    icon: Wallet,
    title: 'ราคาโปร่งใส',
    desc: 'เห็นค่าบริการชัดเจนก่อนยืนยัน ไม่มีค่าใช้จ่ายแอบแฝง',
  },
  {
    icon: MapPin,
    title: 'ติดตามแบบเรียลไทม์',
    desc: 'ดูตำแหน่งคนขับและสถานะงานได้ตลอดเส้นทาง จนของถึงปลายทาง',
  },
  {
    icon: ShieldCheck,
    title: 'คนขับผ่านการตรวจสอบ',
    desc: 'คนขับทุกคนต้องยืนยันตัวตนและผ่านการอนุมัติก่อนรับงาน',
  },
];

const STEPS = [
  {
    icon: Smartphone,
    title: 'โพสต์งานขนย้าย',
    desc: 'ระบุจุดรับ–จุดส่ง ประเภทและปริมาณของ พร้อมเวลาที่ต้องการ',
  },
  {
    icon: Truck,
    title: 'คนขับใกล้คุณรับงาน',
    desc: 'คนขับที่ว่างและอยู่ในพื้นที่ตอบรับงานของคุณทันที',
  },
  {
    icon: PackageCheck,
    title: 'ขนย้ายเสร็จ จ่ายและรีวิว',
    desc: 'ติดตามจนของถึงที่หมาย ยืนยันงานเสร็จ แล้วให้คะแนนคนขับ',
  },
];

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          serviceType: 'Moving and delivery',
          provider: { '@type': 'Organization', name: SITE.name, url: SITE.url },
          areaServed: { '@type': 'Country', name: 'Thailand' },
          description: SITE.description,
        }}
      />

      {/* Hero */}
      <section className="bg-navy-900 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-navy-800 px-3 py-1 text-xs font-medium text-navy-100">
              <span className="h-2 w-2 rounded-full bg-primary" /> เรียกคนขับขนย้าย
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              เรียกคนขับขนย้าย
              <br />
              <span className="text-primary">ใกล้คุณ</span> ได้ทันที
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-navy-200">
              {SITE.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/app"
                className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand-700"
              >
                โพสต์งานขนย้าย
              </Link>
              <Link
                href="/how-it-works"
                className="rounded-lg border border-navy-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
              >
                ดูวิธีใช้งาน
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-navy-800 bg-navy-800/40 p-6 shadow-xl">
            <div className="grid grid-cols-2 gap-4">
              {FEATURES.map(({ icon: Icon, title }) => (
                <div key={title} className="rounded-xl bg-navy-900/60 p-4">
                  <Icon className="h-6 w-6 text-primary" />
                  <p className="mt-2 text-sm font-medium text-white">{title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why MoveSook */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">ทำไมต้อง MoveSook</h2>
          <p className="mt-3 text-muted-foreground">
            ออกแบบมาเพื่อการขนย้ายที่ง่าย รวดเร็ว และไว้ใจได้
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <section className="bg-muted/40">
        <Section>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">ใช้งานง่ายใน 3 ขั้นตอน</h2>
          </div>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <li key={title} className="relative rounded-xl border bg-card p-6 shadow-sm">
                <span className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <Icon className="mt-2 h-7 w-7 text-navy-700" />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              อ่านรายละเอียดเพิ่มเติม
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Section>
      </section>

      {/* Social proof / trust */}
      <Section>
        <div className="grid gap-6 rounded-2xl border bg-card p-8 text-center shadow-sm sm:grid-cols-3">
          {[
            { stat: 'ทั่วไทย', label: 'ครอบคลุมทุกจังหวัด' },
            { stat: 'เรียลไทม์', label: 'ติดตามทุกขั้นตอน' },
            { stat: '100%', label: 'คนขับยืนยันตัวตน' },
          ].map((item) => (
            <div key={item.label}>
              <p className="flex items-center justify-center gap-1 text-2xl font-bold text-navy-900">
                {item.label.includes('คนขับ') && <Star className="h-5 w-5 text-primary" />}
                {item.stat}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
