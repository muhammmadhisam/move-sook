import type { Metadata } from 'next';
import {
  Check,
  Bike,
  Truck,
  Route,
  Building2,
  Users,
  Clock,
  ShieldCheck,
  Calculator,
} from 'lucide-react';
import { PageHeader, Section, CtaBand } from '@/components/marketing/sections';
import { getVehicleRates } from '@/lib/pricing';

// ISR: re-fetch active vehicle rates at most every 5 minutes so admin pricing
// edits go live without a redeploy.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'ค่าบริการ',
  description:
    'ค่าบริการ MoveSook โปร่งใส คำนวณจากระยะทางและประเภทรถ ดูเรตต่อกิโลเมตรของรถแต่ละแบบ พร้อมตัวอย่างการคำนวณ เห็นราคาก่อนยืนยันทุกครั้ง ไม่มีค่าใช้จ่ายแอบแฝง',
  alternates: { canonical: '/pricing' },
};

/** Map a vehicle type slug to an icon; PICKUP and trucks share the truck glyph. */
function vehicleIcon(vehicleType: string): typeof Bike {
  return vehicleType === 'MOTORCYCLE' ? Bike : Truck;
}

const FACTORS = [
  {
    icon: Route,
    label: 'ระยะทาง',
    desc: 'คำนวณจากจุดรับถึงจุดส่ง ยิ่งใกล้ยิ่งประหยัด',
  },
  {
    icon: Truck,
    label: 'ประเภทและขนาดรถ',
    desc: 'รถกระบะ รถตู้ หรือรถใหญ่ มีอัตราต่างกันตามความเหมาะสม',
  },
  {
    icon: Building2,
    label: 'ขึ้น–ลงชั้น',
    desc: 'ขนของขึ้นลงหลายชั้นโดยไม่มีลิฟต์ มีค่าบริการเพิ่มตามจำนวนชั้น',
  },
  {
    icon: Users,
    label: 'คนช่วยยก',
    desc: 'เลือกเพิ่มคนช่วยยกของหนักได้ คิดเป็นค่าบริการแบบเหมา',
  },
  {
    icon: Clock,
    label: 'ช่วงเวลา',
    desc: 'ช่วงที่มีความต้องการสูงอาจมีค่าบริการเพิ่ม โดยแสดงให้เห็นก่อนยืนยัน',
  },
  {
    icon: Calculator,
    label: 'ปริมาณของ',
    desc: 'แบบไม่เหมาลำคิดตามจำนวนชิ้น เหมาะกับของน้อยที่อยากประหยัด',
  },
];

const CUSTOMER = [
  'เห็นราคาประมาณการก่อนโพสต์งานทุกครั้ง',
  'ยืนยันราคาก่อนคนขับรับงาน',
  'ไม่มีค่าใช้จ่ายแอบแฝง',
  'ใช้โค้ดส่วนลดได้เมื่อมีโปรโมชัน',
];

function baht(n: number) {
  return `${n.toLocaleString('th-TH')}`;
}

const BASE_FARE = 250; // flat starting fare (THB), AppSetting `base_fare` default
const EXAMPLE_DISTANCE_KM = 15;

export default async function PricingPage() {
  const vehicles = await getVehicleRates();

  // Build the worked example from a representative live rate (prefer the pickup),
  // so the example never contradicts the rate table above.
  const example = vehicles.find((v) => v.vehicleType === 'PICKUP') ?? vehicles[0];
  const exampleRate = example?.pricePerKm ?? 20; // fallback keeps the figures coherent if the API is down
  const exampleDistanceFee = exampleRate * EXAMPLE_DISTANCE_KM;
  const exampleTotal = BASE_FARE + exampleDistanceFee;

  return (
    <>
      <PageHeader
        eyebrow="ค่าบริการ"
        title="ราคาโปร่งใส รู้ก่อนจ่าย"
        description="ค่าบริการคำนวณอัตโนมัติจากระยะทาง ประเภทรถ และปริมาณของ คุณจะเห็นราคาที่ชัดเจนก่อนยืนยันงานเสมอ"
      />

      {/* Vehicle rate table */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight">เรตต่อกิโลเมตรตามประเภทรถ</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            เลือกได้ทั้งแบบ <span className="font-medium text-foreground">เหมาลำ</span> (รถคันเดียวเพื่อคุณ
            ของถึงไว) หรือ <span className="font-medium text-foreground">ไม่เหมาลำ</span> (แชร์รถ
            คิดตามจำนวนชิ้น ประหยัดกว่า) ทุกงานมีค่าเริ่มต้น {baht(BASE_FARE)} บาท
          </p>
        </div>

        {vehicles.length > 0 ? (
          <div className="mt-10 overflow-hidden rounded-2xl border bg-card shadow-sm">
            {/* header row — desktop only */}
            <div className="hidden grid-cols-[1.6fr_1fr_1fr] gap-4 border-b bg-muted/50 px-6 py-4 text-sm font-semibold sm:grid">
              <span>ประเภทรถ</span>
              <span className="text-center">เหมาลำ / กม.</span>
              <span className="text-center">ไม่เหมาลำ / กม.</span>
            </div>

            <ul className="divide-y">
              {vehicles.map((v) => {
                const Icon = vehicleIcon(v.vehicleType);
                return (
                  <li
                    key={v.vehicleType}
                    className="grid grid-cols-2 items-center gap-4 px-5 py-4 sm:grid-cols-[1.6fr_1fr_1fr] sm:px-6 sm:py-5"
                  >
                    <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold leading-tight">{v.label}</p>
                        {v.description && (
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {v.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-center">
                      <span className="text-xs text-muted-foreground sm:hidden">เหมาลำ</span>
                      <p className="font-semibold tabular-nums">
                        {baht(v.pricePerKm)}{' '}
                        <span className="text-xs font-normal text-muted-foreground">บ.</span>
                      </p>
                    </div>

                    <div className="text-center">
                      <span className="text-xs text-muted-foreground sm:hidden">ไม่เหมาลำ</span>
                      <p className="font-semibold tabular-nums text-primary">
                        {baht(v.pricePerKmShared)}{' '}
                        <span className="text-xs font-normal text-muted-foreground">บ.</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="mt-10 rounded-2xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
            ขออภัย ขณะนี้ยังไม่สามารถแสดงอัตราค่าบริการได้ กรุณาลองใหม่อีกครั้ง
            หรือดูราคาประมาณการได้ทันทีเมื่อโพสต์งานในแอป
          </p>
        )}
        <p className="mt-3 text-center text-xs text-muted-foreground">
          * ราคาจริงขึ้นกับระยะทางและบริการเสริม โดยจะแสดงราคาประมาณการก่อนยืนยันงานทุกครั้ง
        </p>
      </Section>

      {/* How we calculate + example */}
      <Section className="bg-muted/30 py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">ค่าบริการคิดจากอะไรบ้าง</h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {FACTORS.map(({ icon: Icon, label, desc }) => (
                <li key={label} className="rounded-xl border bg-card p-5 shadow-sm">
                  <Icon className="h-5 w-5 text-primary" />
                  <p className="mt-3 font-semibold">{label}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Example calculation */}
          <div className="rounded-2xl border bg-card p-6 shadow-sm lg:sticky lg:top-24">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold">ตัวอย่างการคำนวณ</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              ย้ายของด้วย{example?.label ?? 'รถกระบะ'}แบบเหมาลำ ระยะทาง {EXAMPLE_DISTANCE_KM} กม.
            </p>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">ค่าเริ่มต้น</dt>
                <dd className="tabular-nums">{baht(BASE_FARE)} บาท</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  ระยะทาง {EXAMPLE_DISTANCE_KM} กม. × {baht(exampleRate)} บ.
                </dt>
                <dd className="tabular-nums">{baht(exampleDistanceFee)} บาท</dd>
              </div>
              <div className="flex items-center justify-between border-t pt-3 text-base font-semibold">
                <dt>ราคาประมาณการ</dt>
                <dd className="tabular-nums text-primary">{baht(exampleTotal)} บาท</dd>
              </div>
            </dl>

            <p className="mt-4 rounded-lg bg-brand-50 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              ราคาจริงอาจปรับตามการขึ้น–ลงชั้น คนช่วยยก หรือช่วงเวลาเร่งด่วน
              โดยทุกรายการจะแสดงให้เห็นก่อนกดยืนยันเสมอ
            </p>
          </div>
        </div>
      </Section>

      {/* Guarantees: customer + driver */}
      <Section className="pt-0">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">สำหรับลูกค้า</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {CUSTOMER.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-muted-foreground">
                  <Check className="h-5 w-5 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">สำหรับคนขับ</h2>
            </div>
            <ul className="mt-4 space-y-3">
              <li className="flex gap-3 text-sm text-muted-foreground">
                <Check className="h-5 w-5 shrink-0 text-primary" />
                <span>สมัครและรับงานฟรี ไม่มีค่าสมัครรายเดือน</span>
              </li>
              <li className="flex gap-3 text-sm text-muted-foreground">
                <Check className="h-5 w-5 shrink-0 text-primary" />
                <span>หักค่าคอมมิชชั่นเพียง 12% ต่องาน ที่เหลือเป็นของคนขับเต็ม ๆ</span>
              </li>
              <li className="flex gap-3 text-sm text-muted-foreground">
                <Check className="h-5 w-5 shrink-0 text-primary" />
                <span>เห็นรายได้สุทธิก่อนกดรับงานทุกครั้ง</span>
              </li>
              <li className="flex gap-3 text-sm text-muted-foreground">
                <Check className="h-5 w-5 shrink-0 text-primary" />
                <span>เลือกรับเฉพาะงานในจังหวัดที่ให้บริการได้</span>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
