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
import { AppEntryLink } from '@/components/marketing/app-entry-link';
import { SITE } from '@/lib/site';
import { getServiceAreaProvinces } from '@/lib/provinces';

export const metadata: Metadata = {
  // Keyword-led, brand-suffixed title (absolute = skip the "%s | MoveSook" template).
  title: { absolute: 'รถรับจ้าง ขนของ ย้ายบ้าน เรียกคนขับขนย้ายใกล้คุณ | MoveSook' },
  description: SITE.description,
  alternates: { canonical: '/' },
};

// Re-render periodically so service-area changes made in admin show up.
export const revalidate = 300;

const FAQ = [
  {
    q: 'MoveSook คือบริการอะไร?',
    a: 'MoveSook (มูฟสุข) คือแพลตฟอร์มเรียกรถขนย้ายแบบ on-demand คุณโพสต์งานขนย้าย แล้วคนขับที่อยู่ใกล้และว่างจะรับงานให้ทันที ใช้ได้ทั้งย้ายบ้าน ย้ายหอพัก ย้ายคอนโด หรือขนของชิ้นใหญ่',
  },
  {
    q: 'ค่าบริการขนย้ายคิดยังไง?',
    a: 'ค่าบริการคำนวณอัตโนมัติจากระยะทาง ประเภทรถ และปริมาณของ คุณเห็นราคาประมาณการก่อนยืนยันงานทุกครั้ง ไม่มีค่าใช้จ่ายแอบแฝง',
  },
  {
    q: 'มีรถประเภทไหนให้เลือกบ้าง?',
    a: 'มีทั้งรถกระบะ รถตู้ และรถบรรทุกขนาดต่างๆ เลือกได้ตามปริมาณและขนาดของที่จะขนย้าย',
  },
  {
    q: 'ให้บริการพื้นที่ไหนบ้าง?',
    a: 'ให้บริการครอบคลุมทุกจังหวัดทั่วประเทศไทย คนขับที่อยู่ใกล้พื้นที่รับ–ส่งของคุณจะรับงานให้',
  },
  {
    q: 'คนขับน่าเชื่อถือไหม?',
    a: 'คนขับทุกคนต้องยืนยันตัวตนและผ่านการตรวจสอบอนุมัติก่อนรับงาน และคุณติดตามตำแหน่งคนขับได้แบบเรียลไทม์ตลอดเส้นทาง',
  },
];

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

export default async function HomePage() {
  const serviceAreas = await getServiceAreaProvinces();

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
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQ.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        }}
      />

      {/* Hero */}
      <section className="bg-navy-900 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-navy-800 px-3 py-1 text-xs font-medium text-navy-100">
              <span className="h-2 w-2 rounded-full bg-primary" /> รถรับจ้าง ขนของ ย้ายบ้าน ทั่วไทย
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              เรียกรถรับจ้าง ขนของ ย้ายบ้าน
              <br />
              <span className="text-primary">ใกล้คุณ</span> ได้ทันที
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-navy-200">
              เรียกรถกระบะรับจ้างและคนขับขนย้ายที่อยู่ใกล้คุณ สำหรับย้ายบ้าน ย้ายหอพัก
              ย้ายคอนโด และขนของทั่วไทย โพสต์งานแล้วให้คนขับที่ว่างรับงานทันที
              ราคาโปร่งใส รู้ก่อนจ่าย ติดตามสถานะได้แบบเรียลไทม์
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <AppEntryLink className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand-700">
                โพสต์งานขนย้าย
              </AppEntryLink>
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

      {/* Service areas — internal links into the per-province SEO pages */}
      <section className="bg-muted/40">
        <Section>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              พื้นที่ให้บริการขนย้าย
            </h2>
            <p className="mt-3 text-muted-foreground">
              เรียกรถขนย้ายได้ครอบคลุมทุกจังหวัดทั่วไทย เลือกพื้นที่ของคุณ
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {serviceAreas.map((p) => (
              <Link
                key={p.slug}
                href={`/move/${p.slug}`}
                className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-sm transition-colors hover:border-primary hover:text-primary"
              >
                <MapPin className="h-4 w-4 text-primary" />
                ขนย้าย{p.nameTh}
              </Link>
            ))}
          </div>
        </Section>
      </section>

      {/* FAQ */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">คำถามที่พบบ่อย</h2>
        </div>
        <ul className="mx-auto mt-10 max-w-3xl space-y-4">
          {FAQ.map((f) => (
            <li key={f.q} className="rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand />
    </>
  );
}
