import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { getEnv, getDocStore, getLogger } from '../runtime/env';
import type { Job, Customer, Driver, User, Transaction } from '@movesook/db';
import {
  JOB_STATUS_LABEL,
  PRICING_MODE_LABEL,
  type SystemSettingsResponse,
} from '@movesook/shared';

const FONT_REG = fileURLToPath(new URL('../../assets/fonts/Sarabun-Regular.ttf', import.meta.url));
const FONT_BOLD = fileURLToPath(new URL('../../assets/fonts/Sarabun-Bold.ttf', import.meta.url));

export type DocType = 'receipt' | 'payout' | 'worksheet' | 'delivery';

export const DOC_TITLE: Record<DocType, string> = {
  receipt: 'ใบเสร็จรับเงิน',
  payout: 'ใบสำคัญจ่าย (ค่างานคนขับ)',
  worksheet: 'ใบสรุปงาน (Work Order)',
  delivery: 'ใบส่งมอบสินค้า',
};

// Job + relations the builders need.
export type JobDocData = {
  job: Job;
  customer: (Customer & { user: Pick<User, 'displayName' | 'phone'> | null }) | null;
  driver: (Driver & { user: Pick<User, 'displayName' | 'phone'> | null }) | null;
  transaction: Transaction | null;
  settings: SystemSettingsResponse;
  // Resolved Thai vehicle-type label (custom catalog slugs have no built-in label).
  vehicleLabel: string;
};

const money = (n: number | null | undefined) => `฿${(n ?? 0).toLocaleString('th-TH')}`;
const fmtDate = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('th-TH', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      })
    : '—';

const MAX_IMAGE_FETCH_BYTES = 8 * 1024 * 1024; // 8 MB — covers any legit slip/proof

/** Hosts we serve uploads from (R2 public URL + this API's own origin). When a
 *  URL points at one of these we trust it outright; anything else must clear the
 *  private-range check below. */
function uploadOriginHosts(): string[] {
  const env = getEnv();
  const hosts: string[] = [];
  for (const u of [env.R2_PUBLIC_URL, env.PUBLIC_API_URL]) {
    if (!u) continue;
    try {
      hosts.push(new URL(u).hostname.toLowerCase());
    } catch {
      /* ignore malformed config */
    }
  }
  return hosts;
}

/** True for IP literals in private / loopback / link-local / ULA ranges — the
 *  classic SSRF targets (cloud metadata at 169.254.169.254, 10/172.16/192.168
 *  internals, ::1, etc.). Hostnames that aren't IP literals pass; we don't do DNS
 *  resolution here, the env allow-list covers the legitimate hosts. */
function isPrivateIpLiteral(host: string): boolean {
  const v = isIP(host);
  if (v === 4) {
    const p = host.split('.').map(Number);
    const [a = 0, b = 0] = p;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const h = host.toLowerCase();
    if (h === '::1' || h === '::') return true;
    if (h.startsWith('fc') || h.startsWith('fd')) return true; // ULA fc00::/7
    if (/^fe[89ab]/.test(h)) return true; // link-local fe80::/10
    return false;
  }
  return false;
}

async function fetchImage(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  // SSRF guard: a known upload origin is always fine; otherwise refuse internal
  // hosts so an attacker-supplied slip/proof/logo URL can't make the server fetch
  // private infrastructure or a cloud metadata endpoint.
  const host = parsed.hostname.toLowerCase();
  if (!uploadOriginHosts().includes(host) && isPrivateIpLiteral(host)) return null;
  try {
    // No automatic redirect-following — a 30x to an internal host would otherwise
    // re-open the SSRF hole the host check just closed.
    const res = await fetch(parsed, { redirect: 'manual' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_FETCH_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

/** pdfkit only embeds PNG/JPEG; swallow unsupported (webp/heic) or corrupt images. */
function safeImage(doc: PDFKit.PDFDocument, buf: Buffer | null, x: number, y: number, opts: PDFKit.Mixins.ImageOption) {
  if (!buf) return false;
  try {
    doc.image(buf, x, y, opts);
    return true;
  } catch {
    return false;
  }
}

type Doc = PDFKit.PDFDocument;
const LEFT = 40;
const RIGHT = 555; // A4 width 595 - margin

function hr(doc: Doc, y?: number) {
  const yy = y ?? doc.y;
  doc.moveTo(LEFT, yy).lineTo(RIGHT, yy).strokeColor('#d1d5db').lineWidth(1).stroke();
}

/** Two-column key/value row. */
function kv(doc: Doc, label: string, value: string) {
  const y = doc.y;
  doc.font('th').fontSize(10).fillColor('#6b7280').text(label, LEFT, y, { width: 130 });
  doc.font('th').fontSize(10).fillColor('#111827').text(value, LEFT + 135, y, { width: RIGHT - LEFT - 135 });
  doc.moveDown(0.3);
}

/** A right-aligned amount line (label … value). */
function amountRow(doc: Doc, label: string, value: string, bold = false) {
  const y = doc.y;
  doc.font(bold ? 'th-bold' : 'th').fontSize(bold ? 12 : 10).fillColor('#111827');
  doc.text(label, LEFT, y, { width: 340 });
  doc.text(value, LEFT + 340, y, { width: RIGHT - LEFT - 340, align: 'right' });
  doc.moveDown(0.35);
}

async function header(doc: Doc, data: JobDocData, type: DocType) {
  const s = data.settings;
  const logo = await fetchImage(s.companyLogoUrl);
  if (logo) safeImage(doc, logo, LEFT, 40, { fit: [70, 70] });
  const textX = logo ? LEFT + 82 : LEFT;
  doc.font('th-bold').fontSize(16).fillColor('#111827').text(s.companyName || 'MoveSook', textX, 42);
  doc.font('th').fontSize(9).fillColor('#6b7280');
  if (s.companyAddress) doc.text(s.companyAddress, textX, doc.y, { width: 300 });
  if (s.companyTaxId) doc.text(`เลขผู้เสียภาษี: ${s.companyTaxId}`, textX, doc.y);

  // Document title (right)
  doc.font('th-bold').fontSize(18).fillColor('#111827').text(DOC_TITLE[type], 300, 44, { width: RIGHT - 300, align: 'right' });
  doc.font('th').fontSize(9).fillColor('#6b7280').text(`เลขที่งาน: ${data.job.id}`, 300, doc.y, { width: RIGHT - 300, align: 'right' });
  doc.text(`วันที่ออก: ${fmtDate(new Date())}`, 300, doc.y, { width: RIGHT - 300, align: 'right' });

  doc.moveDown(1);
  hr(doc, 122);
  doc.y = 134;
}

function footer(doc: Doc, note?: string) {
  // Keep within the A4 bottom margin (≈802) so it doesn't spill onto a 2nd page.
  doc.font('th').fontSize(8).fillColor('#9ca3af');
  doc.text(note ?? 'เอกสารนี้ออกโดยระบบ MoveSook — ใช้เป็นหลักฐานประกอบธุรกรรม', LEFT, 788, {
    width: RIGHT - LEFT,
    align: 'center',
    lineBreak: false,
  });
}

function sectionTitle(doc: Doc, t: string) {
  doc.moveDown(0.5);
  doc.font('th-bold').fontSize(11).fillColor('#374151').text(t, LEFT);
  doc.moveDown(0.2);
}

function customerName(d: JobDocData) {
  return d.customer?.user?.displayName ?? d.customer?.name ?? '—';
}
function customerPhone(d: JobDocData) {
  return d.customer?.user?.phone ?? d.customer?.phone ?? '—';
}
function driverName(d: JobDocData) {
  return d.driver?.user?.displayName ?? d.driver?.name ?? '—';
}

function routeBlock(doc: Doc, job: Job, vehicleLabel: string) {
  sectionTitle(doc, 'เส้นทาง');
  kv(doc, 'ต้นทาง', `${job.originAddress} (${job.originProvince})`);
  kv(doc, 'ปลายทาง', `${job.destAddress} (${job.destProvince})`);
  kv(doc, 'ประเภทรถ', vehicleLabel);
}

// ── Document builders ─────────────────────────────────────────────────────────

async function buildReceipt(doc: Doc, d: JobDocData) {
  await header(doc, d, 'receipt');
  const { job } = d;
  sectionTitle(doc, 'ข้อมูลลูกค้า');
  kv(doc, 'ชื่อลูกค้า', customerName(d));
  kv(doc, 'เบอร์โทร', customerPhone(d));
  routeBlock(doc, job, d.vehicleLabel);

  sectionTitle(doc, 'รายละเอียดการชำระเงิน');
  doc.moveDown(0.2);
  amountRow(doc, `ค่าบริการขนย้าย (${PRICING_MODE_LABEL[job.pricingMode]})`, money(job.priceQuoted));
  if (job.discountAmount) amountRow(doc, `ส่วนลด${job.promoCode ? ` (${job.promoCode})` : ''}`, `-${money(job.discountAmount)}`);
  hr(doc, doc.y + 2);
  doc.moveDown(0.4);
  amountRow(doc, 'ยอดรวมที่ชำระ', money(job.priceQuoted), true);
  doc.moveDown(0.6);
  kv(doc, 'สถานะ', job.paymentApprovedAt ? 'ชำระเงินแล้ว ✓' : 'ยังไม่ชำระ');
  kv(doc, 'วันที่ชำระ', fmtDate(job.paymentApprovedAt));

  const slip = await fetchImage(job.paymentSlipUrl);
  if (slip) {
    sectionTitle(doc, 'หลักฐานการโอน');
    safeImage(doc, slip, LEFT, doc.y, { fit: [180, 220] });
  }
  footer(doc, 'ใบเสร็จรับเงิน — ยืนยันว่าบริษัทได้รับชำระเงินจากลูกค้าแล้ว');
}

async function buildPayout(doc: Doc, d: JobDocData) {
  await header(doc, d, 'payout');
  const { job, transaction: t } = d;
  sectionTitle(doc, 'ข้อมูลคนขับ');
  kv(doc, 'ชื่อคนขับ', driverName(d));
  kv(doc, 'เบอร์โทร', d.driver?.user?.phone ?? d.driver?.phone ?? '—');
  kv(doc, 'ทะเบียนรถ', d.driver?.plateNumber ?? '—');
  routeBlock(doc, job, d.vehicleLabel);

  sectionTitle(doc, 'การคำนวณค่าตอบแทน');
  doc.moveDown(0.2);
  amountRow(doc, 'ยอดรวมค่างาน', money(t?.grossAmount ?? job.priceQuoted));
  amountRow(doc, `หักค่าคอมมิชชั่น (${t?.commissionPct ?? job.commissionPct ?? 0}%)`, `-${money(t?.commissionAmount)}`);
  hr(doc, doc.y + 2);
  doc.moveDown(0.4);
  amountRow(doc, 'ยอดสุทธิจ่ายคนขับ', money(t?.netToDriver), true);
  doc.moveDown(0.6);
  kv(doc, 'สถานะการจ่าย', t?.status === 'PAID' ? 'จ่ายแล้ว ✓' : t?.status === 'REFUNDED' ? 'คืนเงิน' : 'รอจ่าย');

  const slip = await fetchImage(t?.slipUrl);
  if (slip) {
    sectionTitle(doc, 'หลักฐานการโอนให้คนขับ');
    safeImage(doc, slip, LEFT, doc.y, { fit: [180, 220] });
  }
  footer(doc, 'ใบสำคัญจ่าย — ยืนยันการจ่ายค่าตอบแทนให้คนขับ');
}

async function buildWorksheet(doc: Doc, d: JobDocData) {
  await header(doc, d, 'worksheet');
  const { job } = d;
  sectionTitle(doc, 'ข้อมูลทั่วไป');
  kv(doc, 'สถานะงาน', JOB_STATUS_LABEL[job.status]);
  kv(doc, 'ลูกค้า', `${customerName(d)} · ${customerPhone(d)}`);
  kv(doc, 'คนขับ', driverName(d));
  kv(doc, 'สร้างเมื่อ', fmtDate(job.createdAt));
  if (job.scheduledAt) kv(doc, 'นัดหมาย', fmtDate(job.scheduledAt));
  routeBlock(doc, job, d.vehicleLabel);

  sectionTitle(doc, 'รายการสิ่งของ');
  const items = (job.items as { name: string; quantity: number }[] | null) ?? [];
  if (items.length === 0) {
    doc.font('th').fontSize(10).fillColor('#6b7280').text(job.itemDescription || '—', LEFT);
  } else {
    items.forEach((it, i) =>
      doc.font('th').fontSize(10).fillColor('#111827').text(`${i + 1}. ${it.name} × ${it.quantity}`, LEFT),
    );
  }
  if (job.notes) {
    sectionTitle(doc, 'หมายเหตุ');
    doc.font('th').fontSize(10).fillColor('#111827').text(job.notes, LEFT, doc.y, { width: RIGHT - LEFT });
  }
  kv(doc, 'ราคา', money(job.priceQuoted));
  footer(doc, 'ใบสรุปงาน — บันทึกรายละเอียดงานสำหรับอ้างอิง');
}

async function buildDelivery(doc: Doc, d: JobDocData) {
  await header(doc, d, 'delivery');
  const { job } = d;
  kv(doc, 'ลูกค้า', `${customerName(d)} · ${customerPhone(d)}`);
  kv(doc, 'คนขับ', driverName(d));
  routeBlock(doc, job, d.vehicleLabel);
  kv(doc, 'ยืนยันรับของโดยลูกค้า', job.customerConfirmedAt ? `แล้ว · ${fmtDate(job.customerConfirmedAt)}` : 'ยังไม่ยืนยัน');

  // Embed up to 4 proof photos (pickup + delivery), best-effort.
  const proofs = [...(job.pickupProofUrls ?? []), ...(job.deliveryProofUrls ?? [])].slice(0, 4);
  if (proofs.length > 0) {
    sectionTitle(doc, 'รูปหลักฐาน (รับ/ส่งของ)');
    const imgs = await Promise.all(proofs.map(fetchImage));
    let x = LEFT;
    const top = doc.y;
    for (const buf of imgs) {
      if (safeImage(doc, buf, x, top, { fit: [120, 120] })) x += 128;
      if (x > RIGHT - 120) break;
    }
    doc.y = top + 130;
  }

  doc.moveDown(2);
  const sy = doc.y;
  doc.font('th').fontSize(10).fillColor('#111827');
  doc.text('....................................', LEFT, sy);
  doc.text('ผู้ส่งมอบ (คนขับ)', LEFT, sy + 16);
  doc.text('....................................', 340, sy);
  doc.text('ผู้รับมอบ (ลูกค้า)', 340, sy + 16);
  footer(doc, 'ใบส่งมอบสินค้า — หลักฐานการส่งมอบและรับมอบ');
}

const BUILDERS: Record<DocType, (doc: Doc, d: JobDocData) => Promise<void>> = {
  receipt: buildReceipt,
  payout: buildPayout,
  worksheet: buildWorksheet,
  delivery: buildDelivery,
};

/**
 * Content-addressed cache key for a rendered document. Hashing the full input
 * (type + job/relations + settings + resolved label) means any change that would
 * alter the output produces a *different* key — so a cache hit can never be stale,
 * and superseded versions simply age out of the bucket. Note: the header's
 * "issued on" date is baked into the cached bytes (it's the first-render time),
 * so repeat downloads of an unchanged document show a stable issue date — the
 * correct behaviour for a receipt/payout.
 */
function docCacheKey(type: DocType, data: JobDocData): string {
  const hash = createHash('sha256').update(JSON.stringify({ type, data })).digest('hex');
  return `doc/${type}/${hash}.pdf`;
}

/**
 * buildJobDocument + a content-addressed cache backed by the injected DocStore
 * (R2 in prod, local disk in dev). On a hit we skip the expensive remote image
 * fetches + pdfkit render entirely. Degrades gracefully: with no store configured
 * — or on any cache read/write error — it just renders inline as before. This is
 * the entrypoint callers should use; buildJobDocument stays the pure renderer.
 */
export async function renderJobDocument(type: DocType, data: JobDocData): Promise<Buffer> {
  const store = getDocStore();
  if (!store) return buildJobDocument(type, data);
  const key = docCacheKey(type, data);
  try {
    const cached = await store.get(key);
    if (cached) return cached;
  } catch (err) {
    getLogger().error({ err, key }, '[pdf] doc cache read failed — rendering fresh');
  }
  const pdf = await buildJobDocument(type, data);
  try {
    await store.put(key, pdf, 'application/pdf');
  } catch (err) {
    getLogger().error({ err, key }, '[pdf] doc cache write failed');
  }
  return pdf;
}

/** Render the requested document to a PDF Buffer. */
export function buildJobDocument(type: DocType, data: JobDocData): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    doc.registerFont('th', FONT_REG);
    doc.registerFont('th-bold', FONT_BOLD);
    doc.font('th');
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    BUILDERS[type](doc, data)
      .then(() => doc.end())
      .catch(reject);
  });
}
