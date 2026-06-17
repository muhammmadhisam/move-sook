import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { PageHeader, Section, CtaBand } from '@/components/marketing/sections';

export const metadata: Metadata = {
  title: 'ค่าบริการ',
  description:
    'ค่าบริการ MoveSook โปร่งใส คำนวณจากระยะทางและประเภทของ เห็นราคาก่อนยืนยันทุกครั้ง ไม่มีค่าใช้จ่ายแอบแฝง',
  alternates: { canonical: '/pricing' },
};

const FACTORS = [
  { label: 'ระยะทาง', desc: 'คำนวณจากจุดรับถึงจุดส่ง ยิ่งใกล้ยิ่งประหยัด' },
  { label: 'ประเภทและขนาดรถ', desc: 'รถกระบะ รถตู้ หรือรถใหญ่ มีอัตราต่างกันตามความเหมาะสม' },
  { label: 'ปริมาณของ', desc: 'จำนวนและน้ำหนักของมีผลต่อค่าบริการ' },
  { label: 'ช่วงเวลา', desc: 'ช่วงที่มีความต้องการสูงอาจมีค่าบริการเพิ่ม โดยแสดงให้เห็นก่อนยืนยัน' },
];

const CUSTOMER = [
  'เห็นราคาประมาณการก่อนโพสต์งานทุกครั้ง',
  'ยืนยันราคาก่อนคนขับรับงาน',
  'ไม่มีค่าใช้จ่ายแอบแฝง',
  'ใช้โค้ดส่วนลดได้เมื่อมีโปรโมชัน',
];

export default function PricingPage() {
  return (
    <>
      <PageHeader
        eyebrow="ค่าบริการ"
        title="ราคาโปร่งใส รู้ก่อนจ่าย"
        description="ค่าบริการคำนวณอัตโนมัติจากระยะทาง ประเภทรถ และปริมาณของ คุณจะเห็นราคาที่ชัดเจนก่อนยืนยันงานเสมอ"
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">ค่าบริการคิดจากอะไรบ้าง</h2>
            <ul className="mt-6 space-y-4">
              {FACTORS.map((f) => (
                <li key={f.label} className="rounded-xl border bg-card p-5 shadow-sm">
                  <p className="font-semibold">{f.label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">สำหรับลูกค้า</h2>
              <ul className="mt-4 space-y-3">
                {CUSTOMER.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                    <Check className="h-5 w-5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
