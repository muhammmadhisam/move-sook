import type { Metadata } from 'next';
import { Target, Heart, Users, ShieldCheck } from 'lucide-react';
import { PageHeader, Section, CtaBand } from '@/components/marketing/sections';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title: 'เกี่ยวกับเรา',
  description:
    'รู้จัก MoveSook (มูฟสุข) แพลตฟอร์มขนย้ายที่เชื่อมต่อลูกค้ากับคนขับใกล้บ้านโดยตรง ภารกิจและคุณค่าที่เรายึดถือ',
  alternates: { canonical: '/about' },
};

const VALUES = [
  {
    icon: Target,
    title: 'ทำเรื่องขนย้ายให้ง่าย',
    desc: 'เราเชื่อว่าการขนย้ายไม่ควรยุ่งยาก แค่ไม่กี่ขั้นตอนก็เรียกคนขับได้',
  },
  {
    icon: ShieldCheck,
    title: 'ความปลอดภัยมาก่อน',
    desc: 'คนขับทุกคนผ่านการยืนยันตัวตนและอนุมัติ เพื่อความสบายใจของทุกฝ่าย',
  },
  {
    icon: Heart,
    title: 'โปร่งใสและเป็นธรรม',
    desc: 'ราคาชัดเจน ค่าคอมมิชชันเป็นธรรมกับคนขับ ไม่มีค่าใช้จ่ายแอบแฝง',
  },
  {
    icon: Users,
    title: 'เติบโตไปด้วยกัน',
    desc: 'เราสร้างรายได้ให้คนขับท้องถิ่น และมอบบริการที่ดีให้ลูกค้าทั่วไทย',
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="เกี่ยวกับเรา"
        title="MoveSook คือใคร"
        description={`${SITE.name} (${SITE.nameTh}) คือแพลตฟอร์มขนย้ายที่เชื่อมต่อคนที่ต้องการขนย้ายเข้ากับคนขับที่อยู่ใกล้และพร้อมรับงาน`}
      />

      <Section className="max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight">ภารกิจของเรา</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          การย้ายบ้าน ย้ายหอ หรือขนของชิ้นใหญ่ มักเป็นเรื่องที่หาคนช่วยยากและราคาไม่แน่นอน MoveSook
          เกิดขึ้นเพื่อแก้ปัญหานี้ ด้วยการให้คุณโพสต์งานขนย้ายแล้วจับคู่กับคนขับที่อยู่ใกล้ที่สุดแบบเรียลไทม์
          ไม่ต้องโทรหาหลายเจ้า ไม่ต้องต่อราคา และติดตามได้ทุกขั้นตอน
        </p>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          ในขณะเดียวกัน เราก็ช่วยให้คนขับรถกระบะและรถขนของมีช่องทางหารายได้เพิ่มจากงานที่อยู่ใกล้ตัว
          ด้วยระบบที่โปร่งใสและค่าคอมมิชชันที่เป็นธรรม
        </p>
      </Section>

      <section className="bg-muted/40">
        <Section>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight">คุณค่าที่เรายึดถือ</h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {VALUES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4 rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </section>

      <CtaBand />
    </>
  );
}
