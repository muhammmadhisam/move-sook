import type { Metadata } from 'next';
import { Smartphone, Truck, MapPin, PackageCheck, Star } from 'lucide-react';
import { PageHeader, Section, CtaBand } from '@/components/marketing/sections';

export const metadata: Metadata = {
  title: 'วิธีใช้งาน',
  description:
    'วิธีใช้งาน MoveSook ขั้นตอนการโพสต์งานขนย้าย การจับคู่คนขับ การติดตามเรียลไทม์ จนถึงการชำระเงินและรีวิว',
  alternates: { canonical: '/how-it-works' },
};

const STEPS = [
  {
    icon: Smartphone,
    title: '1. โพสต์งานขนย้าย',
    desc: 'กรอกจุดรับและจุดส่ง ระบุประเภทและปริมาณของ พร้อมเวลาที่สะดวก ระบบจะคำนวณค่าบริการโดยประมาณให้ทันที',
  },
  {
    icon: Truck,
    title: '2. คนขับที่อยู่ใกล้รับงาน',
    desc: 'งานของคุณจะแสดงให้คนขับที่ผ่านการตรวจสอบและให้บริการในจังหวัดเดียวกัน คนขับคนแรกที่ตอบรับจะได้งานทันที',
  },
  {
    icon: MapPin,
    title: '3. ติดตามแบบเรียลไทม์',
    desc: 'ดูตำแหน่งคนขับและสถานะงานตลอดเส้นทาง ตั้งแต่กำลังไปรับของ ระหว่างขนส่ง จนถึงปลายทาง',
  },
  {
    icon: PackageCheck,
    title: '4. ยืนยันงานเสร็จ',
    desc: 'เมื่อของถึงปลายทางและส่งมอบเรียบร้อย ระบบจะยืนยันงานเสร็จ พร้อมหลักฐานการส่ง',
  },
  {
    icon: Star,
    title: '5. ให้คะแนนและรีวิว',
    desc: 'ให้คะแนนคนขับเพื่อช่วยรักษาคุณภาพบริการ คะแนนจะช่วยให้ผู้ใช้คนอื่นเลือกคนขับที่ดีได้',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="วิธีใช้งาน"
        title="ขนย้ายของ จบในไม่กี่ขั้นตอน"
        description="โพสต์งานแล้วให้คนขับที่ว่างและอยู่ใกล้รับงานได้"
      />
      <Section>
        <ol className="mx-auto max-w-3xl space-y-6">
          {STEPS.map(({ icon: Icon, title, desc }) => (
            <li key={title} className="flex gap-4 rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-semibold">{title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
      <CtaBand />
    </>
  );
}
