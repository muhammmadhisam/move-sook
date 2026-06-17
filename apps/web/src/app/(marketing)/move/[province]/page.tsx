import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader, Section, CtaBand } from '@/components/marketing/sections';
import { SITE } from '@/lib/site';
import { PROVINCES, getProvinceBySlug } from '@/lib/provinces';

// Pre-render all 77 provinces as static HTML at build time (best for indexing).
export function generateStaticParams() {
  return PROVINCES.map((p) => ({ province: p.slug }));
}

// Any slug outside the known list 404s instead of rendering on-demand.
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ province: string }>;
}): Promise<Metadata> {
  const { province } = await params;
  const p = getProvinceBySlug(province);
  if (!p) return {};
  const title = `รถกระบะรับจ้าง ขนของ ย้ายบ้าน ${p.nameTh}`;
  return {
    title,
    description: `เรียกรถขนย้ายใน${p.nameTh} โพสต์งานแล้วให้คนขับใกล้คุณรับงาน ราคาโปร่งใส รู้ก่อนจ่าย ติดตามสถานะเรียลไทม์ บริการขนย้ายบ้าน หอพัก คอนโด ใน${p.nameTh}`,
    alternates: { canonical: `/move/${p.slug}` },
    openGraph: { title, url: `${SITE.url}/move/${p.slug}` },
  };
}

const buildFaq = (nameTh: string) => [
  {
    q: `เรียกรถขนของใน${nameTh}ราคาเท่าไหร่?`,
    a: 'ค่าบริการคำนวณจากระยะทาง ประเภทรถ และปริมาณของ คุณเห็นราคาประมาณการก่อนยืนยันทุกครั้ง ไม่มีค่าใช้จ่ายแอบแฝง',
  },
  {
    q: `มีรถประเภทไหนให้เลือกบ้างใน${nameTh}?`,
    a: 'มีทั้งรถกระบะ รถตู้ และรถใหญ่ เลือกได้ตามปริมาณและขนาดของที่จะขนย้าย',
  },
  {
    q: `ใช้บริการขนย้ายใน${nameTh}ได้ตอนไหน?`,
    a: 'โพสต์งานได้ตลอด คนขับที่อยู่ใกล้และว่างใน' + nameTh + 'จะรับงานให้ทันที ติดตามสถานะได้แบบเรียลไทม์',
  },
];

export default async function ProvinceMovePage({
  params,
}: {
  params: Promise<{ province: string }>;
}) {
  const { province } = await params;
  const p = getProvinceBySlug(province);
  if (!p) notFound();

  const faq = buildFaq(p.nameTh);

  // LocalBusiness + FAQPage structured data -> eligible for Google rich results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'LocalBusiness',
        name: `${SITE.name} ${p.nameTh}`,
        description: `บริการเรียกรถขนย้ายใน${p.nameTh} ขนย้ายบ้าน หอพัก คอนโด`,
        url: `${SITE.url}/move/${p.slug}`,
        areaServed: { '@type': 'AdministrativeArea', name: p.nameTh },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PageHeader
        eyebrow={`ขนย้ายใน${p.nameTh}`}
        title={`รถกระบะรับจ้าง ขนของ ย้ายบ้าน ${p.nameTh}`}
        description={`เรียกคนขับขนย้ายที่อยู่ใกล้คุณใน${p.nameTh} โพสต์งานแล้วรอคนขับรับ ราคาโปร่งใส ติดตามได้แบบเรียลไทม์`}
      />

      <Section>
        <h2 className="text-2xl font-bold tracking-tight">บริการขนย้ายใน{p.nameTh}</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          MoveSook ให้บริการเรียกรถขนย้ายทั่ว{p.nameTh} ไม่ว่าจะย้ายบ้าน ย้ายหอพัก ย้ายคอนโด
          หรือขนของชิ้นใหญ่ โพสต์งานของคุณแล้วคนขับที่อยู่ใกล้และว่างใน{p.nameTh}จะรับงานให้ทันที
          ราคาคำนวณอัตโนมัติจากระยะทางและประเภทรถ คุณเห็นราคาก่อนยืนยันทุกครั้ง
        </p>

        <h2 className="mt-12 text-2xl font-bold tracking-tight">คำถามที่พบบ่อย</h2>
        <ul className="mt-6 space-y-4">
          {faq.map((f) => (
            <li key={f.q} className="rounded-xl border bg-card p-5 shadow-sm">
              <p className="font-semibold">{f.q}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand
        title={`พร้อมขนย้ายใน${p.nameTh}แล้วหรือยัง?`}
        description={`โพสต์งานขนย้ายใน${p.nameTh}วันนี้ แล้วให้คนขับที่อยู่ใกล้รับงานทันที`}
      />
    </>
  );
}
