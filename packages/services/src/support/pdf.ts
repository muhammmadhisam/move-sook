import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { getEnv, getDocStore, getLogger } from '../runtime/env';
import type { Job, Customer, Driver, User, Transaction } from '@movesook/db';
import {
  JOB_STATUS_LABEL,
  PRICING_MODE_LABEL,
  PAYMENT_METHOD_LABEL,
  CARGO_CATEGORY_LABELS,
  type SystemSettingsResponse,
} from '@movesook/shared';

const FONT_REG = fileURLToPath(new URL('../../assets/fonts/Sarabun-Regular.ttf', import.meta.url));
const FONT_BOLD = fileURLToPath(new URL('../../assets/fonts/Sarabun-Bold.ttf', import.meta.url));

export type DocType = 'receipt' | 'payout' | 'worksheet' | 'delivery';

export const DOC_TITLE: Record<DocType, string> = {
  receipt: 'ใบเสร็จรับเงิน',
  payout: 'ใบสำคัญจ่าย (ค่างานคนขับ)',
  worksheet: 'ใบสรุปงาน (Work Order)',
  delivery: 'ใบส่งมอบพัสดุ',
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

// ── Thai baht amount → words (the hallmark of a formal Thai receipt) ──────────
const TH_DIGITS = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const TH_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/** Read a non-negative integer string in formal Thai (handles ล้าน, ยี่สิบ, เอ็ด). */
function readThaiInteger(numStr: string): string {
  const s = numStr.replace(/^0+/, '');
  if (s === '') return '';
  // Recurse on each million group so very large amounts still read correctly.
  if (s.length > 6) {
    const head = s.slice(0, s.length - 6);
    const tail = s.slice(s.length - 6);
    return readThaiInteger(head) + 'ล้าน' + readThaiInteger(tail);
  }
  let out = '';
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const d = Number(s[i]);
    const place = len - i - 1;
    if (d === 0) continue;
    if (place === 0 && d === 1 && len > 1) out += 'เอ็ด';
    else if (place === 1 && d === 1) out += 'สิบ';
    else if (place === 1 && d === 2) out += 'ยี่สิบ';
    else out += (TH_DIGITS[d] ?? '') + (TH_PLACES[place] ?? '');
  }
  return out;
}

/** Format a baht amount as Thai words, e.g. 1250.50 → "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์". */
function bahtText(amount: number | null | undefined): string {
  const n = Math.round((amount ?? 0) * 100) / 100;
  const abs = Math.abs(n);
  const baht = Math.floor(abs);
  const satang = Math.round((abs - baht) * 100);
  if (baht === 0 && satang === 0) return 'ศูนย์บาทถ้วน';
  let out = n < 0 ? 'ลบ' : '';
  if (baht > 0) out += readThaiInteger(String(baht)) + 'บาท';
  out += satang > 0 ? readThaiInteger(String(satang)) + 'สตางค์' : 'ถ้วน';
  return out;
}

const DOC_PREFIX: Record<DocType, string> = {
  receipt: 'RCP',
  payout: 'PAY',
  worksheet: 'WO',
  delivery: 'DO',
};

/** A formal, deterministic document number: PREFIX-พ.ศ.-<last6 of job id>. */
function docNumber(type: DocType, job: Job): string {
  const short = job.id.slice(-6).toUpperCase();
  const year = new Date(job.createdAt).getFullYear() + 543; // Buddhist era
  return `${DOC_PREFIX[type]}-${year}-${short}`;
}

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
const PAGE_W = 595;

// ── Brand palette (matches the app: logo red + navy chrome) ──
const NAVY = '#0A1D35';
const RED = '#E0202A';
const INK = '#1f2937';
const SUBTLE = '#6b7280';
const FAINT = '#9ca3af';
const LINE = '#e5e7eb';
const WHITE = '#ffffff';
// Badge palette
const OK_BG = '#e7f6ec',
  OK_FG = '#15803d';
const WARN_BG = '#fef3c7',
  WARN_FG = '#b45309';
const INFO_BG = '#e8edf5',
  INFO_FG = NAVY;

/** Floor + lift availability as a single human-readable line. */
function fmtFloor(floor: number | null, lift: boolean | null): string {
  if (floor == null) return '—';
  const base = floor === 0 ? 'ชั้นล่าง' : `ชั้น ${floor}`;
  if (lift === true) return `${base} · มีลิฟต์`;
  if (lift === false) return `${base} · ไม่มีลิฟต์`;
  return base;
}

/** A restrained status tag (light tint + matching hairline border + a leading
 *  dot). Returns its width so callers can lay out a row. */
function badge(doc: Doc, text: string, x: number, y: number, fg: string, bg: string): number {
  doc.font('th-bold').fontSize(8.5);
  const w = doc.widthOfString(text) + 26;
  doc.roundedRect(x, y, w, 19, 4).fillAndStroke(bg, fg).strokeOpacity(1);
  doc.circle(x + 11, y + 9.5, 2.4).fill(fg);
  doc.fillColor(fg).font('th-bold').fontSize(8.5).text(text, x + 18, y + 5, { lineBreak: false });
  return w;
}

type Badge = { text: string; fg: string; bg: string };
function badgeRow(doc: Doc, badges: Badge[]) {
  doc.lineWidth(0.8);
  const y = doc.y;
  let x = LEFT;
  for (const b of badges) x += badge(doc, b.text, x, y, b.fg, b.bg) + 7;
  doc.y = y + 19;
  doc.moveDown(0.8);
}

async function header(doc: Doc, data: JobDocData, type: DocType) {
  const s = data.settings;
  // Full-bleed navy brand band + a thin brand-red rule beneath it.
  doc.rect(0, 0, PAGE_W, 96).fill(NAVY);
  doc.rect(0, 96, PAGE_W, 2.5).fill(RED);

  const logo = await fetchImage(s.companyLogoUrl);
  let textX = LEFT;
  if (logo) {
    // White chip so a dark/coloured logo still reads on the navy band.
    doc.roundedRect(LEFT, 20, 54, 54, 8).fill(WHITE);
    safeImage(doc, logo, LEFT + 4, 24, { fit: [46, 46] });
    textX = LEFT + 66;
  }
  doc.font('th-bold').fontSize(15).fillColor(WHITE).text(s.companyName || 'MoveSook', textX, 24, { width: 250 });
  doc.font('th').fontSize(8).fillColor('#aebcce');
  if (s.companyAddress) doc.text(s.companyAddress, textX, doc.y + 2, { width: 245, lineGap: 1 });
  if (s.companyTaxId) doc.text(`เลขประจำตัวผู้เสียภาษี ${s.companyTaxId}`, textX, doc.y + 1, { width: 245 });

  // Document title + meta (right side of band).
  doc.font('th-bold').fontSize(18).fillColor(WHITE).text(DOC_TITLE[type], 300, 24, { width: RIGHT - 300, align: 'right' });
  doc.font('th').fontSize(8.5).fillColor('#aebcce');
  doc.text(`เลขที่ ${docNumber(type, data.job)}`, 300, 52, { width: RIGHT - 300, align: 'right' });
  doc.text(`วันที่ออก ${fmtDate(new Date())}`, 300, doc.y + 1, { width: RIGHT - 300, align: 'right' });

  doc.y = 116;
  doc.fillColor(INK);
}

function footer(doc: Doc, note?: string) {
  // Hairline + caption pinned within the A4 bottom margin (≈802) — single page.
  doc.moveTo(LEFT, 778).lineTo(RIGHT, 778).strokeColor(LINE).lineWidth(0.8).stroke();
  doc.font('th').fontSize(8).fillColor(FAINT);
  doc.text(note ?? 'เอกสารนี้ออกโดยระบบ MoveSook — ใช้เป็นหลักฐานประกอบธุรกรรม', LEFT, 786, {
    width: RIGHT - LEFT,
    align: 'center',
    lineBreak: false,
  });
}

function sectionHeader(doc: Doc, t: string) {
  doc.moveDown(0.3);
  // Don't strand a heading at the bottom with its panel pushed to the next page —
  // reserve enough for the heading plus a typical panel so they break together.
  ensureSpace(doc, 120);
  const y = doc.y;
  doc.roundedRect(LEFT, y + 1, 3.5, 13, 1.5).fill(RED);
  doc.font('th-bold').fontSize(11.5).fillColor(NAVY).text(t, LEFT + 11, y, { width: RIGHT - LEFT - 11 });
  doc.moveDown(0.3);
}

// Largest y a panel may occupy before we spill to a fresh page. Keeps content
// clear of the footer hairline (778).
const CONTENT_BOTTOM = 762;

/** Start a new page (resetting to the top margin) when `needed` px won't fit. */
function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > CONTENT_BOTTOM) {
    doc.addPage();
    doc.y = 40;
  }
}

type GridRow = { label: string; value: string; full?: boolean };

/**
 * A clean ruled "definition table": white field, thin outer border, hairline
 * separators between rows. Each cell is a left-aligned grey label with the value
 * inline-bold beside it (invoice style); `full` rows span the whole width — used
 * for long values like addresses. Heights are measured first so it wraps exactly.
 */
function infoGrid(doc: Doc, rows: GridRow[]) {
  const x0 = LEFT,
    totalW = RIGHT - LEFT,
    padX = 13,
    padY = 11,
    colGap = 22,
    rowGap = 9,
    labelW = 86; // fixed gutter for the grey label, value fills the rest
  const innerW = totalW - padX * 2;
  const colW = (innerW - colGap) / 2;

  // Group rows into render lines: full rows stand alone, others pair up.
  const lines: GridRow[][] = [];
  let pending: GridRow | null = null;
  for (const r of rows) {
    if (r.full) {
      if (pending) {
        lines.push([pending]);
        pending = null;
      }
      lines.push([r]);
    } else if (pending) {
      lines.push([pending, r]);
      pending = null;
    } else {
      pending = r;
    }
  }
  if (pending) lines.push([pending]);

  const cellW = (cells: GridRow[]) => (cells.length === 1 && cells[0]?.full ? innerW : colW);
  // Row height = the taller of the (wrapped) label and value columns.
  const measure = (r: GridRow, cw: number) => {
    doc.font('th-bold').fontSize(10);
    const vh = doc.heightOfString(r.value || '—', { width: cw - labelW });
    doc.font('th').fontSize(8.5);
    const lh = doc.heightOfString(r.label, { width: labelW - 6 });
    return Math.max(13, vh, lh);
  };
  const lineHeights = lines.map((cells) => {
    const cw = cellW(cells);
    return Math.max(...cells.map((c) => measure(c, cw)));
  });

  const contentH = lineHeights.reduce((a, b) => a + b, 0) + rowGap * Math.max(0, lines.length - 1);
  const h = contentH + padY * 2;
  ensureSpace(doc, h);
  const y0 = doc.y;
  doc.roundedRect(x0, y0, totalW, h, 6).fillAndStroke(WHITE, LINE);

  let y = y0 + padY;
  lines.forEach((cells, i) => {
    // Hairline above every row except the first.
    if (i > 0) {
      doc
        .moveTo(x0 + padX, y - rowGap / 2)
        .lineTo(x0 + totalW - padX, y - rowGap / 2)
        .strokeColor('#eef1f4')
        .lineWidth(0.7)
        .stroke();
    }
    const cw = cellW(cells);
    let x = x0 + padX;
    for (const c of cells) {
      doc.font('th').fontSize(8.5).fillColor(SUBTLE).text(c.label, x, y + 1.5, { width: labelW - 6 });
      doc.font('th-bold').fontSize(10).fillColor(INK).text(c.value || '—', x + labelW, y, { width: cw - labelW });
      x += colW + colGap;
    }
    y += (lineHeights[i] ?? 0) + rowGap;
  });
  doc.y = y0 + h + 6;
}

type AmountLine = { label: string; value: string; muted?: boolean };
/**
 * A breakdown panel: plain rows, then a navy highlight bar for the grand total.
 * `words` (the grand total spelled out in Thai) renders as a formal caption row
 * below the bar — the convention on Thai receipts/payment vouchers.
 */
function amountsBlock(
  doc: Doc,
  lines: AmountLine[],
  grand: { label: string; value: string; words?: string },
) {
  const x0 = LEFT,
    w = RIGHT - LEFT,
    pad = 14,
    rowH = 19,
    barH = 34;
  const gap = lines.length ? 8 : 0;
  const wordsH = grand.words ? 20 : 0;
  const h = lines.length * rowH + gap + barH + wordsH + pad * 2;
  ensureSpace(doc, h);
  const y0 = doc.y;
  doc.roundedRect(x0, y0, w, h, 6).fillAndStroke(WHITE, LINE);

  let y = y0 + pad;
  lines.forEach((ln, i) => {
    if (i > 0) {
      doc
        .moveTo(x0 + pad, y - 2)
        .lineTo(x0 + w - pad, y - 2)
        .strokeColor('#eef1f4')
        .lineWidth(0.7)
        .stroke();
    }
    const color = ln.muted ? SUBTLE : INK;
    doc.font('th').fontSize(10.5).fillColor(color).text(ln.label, x0 + pad, y + 1, { width: w - pad * 2 - 110 });
    doc.font('th').fontSize(10.5).fillColor(color).text(ln.value, x0 + pad, y + 1, { width: w - pad * 2, align: 'right' });
    y += rowH;
  });
  y += gap;
  doc.roundedRect(x0 + pad, y, w - pad * 2, barH, 6).fill(NAVY);
  const ty = y + (barH - 13) / 2;
  doc.font('th-bold').fontSize(11.5).fillColor(WHITE).text(grand.label, x0 + pad + 12, ty + 1, { width: w - pad * 2 - 24 - 140 });
  doc.font('th-bold').fontSize(13).fillColor(WHITE).text(grand.value, x0 + pad + 12, ty, { width: w - pad * 2 - 24, align: 'right' });
  if (grand.words) {
    const wy = y + barH + 6;
    doc
      .font('th')
      .fontSize(8.5)
      .fillColor(SUBTLE)
      .text('(ตัวอักษร)  ', x0 + pad, wy, { continued: true, lineBreak: false })
      .font('th-bold')
      .fillColor(NAVY)
      .text(grand.words, { lineBreak: false });
  }
  doc.y = y0 + h + 6;
}

type ItemRow = { no: string; name: string; qty: string };
/** A proper line-items table: grey header row (ลำดับ / รายการ / จำนวน), hairline
 *  separated body rows, thin outer border. */
function itemsTable(doc: Doc, rows: ItemRow[]) {
  const x0 = LEFT,
    w = RIGHT - LEFT,
    padX = 12,
    headH = 24,
    rowPadY = 7;
  const noW = 44,
    qtyW = 70;
  const nameW = w - noW - qtyW - padX * 2;
  const nameX = x0 + padX + noW;
  const qtyX = x0 + w - padX - qtyW;

  doc.font('th').fontSize(9.5);
  const bodyHs = rows.map((r) => Math.max(13, doc.heightOfString(r.name, { width: nameW - 6 })) + rowPadY * 2);
  const h = headH + bodyHs.reduce((a, b) => a + b, 0);
  ensureSpace(doc, h);
  const y0 = doc.y;

  // Outer frame + header band.
  doc.roundedRect(x0, y0, w, h, 6).fillAndStroke(WHITE, LINE);
  doc.save();
  doc.roundedRect(x0, y0, w, headH + 6, 6).clip();
  doc.rect(x0, y0, w, headH).fill('#f1f5f9');
  doc.restore();
  doc.font('th-bold').fontSize(9).fillColor(SUBTLE);
  doc.text('ลำดับ', x0 + padX, y0 + 8, { width: noW - 6 });
  doc.text('รายการ', nameX, y0 + 8, { width: nameW });
  doc.text('จำนวน', qtyX, y0 + 8, { width: qtyW, align: 'right' });

  let y = y0 + headH;
  rows.forEach((r, i) => {
    if (i > 0) {
      doc.moveTo(x0 + padX, y).lineTo(x0 + w - padX, y).strokeColor('#eef1f4').lineWidth(0.7).stroke();
    }
    const ty = y + rowPadY;
    doc.font('th').fontSize(9.5).fillColor(SUBTLE).text(r.no, x0 + padX, ty, { width: noW - 6 });
    doc.font('th').fontSize(9.5).fillColor(INK).text(r.name, nameX, ty, { width: nameW - 6 });
    doc.font('th-bold').fontSize(9.5).fillColor(INK).text(r.qty, qtyX, ty, { width: qtyW, align: 'right' });
    y += bodyHs[i] ?? 0;
  });
  doc.y = y0 + h + 6;
}

/** An empty bordered area for handwritten remarks (e.g. cargo condition on a
 *  delivery note) — gives a short doc visual weight and a useful field. */
function remarksBox(doc: Doc, label: string, h = 70) {
  const x0 = LEFT,
    w = RIGHT - LEFT;
  ensureSpace(doc, h + 6);
  const y0 = doc.y;
  doc.roundedRect(x0, y0, w, h, 6).fillAndStroke(WHITE, LINE);
  doc.font('th').fontSize(8.5).fillColor(FAINT).text(label, x0 + 12, y0 + 9, { width: w - 24 });
  doc.y = y0 + h + 6;
}

/** A soft amber callout panel for free-text special instructions. */
function notePanel(doc: Doc, text: string) {
  const x0 = LEFT,
    w = RIGHT - LEFT,
    pad = 12;
  doc.font('th').fontSize(10);
  const th = doc.heightOfString(text, { width: w - pad * 2 });
  const h = th + pad * 2;
  ensureSpace(doc, h);
  const y0 = doc.y;
  doc.roundedRect(x0, y0, w, h, 7).fillAndStroke('#fffbeb', '#fcd34d');
  doc.font('th').fontSize(10).fillColor('#92400e').text(text, x0 + pad, y0 + pad, { width: w - pad * 2 });
  doc.y = y0 + h + 6;
}

/** A framed photo (white mat + hairline border). Advances doc.y past it. */
function photoFrame(doc: Doc, buf: Buffer | null, x: number, y: number, w: number, h: number) {
  doc.roundedRect(x, y, w, h, 6).fillAndStroke(WHITE, LINE);
  safeImage(doc, buf, x + 5, y + 5, { fit: [w - 10, h - 10] });
  doc.y = y + h + 6;
}

/**
 * A two-column signature block (line + role caption + date). `pinBottom` pushes
 * it toward the page foot (formal placement for a delivery note); otherwise it
 * sits at the current cursor, reserving its own space.
 */
function signatureRow(doc: Doc, leftLabel: string, rightLabel: string, pinBottom = false) {
  doc.moveDown(1.4);
  ensureSpace(doc, 76);
  const y = pinBottom ? Math.max(doc.y, 656) : doc.y;
  const colW = (RIGHT - LEFT - 40) / 2;
  const lineY = y + 34;
  doc.strokeColor('#9ca3af').lineWidth(0.8);
  doc.moveTo(LEFT, lineY).lineTo(LEFT + colW, lineY).stroke();
  doc.moveTo(RIGHT - colW, lineY).lineTo(RIGHT, lineY).stroke();
  doc.font('th').fontSize(9).fillColor(SUBTLE);
  doc.text(leftLabel, LEFT, lineY + 6, { width: colW, align: 'center' });
  doc.text(rightLabel, RIGHT - colW, lineY + 6, { width: colW, align: 'center' });
  doc.font('th').fontSize(8).fillColor(FAINT);
  doc.text('วันที่ ......... / ......... / .........', LEFT, lineY + 22, { width: colW, align: 'center' });
  doc.text('วันที่ ......... / ......... / .........', RIGHT - colW, lineY + 22, { width: colW, align: 'center' });
  doc.y = lineY + 40;
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
function driverPhone(d: JobDocData) {
  return d.driver?.user?.phone ?? d.driver?.phone ?? '—';
}
function routeRows(job: Job): GridRow[] {
  return [
    { label: 'ต้นทาง', value: `${job.originAddress} (${job.originProvince})`, full: true },
    { label: 'ปลายทาง', value: `${job.destAddress} (${job.destProvince})`, full: true },
  ];
}

// ── Document builders ─────────────────────────────────────────────────────────

async function buildReceipt(doc: Doc, d: JobDocData) {
  await header(doc, d, 'receipt');
  const { job } = d;
  badgeRow(doc, [
    job.paymentApprovedAt
      ? { text: 'ชำระเงินแล้ว', fg: OK_FG, bg: OK_BG }
      : { text: 'รอชำระเงิน', fg: WARN_FG, bg: WARN_BG },
    { text: PAYMENT_METHOD_LABEL[job.paymentMethod], fg: INFO_FG, bg: INFO_BG },
  ]);

  sectionHeader(doc, 'ข้อมูลลูกค้า');
  infoGrid(doc, [
    { label: 'ชื่อลูกค้า', value: customerName(d) },
    { label: 'เบอร์โทร', value: customerPhone(d) },
    { label: 'เบอร์ติดต่อหน้างาน', value: job.contactPhone ?? '—' },
    { label: 'วันที่สร้างงาน', value: fmtDate(job.createdAt) },
  ]);

  sectionHeader(doc, 'รายละเอียดการขนส่ง');
  infoGrid(doc, [
    ...routeRows(job),
    { label: 'ประเภทรถ', value: d.vehicleLabel },
    { label: 'รูปแบบราคา', value: PRICING_MODE_LABEL[job.pricingMode] },
  ]);

  sectionHeader(doc, 'สรุปการชำระเงิน');
  const breakdown: AmountLine[] = [
    { label: `ค่าบริการขนย้าย (${PRICING_MODE_LABEL[job.pricingMode]})`, value: money(job.priceQuoted) },
  ];
  if (job.discountAmount)
    breakdown.push({
      label: `ส่วนลด${job.promoCode ? ` (${job.promoCode})` : ''}`,
      value: `-${money(job.discountAmount)}`,
      muted: true,
    });
  amountsBlock(doc, breakdown, {
    label: 'ยอดรวมที่ชำระ',
    value: money(job.priceQuoted),
    words: bahtText(job.priceQuoted),
  });

  infoGrid(doc, [
    { label: 'สถานะการชำระ', value: job.paymentApprovedAt ? 'ชำระเงินแล้ว' : 'ยังไม่ชำระ' },
    { label: 'วันที่ชำระ', value: fmtDate(job.paymentApprovedAt) },
  ]);

  const slip = await fetchImage(job.paymentSlipUrl);
  if (slip) {
    sectionHeader(doc, 'หลักฐานการโอนเงิน');
    photoFrame(doc, slip, LEFT, doc.y, 170, 210);
  }
  signatureRow(doc, 'ลงชื่อผู้รับเงิน', 'ลงชื่อผู้มีอำนาจลงนาม / ประทับตรา');
  footer(doc, 'ใบเสร็จรับเงิน · ยืนยันว่าบริษัทได้รับชำระเงินจากลูกค้าเรียบร้อยแล้ว');
}

async function buildPayout(doc: Doc, d: JobDocData) {
  await header(doc, d, 'payout');
  const { job, transaction: t } = d;
  badgeRow(doc, [
    t?.status === 'PAID'
      ? { text: 'จ่ายแล้ว', fg: OK_FG, bg: OK_BG }
      : t?.status === 'REFUNDED'
        ? { text: 'คืนเงิน', fg: INFO_FG, bg: INFO_BG }
        : { text: 'รอจ่าย', fg: WARN_FG, bg: WARN_BG },
    { text: PAYMENT_METHOD_LABEL[job.paymentMethod], fg: INFO_FG, bg: INFO_BG },
  ]);

  sectionHeader(doc, 'ข้อมูลคนขับ');
  infoGrid(doc, [
    { label: 'ชื่อคนขับ', value: driverName(d) },
    { label: 'เบอร์โทร', value: driverPhone(d) },
    { label: 'ทะเบียนรถ', value: d.driver?.plateNumber ?? '—' },
    { label: 'ประเภทรถ', value: d.vehicleLabel },
  ]);

  sectionHeader(doc, 'เส้นทาง');
  infoGrid(doc, routeRows(job));

  sectionHeader(doc, 'การคำนวณค่าตอบแทน');
  amountsBlock(
    doc,
    [
      { label: 'ยอดรวมค่างาน', value: money(t?.grossAmount ?? job.priceQuoted) },
      {
        label: `หักค่าคอมมิชชั่น (${t?.commissionPct ?? job.commissionPct ?? 0}%)`,
        value: `-${money(t?.commissionAmount)}`,
        muted: true,
      },
    ],
    { label: 'ยอดสุทธิจ่ายคนขับ', value: money(t?.netToDriver), words: bahtText(t?.netToDriver) },
  );

  infoGrid(doc, [
    {
      label: 'สถานะการจ่าย',
      value: t?.status === 'PAID' ? 'จ่ายแล้ว' : t?.status === 'REFUNDED' ? 'คืนเงิน' : 'รอจ่าย',
    },
    { label: 'วันที่ทำรายการ', value: fmtDate(t?.createdAt ?? null) },
  ]);

  const slip = await fetchImage(t?.slipUrl);
  if (slip) {
    sectionHeader(doc, 'หลักฐานการโอนให้คนขับ');
    photoFrame(doc, slip, LEFT, doc.y, 170, 210);
  }
  signatureRow(doc, 'ลงชื่อผู้รับเงิน (คนขับ)', 'ลงชื่อผู้จ่ายเงิน');
  footer(doc, 'ใบสำคัญจ่าย · ยืนยันการจ่ายค่าตอบแทนให้คนขับ');
}

async function buildWorksheet(doc: Doc, d: JobDocData) {
  await header(doc, d, 'worksheet');
  const { job } = d;
  badgeRow(doc, [
    { text: JOB_STATUS_LABEL[job.status], fg: INFO_FG, bg: INFO_BG },
    { text: PAYMENT_METHOD_LABEL[job.paymentMethod], fg: INFO_FG, bg: INFO_BG },
    { text: PRICING_MODE_LABEL[job.pricingMode], fg: INFO_FG, bg: INFO_BG },
  ]);

  sectionHeader(doc, 'ผู้เกี่ยวข้อง');
  infoGrid(doc, [
    { label: 'ลูกค้า', value: customerName(d) },
    { label: 'เบอร์ลูกค้า', value: customerPhone(d) },
    { label: 'คนขับ', value: driverName(d) },
    { label: 'เบอร์คนขับ', value: driverPhone(d) },
    { label: 'ทะเบียนรถ', value: d.driver?.plateNumber ?? '—' },
    { label: 'ประเภทรถ', value: d.vehicleLabel },
  ]);

  sectionHeader(doc, 'รายละเอียดงาน');
  infoGrid(doc, [
    { label: 'สร้างเมื่อ', value: fmtDate(job.createdAt) },
    { label: 'นัดหมาย', value: fmtDate(job.scheduledAt) },
    {
      label: 'หมวดพัสดุ',
      value: job.itemCategory ? (CARGO_CATEGORY_LABELS[job.itemCategory] ?? job.itemCategory) : '—',
    },
    { label: 'จำนวนชิ้น', value: job.itemCount != null ? `${job.itemCount} ชิ้น (โดยประมาณ)` : '—' },
    { label: 'ต้องการคนช่วยยก', value: job.needsHelpers ? 'ต้องการ' : 'ไม่ต้องการ' },
    { label: 'เบอร์ติดต่อหน้างาน', value: job.contactPhone ?? '—' },
    { label: 'มูลค่างาน', value: money(job.priceQuoted) },
    { label: 'รูปแบบราคา', value: PRICING_MODE_LABEL[job.pricingMode] },
  ]);

  sectionHeader(doc, 'เส้นทาง');
  infoGrid(doc, [
    ...routeRows(job),
    { label: 'จุดรับของ', value: fmtFloor(job.originFloor, job.originHasElevator) },
    { label: 'จุดส่งของ', value: fmtFloor(job.destFloor, job.destHasElevator) },
  ]);

  sectionHeader(doc, 'รายการพัสดุ');
  const items = (job.items as { name: string; quantity: number }[] | null) ?? [];
  const itemRows: ItemRow[] = items.length
    ? items.map((it, i) => ({ no: String(i + 1), name: it.name, qty: `${it.quantity}` }))
    : [{ no: '1', name: job.itemDescription || '—', qty: '—' }];
  itemsTable(doc, itemRows);

  if (job.notes) {
    sectionHeader(doc, 'หมายเหตุพิเศษ');
    notePanel(doc, job.notes);
  }
  footer(doc, 'ใบสรุปงาน · บันทึกรายละเอียดงานสำหรับอ้างอิงภายใน');
}

async function buildDelivery(doc: Doc, d: JobDocData) {
  await header(doc, d, 'delivery');
  const { job } = d;
  badgeRow(doc, [
    job.customerConfirmedAt
      ? { text: 'ลูกค้ายืนยันรับของแล้ว', fg: OK_FG, bg: OK_BG }
      : { text: 'รอลูกค้ายืนยัน', fg: WARN_FG, bg: WARN_BG },
  ]);

  sectionHeader(doc, 'ข้อมูลการส่งมอบ');
  infoGrid(doc, [
    { label: 'ลูกค้า', value: customerName(d) },
    { label: 'เบอร์ลูกค้า', value: customerPhone(d) },
    { label: 'คนขับ', value: driverName(d) },
    { label: 'เบอร์คนขับ', value: driverPhone(d) },
    { label: 'ทะเบียนรถ', value: d.driver?.plateNumber ?? '—' },
    { label: 'ยืนยันรับของเมื่อ', value: job.customerConfirmedAt ? fmtDate(job.customerConfirmedAt) : 'ยังไม่ยืนยัน' },
  ]);

  sectionHeader(doc, 'เส้นทาง');
  infoGrid(doc, routeRows(job));

  // Embed up to 4 proof photos (pickup + delivery), best-effort, each framed.
  const proofs = [...(job.pickupProofUrls ?? []), ...(job.deliveryProofUrls ?? [])].slice(0, 4);
  if (proofs.length > 0) {
    sectionHeader(doc, 'รูปหลักฐานการรับ–ส่งของ');
    const imgs = await Promise.all(proofs.map(fetchImage));
    const cell = 120,
      gap = 8;
    let x = LEFT;
    const top = doc.y;
    for (const buf of imgs) {
      doc.roundedRect(x, top, cell, cell, 6).fillAndStroke(WHITE, LINE);
      safeImage(doc, buf, x + 4, top + 4, { fit: [cell - 8, cell - 8] });
      x += cell + gap;
      if (x > RIGHT - cell) break;
    }
    doc.y = top + cell + 10;
  }

  sectionHeader(doc, 'หมายเหตุการรับมอบ');
  // Grow the remarks field to absorb leftover space so a short note doesn't leave
  // a large void above the foot-pinned signatures (caps out on a photo-heavy page).
  const fill = Math.max(72, Math.min(240, 612 - doc.y));
  remarksBox(doc, 'โปรดระบุสภาพสินค้า / ความเสียหาย (ถ้ามี) ก่อนลงนามรับมอบ', fill);

  signatureRow(doc, 'ลงชื่อผู้ส่งมอบ (คนขับ)', 'ลงชื่อผู้รับมอบ (ลูกค้า)', true);
  footer(doc, 'ใบส่งมอบพัสดุ · หลักฐานการส่งมอบและรับมอบพัสดุ');
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
// Bump when the renderer/layout changes so previously-cached PDFs (keyed only on
// type+data) don't keep serving the old design — new key, old bytes age out.
const LAYOUT_VERSION = 4;

function docCacheKey(type: DocType, data: JobDocData): string {
  const hash = createHash('sha256')
    .update(JSON.stringify({ v: LAYOUT_VERSION, type, data }))
    .digest('hex');
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
      .then(() => {
        // Stamp "หน้า x/y" on every buffered page (only meaningful when a doc
        // spills past one page, but harmless otherwise). pdfkit's bundled types
        // omit the page-buffer API, so narrow it here.
        const paged = doc as Doc & {
          bufferedPageRange(): { start: number; count: number };
          switchToPage(n: number): void;
        };
        const range = paged.bufferedPageRange();
        if (range.count > 1) {
          for (let i = 0; i < range.count; i++) {
            paged.switchToPage(range.start + i);
            doc
              .font('th')
              .fontSize(8)
              .fillColor(FAINT)
              .text(`หน้า ${i + 1}/${range.count}`, LEFT, 790, {
                width: RIGHT - LEFT,
                align: 'right',
                lineBreak: false,
              });
          }
        }
        doc.end();
      })
      .catch(reject);
  });
}
