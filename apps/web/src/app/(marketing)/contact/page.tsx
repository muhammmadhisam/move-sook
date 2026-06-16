import type { Metadata } from "next";
import { MessageCircle, Clock, ArrowRight } from "lucide-react";
import { PageHeader, Section } from "@/components/marketing/sections";
import { JsonLd } from "@/components/marketing/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "ติดต่อเรา",
  description:
    "ติดต่อทีมงาน MoveSook ผ่านอีเมล LINE Official Account หรือโทรศัพท์ เราพร้อมช่วยเหลือทุกคำถามเกี่ยวกับการขนย้าย",
  alternates: { canonical: "/contact" },
};

const CHANNELS = [
  {
    icon: MessageCircle,
    title: "LINE Official Account",
    value: "@13ogbsz",
    href: SITE.lineOaUrl,
    cta: "แชทกับเรา",
  },
  // {
  //   icon: Mail,
  //   title: "อีเมล",
  //   value: SITE.email,
  //   href: `mailto:${SITE.email}`,
  //   cta: "ส่งอีเมล",
  // },
  // {
  //   icon: Phone,
  //   title: "โทรศัพท์",
  //   value: SITE.phone,
  //   href: `tel:${SITE.phone.replace(/[^+\d]/g, "")}`,
  //   cta: "โทรหาเรา",
  // },
];

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "ติดต่อ MoveSook",
          url: `${SITE.url}/contact`,
        }}
      />
      <PageHeader
        eyebrow="ติดต่อเรา"
        title="เราพร้อมช่วยเหลือคุณ"
        description="มีคำถามเกี่ยวกับการขนย้าย การใช้งาน หรือการเป็นคนขับ? ติดต่อทีมงานได้ตามช่องทางด้านล่าง"
      />

      <Section className="max-w-4xl">
        <div className="grid gap-6 sm:grid-cols-3">
          {CHANNELS.map(({ icon: Icon, title, value, href, cta }) => (
            <a
              key={title}
              href={href}
              className="group rounded-xl border bg-card p-6 text-center shadow-sm transition-colors hover:border-primary"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{value}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 group-hover:underline">
                {cta}
                <ArrowRight className="h-4 w-4" />
              </span>
            </a>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          เวลาทำการ: ทุกวัน 08:00–20:00 น.
        </div>
      </Section>
    </>
  );
}
