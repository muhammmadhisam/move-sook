import type { Metadata } from 'next';
import { PageHeader, Section, CtaBand } from '@/components/marketing/sections';
import { JsonLd } from '@/components/marketing/json-ld';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'คำถามที่พบบ่อย',
  description:
    'รวมคำถามที่พบบ่อยเกี่ยวกับการใช้งาน MoveSook การโพสต์งานขนย้าย ค่าบริการ ความปลอดภัย และการสมัครเป็นคนขับ',
  alternates: { canonical: '/faq' },
};

const FAQS = [
  {
    q: 'MoveSook คืออะไร',
    a: `${SITE.name} (${SITE.nameTh}) คือแพลตฟอร์มเรียกรถขนย้าย คุณโพสต์งานขนย้าย แล้วคนขับที่อยู่ใกล้และว่างจะรับงานให้`,
  },
  {
    q: 'ต้องจองล่วงหน้าไหม',
    a: 'เมื่อคุณโพสต์งาน คนขับที่อยู่ในพื้นที่และพร้อมรับงานจะตอบรับให้',
  },
  {
    q: 'ค่าบริการคิดอย่างไร',
    a: 'ค่าบริการคำนวณจากระยะทาง ประเภทและขนาดรถ และปริมาณของ คุณจะเห็นราคาประมาณการก่อนยืนยันงานทุกครั้ง ไม่มีค่าใช้จ่ายแอบแฝง',
  },
  {
    q: 'ชำระเงินอย่างไร',
    a: 'คุณจะเห็นค่าบริการที่ชัดเจนก่อนยืนยันงาน และชำระตามช่องทางที่ระบบรองรับเมื่องานเสร็จสมบูรณ์',
  },
  {
    q: 'คนขับน่าเชื่อถือแค่ไหน',
    a: 'คนขับทุกคนต้องยืนยันตัวตนและผ่านการอนุมัติจากทีมงานก่อนรับงาน และมีระบบให้คะแนนรีวิวจากลูกค้าเพื่อรักษาคุณภาพบริการ',
  },
  {
    q: 'ติดตามสถานะงานได้ไหม',
    a: 'ได้ คุณสามารถติดตามตำแหน่งคนขับและสถานะงานแบบเรียลไทม์ ตั้งแต่กำลังไปรับของ ระหว่างขนส่ง จนถึงปลายทาง',
  },
  {
    q: 'สมัครเป็นคนขับได้อย่างไร',
    a: 'เข้าใช้งานแอปด้วยบัญชี LINE แล้วสมัครเป็นคนขับพร้อมยืนยันตัวตน เมื่อทีมงานอนุมัติแล้วก็เปิดรับงานได้ทันที',
  },
  {
    q: 'ให้บริการพื้นที่ไหนบ้าง',
    a: 'MoveSook จับคู่งานตามจังหวัด คนขับจะเห็นงานในจังหวัดที่ตนให้บริการ จึงครอบคลุมได้ทั่วประเทศตามพื้นที่ที่มีคนขับ',
  },
];

export default function FaqPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQS.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
          })),
        }}
      />
      <PageHeader
        eyebrow="ช่วยเหลือ"
        title="คำถามที่พบบ่อย"
        description="รวมคำตอบสำหรับคำถามยอดนิยมเกี่ยวกับการใช้งาน MoveSook"
      />
      <Section className="max-w-3xl">
        <dl className="divide-y rounded-xl border bg-card shadow-sm">
          {FAQS.map((item) => (
            <div key={item.q} className="p-6">
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <CtaBand />
    </>
  );
}
