import type { Metadata } from "next";
import {
  Wallet,
  Clock,
  MapPin,
  BadgeCheck,
  TrendingUp,
  CalendarCheck,
} from "lucide-react";
import { PageHeader, Section } from "@/components/marketing/sections";
import { MiniAppQr } from "@/components/marketing/mini-app-qr";
import { AppEntryLink } from "@/components/marketing/app-entry-link";
import { getCommissionPct } from "@/lib/system";

export const metadata: Metadata = {
  title: "สมัครเป็นคนขับ",
  description:
    "ขับรถกระบะหรือรถขนของ? มาหารายได้เพิ่มกับ MoveSook รับงานขนย้ายที่อยู่ใกล้ตัว เลือกเวลาทำงานเองได้ ค่าคอมมิชชันเป็นธรรม",
  alternates: { canonical: "/drivers" },
};

// Re-render periodically so commission-rate changes in admin show up.
export const revalidate = 300;

const buildBenefits = (commissionPct: number) => [
  {
    icon: Wallet,
    title: "รายได้เพิ่ม",
    desc: "รับงานขนย้ายในเวลาว่าง เพิ่มรายได้จากรถที่คุณมีอยู่แล้ว",
  },
  {
    icon: Clock,
    title: "เลือกเวลาเอง",
    desc: "เปิด–ปิดรับงานได้ตามต้องการ ทำงานเมื่อคุณสะดวก",
  },
  {
    icon: MapPin,
    title: "งานใกล้ตัว",
    desc: "รับเฉพาะงานในจังหวัดที่คุณให้บริการ ไม่ต้องวิ่งไกล",
  },
  {
    icon: TrendingUp,
    title: "ค่าคอมมิชชันเป็นธรรม",
    desc: `แพลตฟอร์มหักค่าบริการเพียง ${commissionPct}% ที่เหลือเป็นของคุณ`,
  },
  {
    icon: CalendarCheck,
    title: "จ่ายเงินสม่ำเสมอ",
    desc: "ระบบสรุปรายได้ชัดเจน ติดตามยอดและการจ่ายได้ในแอป",
  },
  {
    icon: BadgeCheck,
    title: "สร้างเรตติ้ง",
    desc: "รับรีวิวจากลูกค้า ยิ่งคะแนนดี ยิ่งได้รับความไว้วางใจ",
  },
];

const STEPS = [
  "เข้าใช้งานแอปด้วยบัญชี LINE",
  "กรอกข้อมูลและสมัครเป็นคนขับ พร้อมเอกสารยืนยันตัวตน",
  "รอทีมงานตรวจสอบและอนุมัติ",
  "เปิดรับงาน แล้วเริ่มรับงานขนย้ายใกล้คุณได้ทันที",
];

export default async function DriversPage() {
  const benefits = buildBenefits(await getCommissionPct());

  return (
    <>
      <PageHeader
        eyebrow="สำหรับคนขับ"
        title="เปลี่ยนรถของคุณ ให้เป็นรายได้"
        description="ถ้าคุณมีรถกระบะหรือรถขนของ มาเป็นพาร์ทเนอร์คนขับกับ MoveSook รับงานขนย้ายที่อยู่ใกล้ตัว ในเวลาที่คุณสะดวก"
      />

      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-xl border bg-card p-6 shadow-sm"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <section className="bg-muted/40">
        <Section className="max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight">
            สมัครเป็นคนขับอย่างไร
          </h2>
          <ol className="mt-8 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <p className="pt-1 text-muted-foreground">{step}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <AppEntryLink
              path="/driver/apply"
              className="inline-block rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-brand-700"
            >
              เริ่มสมัครเป็นคนขับ
            </AppEntryLink>
            {/*<MiniAppQr size={130} subtitle="หรือสแกนเพื่อสมัครบนมือถือ" />*/}
          </div>
        </Section>
      </section>
    </>
  );
}
