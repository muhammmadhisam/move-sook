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
import { FareCalculator } from '@/components/marketing/fare-calculator';
import { getVehicleRates } from '@/lib/pricing';
import { getCommissionPct, getBaseFare } from '@/lib/system';

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

/** One rate column inside a vehicle card: the figure when set, or a dash when
 * the admin hasn't priced this vehicle yet (never a fabricated number). */
function RateColumn({
  caption,
  value,
  highlight,
}: {
  caption: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <div className="bg-card px-3 py-3 text-center">
      <p className="text-xs text-muted-foreground">{caption}</p>
      {value == null ? (
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">—</p>
      ) : (
        <p className={`mt-0.5 text-lg font-bold tabular-nums${highlight ? ' text-primary' : ''}`}>
          {baht(value)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">บ./กม.</span>
        </p>
      )}
    </div>
  );
}

/** One block in the "ค่าเริ่มต้น + ค่าระยะทาง + บริการเสริม = ราคา" formula row. */
function FormulaChip({
  label,
  sub,
  primary,
}: {
  label: string;
  sub: string;
  primary?: boolean;
}) {
  return (
    <div
      className={`min-w-[6.5rem] rounded-xl border px-4 py-3 text-center shadow-sm ${
        primary ? 'border-primary bg-primary text-primary-foreground' : 'bg-card'
      }`}
    >
      <p className="text-sm font-semibold leading-tight">{label}</p>
      <p className={`mt-0.5 text-xs ${primary ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
        {sub}
      </p>
    </div>
  );
}

const EXAMPLE_DISTANCE_KM = 15;

export default async function PricingPage() {
  // Everything on this page is driven by live admin settings via the API: the
  // vehicle catalog + per-km rates, the commission rate, and the flat base fare.
  const [vehicles, commissionPct, BASE_FARE] = await Promise.all([
    getVehicleRates(),
    getCommissionPct(),
    getBaseFare(),
  ]);

  // Worked example uses the first vehicle that actually has a per-km rate set, so
  // the numbers always match a real row in the table. Hidden when none is priced.
  const example = vehicles.find((v) => v.pricePerKm != null);
  const exampleDistanceFee = example ? example.pricePerKm! * EXAMPLE_DISTANCE_KM : 0;
  const exampleTotal = BASE_FARE + exampleDistanceFee;

  return (
    <>
      <PageHeader
        eyebrow="ค่าบริการ"
        title="ราคาโปร่งใส รู้ก่อนจ่าย"
        description="ค่าบริการคำนวณอัตโนมัติจากระยะทาง ประเภทรถ และปริมาณของ คุณจะเห็นราคาที่ชัดเจนก่อนยืนยันงานเสมอ"
      />

      {/* Interactive fare calculator — pick origin/destination on the map */}
      {vehicles.length > 0 && (
        <Section>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              คำนวณค่าบริการล่วงหน้า
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              เลือกจุดรับของและปลายทางบนแผนที่ เลือกประเภทรถ
              แล้วดูราคาประมาณการทันที — ไม่ต้องเข้าสู่ระบบ
            </p>
          </div>
          <div className="mt-8">
            <FareCalculator vehicles={vehicles} />
          </div>
        </Section>
      )}

      {/* Vehicle rate cards */}
      <Section>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">เรตต่อกิโลเมตรตามประเภทรถ</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            เลือกได้ทั้งแบบ <span className="font-semibold text-foreground">เหมาลำ</span>{' '}
            (รถคันเดียวเพื่อคุณ ของถึงไว) หรือ{' '}
            <span className="font-semibold text-foreground">ไม่เหมาลำ</span> (แชร์รถ คิดตามจำนวนชิ้น
            ประหยัดกว่า)
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-primary">
            ทุกงานเริ่มต้น {baht(BASE_FARE)} บาท + ค่าระยะทาง
          </p>
        </div>

        {vehicles.length > 0 ? (
          <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const Icon = vehicleIcon(v.vehicleType);
              const noRate = v.pricePerKm == null && v.pricePerKmShared == null;
              return (
                <li
                  key={v.vehicleType}
                  className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="relative flex h-44 items-center justify-center bg-muted">
                    {v.imageUrl ? (
                      <img
                        src={v.imageUrl}
                        alt={v.label}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Icon className="h-14 w-14 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* รูปตัวอย่างเพิ่มเติม (แกลเลอรี) — โชว์ให้ลูกค้าเห็นหลายมุม */}
                  {v.imageUrls.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto px-3 pt-3">
                      {v.imageUrls.map((url) => (
                        <img
                          key={url}
                          src={url}
                          alt={v.label}
                          loading="lazy"
                          className="h-14 w-14 shrink-0 rounded-md border object-cover"
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-semibold leading-tight">{v.label}</h3>
                    {v.description && (
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {v.description}
                      </p>
                    )}

                    {noRate ? (
                      <div className="mt-4 rounded-xl border border-dashed bg-muted/40 px-4 py-4 text-center text-sm text-muted-foreground">
                        สอบถามราคา
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
                        <RateColumn caption="เหมาลำ" value={v.pricePerKm} />
                        <RateColumn caption="ไม่เหมาลำ" value={v.pricePerKmShared} highlight />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-10 rounded-2xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
            ขณะนี้ยังไม่สามารถแสดงอัตราค่าบริการได้ — ดูราคาประมาณการได้ทันทีเมื่อโพสต์งานในแอป
          </p>
        )}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          * ราคาจริงขึ้นกับระยะทางและบริการเสริม โดยจะแสดงราคาประมาณการก่อนยืนยันงานทุกครั้ง
        </p>
      </Section>

      {/* How we calculate — formula + factors */}
      <Section className="bg-muted/30">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">คิดราคายังไง</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            ราคาประกอบจาก 3 ส่วนหลัก คำนวณอัตโนมัติและแสดงให้เห็นก่อนยืนยันงานเสมอ
          </p>
        </div>

        {/* Formula chips */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <FormulaChip label="ค่าเริ่มต้น" sub={`${baht(BASE_FARE)} บาท`} />
          <span className="text-lg font-semibold text-muted-foreground">+</span>
          <FormulaChip label="ค่าระยะทาง" sub="ระยะ × เรต/กม." />
          <span className="text-lg font-semibold text-muted-foreground">+</span>
          <FormulaChip label="บริการเสริม" sub="ชั้น / คนยก / ช่วงเวลา" />
          <span className="text-lg font-semibold text-muted-foreground">=</span>
          <FormulaChip label="ราคาประมาณการ" sub="เห็นก่อนยืนยัน" primary />
        </div>

        {/* Concrete worked example — only when a vehicle has a real rate */}
        {example && (
          <div className="mx-auto mt-8 max-w-md rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">ตัวอย่าง: {example.label} (เหมาลำ {EXAMPLE_DISTANCE_KM} กม.)</h3>
            </div>
            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">ค่าเริ่มต้น</dt>
                <dd className="tabular-nums">{baht(BASE_FARE)} บาท</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  {EXAMPLE_DISTANCE_KM} กม. × {baht(example.pricePerKm!)} บ.
                </dt>
                <dd className="tabular-nums">{baht(exampleDistanceFee)} บาท</dd>
              </div>
              <div className="flex items-center justify-between border-t pt-2.5 text-base font-bold">
                <dt>ราคาประมาณการ</dt>
                <dd className="tabular-nums text-primary">{baht(exampleTotal)} บาท</dd>
              </div>
            </dl>
          </div>
        )}

        {/* Factor cards */}
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FACTORS.map(({ icon: Icon, label, desc }) => (
            <li key={label} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 font-semibold">{label}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </li>
          ))}
        </ul>
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
                <span>หักค่าคอมมิชชั่นเพียง {commissionPct}% ต่องาน ที่เหลือเป็นของคนขับเต็ม ๆ</span>
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
