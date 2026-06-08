import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ───────────────────────── helpers ─────────────────────────
const DAY = 86_400_000;
const HOUR = 3_600_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const hoursAgo = (n: number) => new Date(Date.now() - n * HOUR);
const minsAgo = (n: number) => new Date(Date.now() - n * 60_000);

const COMMISSION_PCT = 12;
const split = (gross: number, pct: number) => {
  const commissionAmount = Math.round((gross * pct) / 100);
  return { commissionAmount, netToDriver: gross - commissionAmount };
};

// Real-ish coordinates for the southern provinces we serve.
const PLACE = {
  hatyai: { lat: 7.0086, lng: 100.4747 }, // อ.หาดใหญ่ สงขลา
  songkhla: { lat: 7.1988, lng: 100.5951 }, // อ.เมือง สงขลา
  pattani: { lat: 6.8694, lng: 101.2502 }, // อ.เมือง ปัตตานี
  yala: { lat: 6.5413, lng: 101.2803 }, // อ.เมือง ยะลา
  nakhonsi: { lat: 8.4304, lng: 99.9631 }, // อ.เมือง นครศรีธรรมราช
  phatthalung: { lat: 7.6167, lng: 100.0742 }, // อ.เมือง พัทลุง
};

/** Wipe all data (FK-safe order: children → parents) so the seed is a clean reset. */
async function reset() {
  await prisma.review.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.customerNote.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.job.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.adminCredential.deleteMany();
  await prisma.blacklist.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.vehiclePricing.deleteMany();
  await prisma.serviceArea.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await reset();

  // ── AppSettings (commission / pricing / system) ──────────────────────────
  await prisma.appSetting.createMany({
    data: [
      { key: 'commission_pct', value: String(COMMISSION_PCT) },
      { key: 'price_per_km', value: '20' },
      { key: 'base_fee', value: '150' },
      { key: 'min_price', value: '300' },
      { key: 'surge_multiplier', value: '1.0' },
      { key: 'support_phone', value: '074-000-000' },
      { key: 'support_line', value: '@movesook' },
    ],
  });

  // ── Service areas ─────────────────────────────────────────────────────────
  await prisma.serviceArea.createMany({
    data: [
      { province: 'สงขลา', isActive: true },
      { province: 'ปัตตานี', isActive: true },
      { province: 'ยะลา', isActive: true },
      { province: 'นครศรีธรรมราช', isActive: true },
      { province: 'พัทลุง', isActive: true },
      { province: 'สตูล', isActive: false }, // served soon — toggled off
    ],
  });

  // ── Vehicle pricing (4 types; TRUCK_6W not yet open for sign-ups) ─────────
  await prisma.vehiclePricing.createMany({
    data: [
      {
        vehicleType: 'MOTORCYCLE',
        label: 'มอเตอร์ไซค์',
        description: 'ของชิ้นเล็ก เอกสาร พัสดุ',
        requirements: 'มอเตอร์ไซค์สภาพดี มีกล่อง/ตะกร้าท้าย',
        maxWeightKg: 30,
        pricePerKm: 10,
        isActive: true,
      },
      {
        vehicleType: 'PICKUP',
        label: 'กระบะตอนเดียว',
        description: 'เฟอร์นิเจอร์ขนาดเล็ก-กลาง ย้ายหอ/คอนโด',
        requirements: 'กระบะสภาพดี มีผ้าใบ/สายรัดของ',
        maxWeightKg: 1000,
        pricePerKm: 20,
        isActive: true,
      },
      {
        vehicleType: 'TRUCK_4W',
        label: 'รถบรรทุก 4 ล้อ',
        description: 'ย้ายบ้านขนาดกลาง',
        requirements: 'รถ 4 ล้อตู้ทึบ/คอก พร้อมอุปกรณ์ยึดของ',
        maxWeightKg: 2000,
        pricePerKm: 28,
        isActive: true,
      },
      {
        vehicleType: 'TRUCK_6W',
        label: 'รถบรรทุก 6 ล้อ',
        description: 'ย้ายบ้านหลังใหญ่ สำนักงาน',
        requirements: 'รถ 6 ล้อ พร้อมคนช่วยยก',
        maxWeightKg: 6000,
        pricePerKm: 40,
        isActive: false,
      },
    ],
  });

  // ── Promo codes (various states) ──────────────────────────────────────────
  await prisma.promoCode.createMany({
    data: [
      { code: 'WELCOME10', type: 'PERCENT', value: 10, minOrder: 500, maxUses: 1000, usedCount: 37, isActive: true },
      { code: 'SAVE100', type: 'FIXED', value: 100, minOrder: 1000, maxUses: 500, usedCount: 12, isActive: true },
      { code: 'MOVE15', type: 'PERCENT', value: 15, minOrder: 1500, isActive: true },
      { code: 'NEWYEAR', type: 'PERCENT', value: 20, minOrder: 800, usedCount: 200, expiresAt: daysAgo(30), isActive: false }, // expired
      { code: 'SOLDOUT', type: 'FIXED', value: 50, maxUses: 50, usedCount: 50, isActive: true }, // fully used
    ],
  });

  // ── Admins (RBAC tiers; password = changeme123) ───────────────────────────
  const passwordHash = await bcrypt.hash('changeme123', 12);
  const adminSeeds = [
    { lineUserId: 'seed-admin-super', displayName: 'ผู้ดูแลระบบ (Super)', email: 'admin@movesook.local', adminRole: 'SUPER' as const },
    { lineUserId: 'seed-admin-ops', displayName: 'ฝ่ายปฏิบัติการ', email: 'ops@movesook.local', adminRole: 'OPS' as const },
    { lineUserId: 'seed-admin-finance', displayName: 'ฝ่ายการเงิน', email: 'finance@movesook.local', adminRole: 'FINANCE' as const },
  ];
  const admins: Record<string, string> = {}; // adminRole -> userId
  for (const a of adminSeeds) {
    const u = await prisma.user.create({
      data: { lineUserId: a.lineUserId, displayName: a.displayName, role: 'ADMIN' },
    });
    await prisma.adminCredential.create({
      data: { userId: u.id, email: a.email, passwordHash, adminRole: a.adminRole },
    });
    admins[a.adminRole] = u.id;
  }
  const superAdminId = admins.SUPER!;
  const opsAdminId = admins.OPS!;
  const financeAdminId = admins.FINANCE!;

  // ── Self-serve customers (User + Customer profile) ────────────────────────
  type Seeded = { userId: string; customerId: string; name: string };
  const makeCustomer = async (opts: {
    line: string;
    name: string;
    phone: string;
    role?: 'USER';
    isBanned?: boolean;
    referralCode?: string;
    referredById?: string;
    tags?: string[];
  }): Promise<Seeded> => {
    const u = await prisma.user.create({
      data: {
        lineUserId: opts.line,
        displayName: opts.name,
        phone: opts.phone,
        role: 'USER',
        isBanned: opts.isBanned ?? false,
      },
    });
    const c = await prisma.customer.create({
      data: {
        userId: u.id,
        name: opts.name,
        phone: opts.phone,
        referralCode: opts.referralCode,
        referredById: opts.referredById,
        tags: opts.tags ?? [],
      },
    });
    return { userId: u.id, customerId: c.id, name: opts.name };
  };

  const c1 = await makeCustomer({ line: 'seed-user-1', name: 'สมชาย ใจดี', phone: '081-111-1111', referralCode: 'SOMCHAI1', tags: ['vip', 'repeat'] });
  const c2 = await makeCustomer({ line: 'seed-user-2', name: 'สมหญิง รักบ้าน', phone: '081-222-2222', referredById: c1.customerId, tags: ['repeat'] });
  const c3 = await makeCustomer({ line: 'seed-user-3', name: 'อนันต์ ขนของ', phone: '081-333-3333' });
  const c4 = await makeCustomer({ line: 'seed-user-4', name: 'มานี มีนา', phone: '081-444-4444', tags: ['new'] });
  const c5 = await makeCustomer({ line: 'seed-user-5', name: 'วิภา เรียบร้อย', phone: '081-555-5555' });
  const cBanned = await makeCustomer({ line: 'seed-user-banned', name: 'ปรีชา ถูกแบน', phone: '081-666-6666', isBanned: true });

  // ── Offline customers (admin-entered, no app account) ─────────────────────
  const offlineAuntie = await prisma.customer.create({
    data: { name: 'คุณป้าโทรจอง', phone: '081-000-0000', note: 'โทรมาจองทางโทรศัพท์ ไม่มีแอป', createdById: opsAdminId, tags: ['offline'] },
  });
  const offlineShop = await prisma.customer.create({
    data: { name: 'ร้านเฟอร์นิเจอร์ ABC', phone: '074-123-456', note: 'ลูกค้าองค์กร ส่งของประจำ', createdById: opsAdminId, tags: ['offline', 'business'] },
  });

  // ── Customer CRM notes ─────────────────────────────────────────────────────
  await prisma.customerNote.createMany({
    data: [
      { customerId: c1.customerId, authorId: opsAdminId, body: 'ลูกค้าประจำ ใช้บริการเดือนละ 1-2 ครั้ง พูดจาสุภาพ' },
      { customerId: c1.customerId, authorId: superAdminId, body: 'เคยร้องเรียนเรื่องของเสียหาย แก้ไขแล้ว ปิดเคส' },
      { customerId: offlineShop.id, authorId: opsAdminId, body: 'ตกลงเรตพิเศษสำหรับลูกค้าองค์กร' },
    ],
  });

  // ── Consents (PDPA) ─────────────────────────────────────────────────────────
  await prisma.consentRecord.createMany({
    data: [
      { userId: c1.userId, type: 'TERMS', version: '1.0', granted: true },
      { userId: c1.userId, type: 'PRIVACY', version: '1.0', granted: true },
      { userId: c1.userId, type: 'MARKETING', version: '1.0', granted: true },
      { userId: c2.userId, type: 'TERMS', version: '1.0', granted: true },
      { userId: c2.userId, type: 'PRIVACY', version: '1.0', granted: true },
      { userId: c2.userId, type: 'MARKETING', version: '1.0', granted: false },
      { userId: c3.userId, type: 'TERMS', version: '1.0', granted: true },
      { userId: c3.userId, type: 'PRIVACY', version: '1.0', granted: true },
    ],
  });

  // ── Drivers ─────────────────────────────────────────────────────────────────
  type SeededDriver = { driverId: string; userId: string; name: string };
  const makeDriver = async (opts: {
    line: string;
    name: string;
    phone: string;
    vehicleType: 'MOTORCYCLE' | 'PICKUP' | 'TRUCK_4W' | 'TRUCK_6W';
    plate: string;
    province: string;
    verifyStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
    isAvailable?: boolean;
    rejectionReason?: string;
    submittedAt?: Date;
    lastActiveAt?: Date;
    location?: { lat: number; lng: number };
    bank?: { name: string; no: string };
  }): Promise<SeededDriver> => {
    const u = await prisma.user.create({
      data: { lineUserId: opts.line, displayName: opts.name, phone: opts.phone, role: 'DRIVER' },
    });
    const d = await prisma.driver.create({
      data: {
        userId: u.id,
        name: opts.name,
        phone: opts.phone,
        vehicleType: opts.vehicleType,
        plateNumber: opts.plate,
        serviceProvince: opts.province,
        verifyStatus: opts.verifyStatus,
        isAvailable: opts.isAvailable ?? false,
        rejectionReason: opts.rejectionReason,
        submittedAt: opts.submittedAt,
        lastActiveAt: opts.lastActiveAt,
        lastLat: opts.location?.lat,
        lastLng: opts.location?.lng,
        locationAt: opts.location ? minsAgo(3) : undefined,
        licenseTw2: 'https://placehold.co/600x400?text=License',
        nationalId: '1909800' + Math.floor(100000 + Math.random() * 899999),
        nationalIdUrl: 'https://placehold.co/600x400?text=NationalID',
        licenseNo: 'DL' + opts.plate.replace(/\s/g, ''),
        licenseExpiry: daysAgo(-400),
        vehicleRegUrl: 'https://placehold.co/600x400?text=VehicleReg',
        vehicleRegExpiry: daysAgo(-200),
        insuranceExpiry: daysAgo(-120),
        bankName: opts.bank?.name,
        bankAccountName: opts.name,
        bankAccountNo: opts.bank?.no,
      },
    });
    return { driverId: d.id, userId: u.id, name: opts.name };
  };

  // 3 approved + online
  const d1 = await makeDriver({ line: 'seed-driver-1', name: 'ก้อง คนขับ', phone: '082-111-1111', vehicleType: 'PICKUP', plate: 'กข 1234', province: 'สงขลา', verifyStatus: 'APPROVED', isAvailable: true, lastActiveAt: minsAgo(5), location: PLACE.hatyai, bank: { name: 'กสิกรไทย', no: '123-4-56789-0' } });
  const d2 = await makeDriver({ line: 'seed-driver-2', name: 'หนุ่ม รถบรรทุก', phone: '082-222-2222', vehicleType: 'TRUCK_4W', plate: 'คง 5678', province: 'สงขลา', verifyStatus: 'APPROVED', isAvailable: true, lastActiveAt: minsAgo(20), location: PLACE.songkhla, bank: { name: 'ไทยพาณิชย์', no: '234-5-67890-1' } });
  const d3 = await makeDriver({ line: 'seed-driver-3', name: 'แดง มอไซค์', phone: '082-333-3333', vehicleType: 'MOTORCYCLE', plate: 'งจ 4321', province: 'ปัตตานี', verifyStatus: 'APPROVED', isAvailable: true, lastActiveAt: minsAgo(45), location: PLACE.pattani, bank: { name: 'กรุงไทย', no: '345-6-78901-2' } });
  // approved but offline
  await makeDriver({ line: 'seed-driver-4', name: 'เอก หยุดพัก', phone: '082-444-4444', vehicleType: 'PICKUP', plate: 'จฉ 8888', province: 'ยะลา', verifyStatus: 'APPROVED', isAvailable: false, lastActiveAt: daysAgo(8), bank: { name: 'กสิกรไทย', no: '456-7-89012-3' } });
  // pending — freshly submitted
  const dPending1 = await makeDriver({ line: 'seed-driver-pending-1', name: 'ใหม่ รออนุมัติ', phone: '082-555-5555', vehicleType: 'MOTORCYCLE', plate: 'ชซ 9999', province: 'สงขลา', verifyStatus: 'PENDING', submittedAt: hoursAgo(6) });
  // pending — submitted long ago (SLA breach)
  await makeDriver({ line: 'seed-driver-pending-2', name: 'รอนาน เกินกำหนด', phone: '082-666-6666', vehicleType: 'TRUCK_4W', plate: 'ฌญ 7777', province: 'นครศรีธรรมราช', verifyStatus: 'PENDING', submittedAt: daysAgo(4) });
  // rejected
  const dRejected = await makeDriver({ line: 'seed-driver-rejected', name: 'บอย ถูกปฏิเสธ', phone: '082-777-7777', vehicleType: 'PICKUP', plate: 'ฎฏ 1010', province: 'สงขลา', verifyStatus: 'REJECTED', rejectionReason: 'รูปใบขับขี่ไม่ชัด เอกสารไม่ครบ', submittedAt: daysAgo(10) });
  // suspended
  const dSuspended = await makeDriver({ line: 'seed-driver-suspended', name: 'ตั้ม ถูกระงับ', phone: '082-888-8888', vehicleType: 'TRUCK_4W', plate: 'ฐฑ 2020', province: 'สงขลา', verifyStatus: 'SUSPENDED', rejectionReason: 'ได้รับการร้องเรียนหลายครั้ง ระงับชั่วคราว', lastActiveAt: daysAgo(15), bank: { name: 'ไทยพาณิชย์', no: '567-8-90123-4' } });

  // Admin-added placeholder driver (no user yet; hands out a claim code)
  await prisma.driver.create({
    data: {
      name: 'สมศักดิ์ (admin เพิ่ม)',
      phone: '089-111-2222',
      vehicleType: 'TRUCK_6W',
      plateNumber: 'ฒณ 4444',
      serviceProvince: 'สงขลา',
      verifyStatus: 'APPROVED',
      claimCode: 'CLAIM-SOMSAK-01',
      bankName: 'กรุงเทพ',
      bankAccountName: 'สมศักดิ์',
      bankAccountNo: '678-9-01234-5',
    },
  });

  // ── Jobs across every status ─────────────────────────────────────────────
  // 1) DRAFT
  await prisma.job.create({
    data: {
      customerId: c1.customerId,
      status: 'DRAFT',
      itemDescription: 'โต๊ะกินข้าว + เก้าอี้ 4 ตัว',
      items: [{ name: 'โต๊ะกินข้าว', quantity: 1 }, { name: 'เก้าอี้', quantity: 4 }],
      vehicleType: 'PICKUP',
      originAddress: '10 ถ.เพชรเกษม', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '22 ถ.ราชดำเนิน', destProvince: 'สงขลา', destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
      itemCount: 5,
    },
  });

  // 2) PENDING_PAYMENT — slip uploaded, awaiting admin approval
  await prisma.job.create({
    data: {
      customerId: c2.customerId,
      status: 'PENDING_PAYMENT',
      itemDescription: 'ที่นอน 6 ฟุต + ตู้เสื้อผ้า',
      vehicleType: 'PICKUP',
      originAddress: '55 ถ.นิพัทธ์อุทิศ', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '8 ถ.ปากน้ำ', destProvince: 'ปัตตานี', destLat: PLACE.pattani.lat, destLng: PLACE.pattani.lng,
      priceQuoted: 1900,
      paymentSlipUrl: 'https://placehold.co/400x600?text=Slip',
      paymentSlipUploadedAt: hoursAgo(2),
      termsAcceptedAt: hoursAgo(2),
      contactPhone: '081-222-2222',
    },
  });

  // 3) PENDING_PAYMENT — slip rejected, needs re-upload
  await prisma.job.create({
    data: {
      customerId: c3.customerId,
      status: 'PENDING_PAYMENT',
      itemDescription: 'ตู้เย็น 2 ประตู + เครื่องซักผ้า',
      vehicleType: 'PICKUP',
      originAddress: '12 ถ.ราษฎร์ยินดี', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '99 ถ.เจริญประดิษฐ์', destProvince: 'สงขลา', destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
      priceQuoted: 1600,
      paymentRejectedReason: 'ยอดในสลิปไม่ตรงกับราคางาน กรุณาอัปโหลดใหม่',
      termsAcceptedAt: hoursAgo(5),
    },
  });

  // 4) POSTED — self-serve, payment approved, public to drivers (สงขลา → ปัตตานี)
  await prisma.job.create({
    data: {
      customerId: c1.customerId,
      status: 'POSTED',
      itemDescription: 'ตู้เย็น 2 ประตู + เตียง 6 ฟุต + กล่องลัง 10 ใบ',
      items: [{ name: 'ตู้เย็น', quantity: 1 }, { name: 'เตียง', quantity: 1 }, { name: 'กล่องลัง', quantity: 10 }],
      vehicleType: 'PICKUP',
      originAddress: '123 ถ.เพชรเกษม อ.หาดใหญ่', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '45 ถ.ปากน้ำ อ.เมือง', destProvince: 'ปัตตานี', destLat: PLACE.pattani.lat, destLng: PLACE.pattani.lng,
      priceQuoted: 1800,
      paymentSlipUrl: 'https://placehold.co/400x600?text=Slip',
      paymentSlipUploadedAt: hoursAgo(20),
      paymentApprovedAt: hoursAgo(19),
      paymentApprovedById: financeAdminId,
      termsAcceptedAt: hoursAgo(20),
      itemPhotos: ['https://placehold.co/600x400?text=Item1', 'https://placehold.co/600x400?text=Item2'],
      itemCount: 12,
      needsHelpers: true,
      originFloor: 3,
      originHasElevator: false,
      destFloor: 1,
      destHasElevator: true,
      notes: 'ตู้เย็นห้ามวางนอน ระวังของแตก',
    },
  });

  // 5) POSTED — admin-posted for offline customer (skips payment gate)
  await prisma.job.create({
    data: {
      customerId: offlineAuntie.id,
      createdByAdminId: opsAdminId,
      status: 'POSTED',
      itemDescription: 'ตู้เสื้อผ้า 3 บาน + ที่นอน + จักรยาน 2 คัน',
      vehicleType: 'TRUCK_4W',
      originAddress: '20 ถ.กาญจนวนิช อ.หาดใหญ่', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '7 ถ.ไทรบุรี อ.เมือง', destProvince: 'สงขลา', destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
      priceQuoted: 2500,
      paymentApprovedAt: daysAgo(1),
      paymentApprovedById: opsAdminId,
    },
  });

  // 6) POSTED — in ปัตตานี (matches driver d3's province)
  await prisma.job.create({
    data: {
      customerId: c4.customerId,
      status: 'POSTED',
      itemDescription: 'กล่องเอกสาร 5 กล่อง',
      vehicleType: 'MOTORCYCLE',
      originAddress: '3 ถ.ยะรัง', originProvince: 'ปัตตานี', originLat: PLACE.pattani.lat, originLng: PLACE.pattani.lng,
      destAddress: '17 ถ.หนองจิก', destProvince: 'ปัตตานี', destLat: PLACE.pattani.lat + 0.02, destLng: PLACE.pattani.lng - 0.01,
      priceQuoted: 350,
      paymentApprovedAt: hoursAgo(3),
      paymentApprovedById: financeAdminId,
    },
  });

  // 7) ACCEPTED — claimed by d1, commission snapshotted
  await prisma.job.create({
    data: {
      customerId: c2.customerId,
      driverId: d1.driverId,
      status: 'ACCEPTED',
      itemDescription: 'โซฟา 2 ที่นั่ง + โต๊ะกลาง',
      vehicleType: 'PICKUP',
      originAddress: '88 ถ.ศรีภูวนารถ', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '14 ถ.ชลาทัศน์', destProvince: 'สงขลา', destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
      priceQuoted: 1200,
      commissionPct: COMMISSION_PCT,
      paymentApprovedAt: hoursAgo(8),
      paymentApprovedById: financeAdminId,
    },
  });

  // 8) PICKED_UP — d1 collected the items (pickup proof)
  await prisma.job.create({
    data: {
      customerId: c3.customerId,
      driverId: d1.driverId,
      status: 'PICKED_UP',
      itemDescription: 'ตู้เย็น + ไมโครเวฟ + กล่อง 5 ใบ',
      vehicleType: 'PICKUP',
      originAddress: '5 ถ.ราษฎร์ยินดี อ.หาดใหญ่', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '9 ถ.สะเดา', destProvince: 'สงขลา', destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
      priceQuoted: 1400,
      commissionPct: COMMISSION_PCT,
      pickupProofUrls: ['https://placehold.co/600x400?text=Pickup1'],
      paymentApprovedAt: hoursAgo(5),
      paymentApprovedById: financeAdminId,
    },
  });

  // 9) IN_TRANSIT — d2 driving, broadcasting location
  await prisma.job.create({
    data: {
      customerId: c4.customerId,
      driverId: d2.driverId,
      status: 'IN_TRANSIT',
      itemDescription: 'ย้ายห้องคอนโด — เครื่องใช้ไฟฟ้าครบชุด',
      vehicleType: 'TRUCK_4W',
      originAddress: '30 ถ.กาญจนวนิช', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '2 ถ.รามวิถี', destProvince: 'สงขลา', destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
      priceQuoted: 2800,
      commissionPct: COMMISSION_PCT,
      pickupProofUrls: ['https://placehold.co/600x400?text=Pickup'],
      paymentApprovedAt: hoursAgo(4),
      paymentApprovedById: financeAdminId,
    },
  });

  // 10) PENDING_CONFIRMATION — d1 marked delivered, awaiting admin approval
  await prisma.job.create({
    data: {
      customerId: c1.customerId,
      driverId: d1.driverId,
      status: 'PENDING_CONFIRMATION',
      itemDescription: 'ชุดรับแขก + ตู้ทีวี',
      vehicleType: 'PICKUP',
      originAddress: '7 ถ.เพชรเกษม', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '40 ถ.สงขลา-นาทวี', destProvince: 'สงขลา', destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
      priceQuoted: 1700,
      commissionPct: COMMISSION_PCT,
      pickupProofUrls: ['https://placehold.co/600x400?text=Pickup'],
      deliveryProofUrls: ['https://placehold.co/600x400?text=Delivery'],
      customerConfirmedAt: hoursAgo(1),
      paymentApprovedAt: hoursAgo(6),
      paymentApprovedById: financeAdminId,
    },
  });

  // 11) CANCELLED
  await prisma.job.create({
    data: {
      customerId: c5.customerId,
      status: 'CANCELLED',
      itemDescription: 'ตู้เย็นเล็ก (ยกเลิกเพราะเปลี่ยนแผน)',
      vehicleType: 'MOTORCYCLE',
      originAddress: '1 ถ.ทดสอบ', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
      destAddress: '2 ถ.ทดสอบ', destProvince: 'สงขลา', destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
      priceQuoted: 400,
    },
  });

  // ── DELIVERED jobs → Transaction (+ Review). Helper. ───────────────────────
  const makeDelivered = async (opts: {
    customer: Seeded;
    driver: SeededDriver;
    gross: number;
    item: string;
    destProvince: string;
    txStatus: 'PENDING' | 'PAID';
    review?: { rating: number; comment: string };
    deliveredDaysAgo: number;
  }) => {
    const { commissionAmount, netToDriver } = split(opts.gross, COMMISSION_PCT);
    const job = await prisma.job.create({
      data: {
        customerId: opts.customer.customerId,
        driverId: opts.driver.driverId,
        status: 'DELIVERED',
        itemDescription: opts.item,
        vehicleType: 'PICKUP',
        originAddress: '88 ถ.นิพัทธ์อุทิศ อ.หาดใหญ่', originProvince: 'สงขลา', originLat: PLACE.hatyai.lat, originLng: PLACE.hatyai.lng,
        destAddress: '12 ถ.ปลายทาง', destProvince: opts.destProvince, destLat: PLACE.songkhla.lat, destLng: PLACE.songkhla.lng,
        priceQuoted: opts.gross,
        commissionPct: COMMISSION_PCT,
        pickupProofUrls: ['https://placehold.co/600x400?text=Pickup'],
        deliveryProofUrls: ['https://placehold.co/600x400?text=Delivery'],
        customerConfirmedAt: daysAgo(opts.deliveredDaysAgo),
        paymentApprovedAt: daysAgo(opts.deliveredDaysAgo + 1),
        paymentApprovedById: financeAdminId,
        createdAt: daysAgo(opts.deliveredDaysAgo + 1),
      },
    });
    const tx = await prisma.transaction.create({
      data: {
        jobId: job.id,
        driverId: opts.driver.driverId,
        grossAmount: opts.gross,
        commissionPct: COMMISSION_PCT,
        commissionAmount,
        netToDriver,
        status: opts.txStatus,
        slipUrl: opts.txStatus === 'PAID' ? 'https://placehold.co/400x600?text=TxSlip' : null,
        createdAt: daysAgo(opts.deliveredDaysAgo),
      },
    });
    if (opts.review) {
      await prisma.review.create({
        data: {
          jobId: job.id,
          customerId: opts.customer.userId,
          driverId: opts.driver.driverId,
          rating: opts.review.rating,
          comment: opts.review.comment,
          createdAt: daysAgo(opts.deliveredDaysAgo),
        },
      });
    }
    return { job, tx };
  };

  const del1 = await makeDelivered({ customer: c1, driver: d1, gross: 2200, item: 'โซฟา 3 ที่นั่ง + โต๊ะทำงาน', destProvince: 'สงขลา', txStatus: 'PAID', review: { rating: 5, comment: 'ขับดีมาก ของไม่เสียหาย ตรงเวลา' }, deliveredDaysAgo: 12 });
  const del2 = await makeDelivered({ customer: c3, driver: d1, gross: 1500, item: 'ตู้เย็น + ไมโครเวฟ + กล่อง 5 ใบ', destProvince: 'สงขลา', txStatus: 'PENDING', review: { rating: 4, comment: 'ดีครับ แต่มาช้านิดหน่อย' }, deliveredDaysAgo: 3 });
  const del3 = await makeDelivered({ customer: c2, driver: d2, gross: 3200, item: 'ย้ายบ้านทั้งหลัง', destProvince: 'ปัตตานี', txStatus: 'PAID', review: { rating: 5, comment: 'มืออาชีพมาก ประทับใจ' }, deliveredDaysAgo: 7 });
  const del4 = await makeDelivered({ customer: c4, driver: d3, gross: 900, item: 'เอกสาร + กล่องเล็ก', destProvince: 'ปัตตานี', txStatus: 'PENDING', review: { rating: 5, comment: 'รวดเร็วทันใจ' }, deliveredDaysAgo: 2 });
  // delivered with no review yet (rating window still open)
  await makeDelivered({ customer: c5, driver: d2, gross: 1800, item: 'เตียง + ที่นอน', destProvince: 'สงขลา', txStatus: 'PENDING', deliveredDaysAgo: 1 });

  // ── Payouts (bundle settled commission ledgers) ────────────────────────────
  // A completed payout run (d1, del1 → PAID)
  const payoutPaid = await prisma.payout.create({
    data: {
      driverId: d1.driverId,
      amount: del1.tx.netToDriver,
      status: 'PAID',
      reference: 'TRF-2024-0001',
      slipUrl: 'https://placehold.co/400x600?text=PayoutSlip',
      createdById: financeAdminId,
      paidAt: daysAgo(10),
      createdAt: daysAgo(11),
    },
  });
  await prisma.transaction.update({ where: { id: del1.tx.id }, data: { payoutId: payoutPaid.id } });

  // A pending payout run (d2, del3 → driver not yet paid)
  const payoutPending = await prisma.payout.create({
    data: {
      driverId: d2.driverId,
      amount: del3.tx.netToDriver,
      status: 'PENDING',
      reference: 'TRF-2024-0002',
      createdById: financeAdminId,
      createdAt: daysAgo(2),
    },
  });
  await prisma.transaction.update({ where: { id: del3.tx.id }, data: { payoutId: payoutPending.id } });

  // ── Disputes (one per status) ──────────────────────────────────────────────
  await prisma.dispute.create({
    data: { jobId: del1.job.id, raisedById: c1.userId, reason: 'ITEM_DAMAGED', detail: 'โต๊ะทำงานมีรอยขีดข่วนตอนขนส่ง', status: 'OPEN', createdAt: daysAgo(11) },
  });
  await prisma.dispute.create({
    data: { jobId: del2.job.id, raisedById: c3.userId, reason: 'LATE', detail: 'คนขับมาช้ากว่านัด 1 ชั่วโมง', status: 'RESOLVED', resolution: 'ชดเชยส่วนลด 100 บาทให้ลูกค้า ปิดเคส', resolvedById: opsAdminId, resolvedAt: daysAgo(2), createdAt: daysAgo(3) },
  });
  await prisma.dispute.create({
    data: { jobId: del4.job.id, raisedById: c4.userId, reason: 'OVERCHARGED', detail: 'คิดราคาเกินจริง', status: 'REJECTED', resolution: 'ตรวจสอบแล้ว ราคาตรงตามที่ตกลง ไม่มีการคิดเกิน', resolvedById: superAdminId, resolvedAt: daysAgo(1), createdAt: daysAgo(2) },
  });

  // ── Notifications (mix of read/unread) ─────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      { userId: d1.userId, type: 'JOB_NEW_IN_AREA', title: 'มีงานใหม่ในพื้นที่', body: 'งานขนของ หาดใหญ่ → ปัตตานี ราคา ฿1,800', createdAt: hoursAgo(19) },
      { userId: d1.userId, type: 'JOB_STATUS', title: 'อัปเดตงาน', body: 'งานของคุณเปลี่ยนเป็น "รอยืนยัน"', readAt: hoursAgo(1), createdAt: hoursAgo(1) },
      { userId: d2.userId, type: 'JOB_NEW_IN_AREA', title: 'มีงานใหม่ในพื้นที่', body: 'งานย้ายบ้าน ในสงขลา', createdAt: hoursAgo(4) },
      { userId: d3.userId, type: 'JOB_NEW_IN_AREA', title: 'มีงานใหม่ในพื้นที่', body: 'งานส่งเอกสารในปัตตานี ฿350', createdAt: hoursAgo(3) },
      { userId: dPending1.userId, type: 'DRIVER_VERIFY', title: 'อยู่ระหว่างตรวจสอบ', body: 'ใบสมัครของคุณกำลังรอการอนุมัติ', createdAt: hoursAgo(6) },
      { userId: dRejected.userId, type: 'DRIVER_VERIFY', title: 'ใบสมัครไม่ผ่าน', body: 'เหตุผล: รูปใบขับขี่ไม่ชัด เอกสารไม่ครบ', createdAt: daysAgo(10) },
      { userId: c1.userId, type: 'JOB_STATUS', title: 'คนขับรับงานแล้ว', body: 'ก้อง คนขับ กำลังเดินทางมารับของ', readAt: daysAgo(11), createdAt: daysAgo(12) },
      { userId: c2.userId, type: 'JOB_STATUS', title: 'จัดส่งสำเร็จ', body: 'งานของคุณจัดส่งเรียบร้อยแล้ว ให้คะแนนคนขับได้เลย', createdAt: daysAgo(7) },
    ],
  });

  // ── Blacklist (block re-registration) ──────────────────────────────────────
  await prisma.blacklist.createMany({
    data: [
      { nationalId: '1100000000001', reason: 'แอบอ้างเอกสารปลอม', createdById: superAdminId },
      { plateNumber: 'กก 0000', reason: 'รถมีประวัติแจ้งของหาย', createdById: opsAdminId },
    ],
  });

  // ── Audit logs (admin actions) ─────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { actorId: opsAdminId, action: 'driver.verify', targetType: 'driver', targetId: d1.driverId, metadata: { from: 'PENDING', to: 'APPROVED' }, createdAt: daysAgo(20) },
      { actorId: opsAdminId, action: 'driver.suspend', targetType: 'driver', targetId: dSuspended.driverId, metadata: { reason: 'ร้องเรียนหลายครั้ง' }, createdAt: daysAgo(15) },
      { actorId: opsAdminId, action: 'driver.reject', targetType: 'driver', targetId: dRejected.driverId, metadata: { reason: 'เอกสารไม่ครบ' }, createdAt: daysAgo(10) },
      { actorId: financeAdminId, action: 'payment.approve', targetType: 'job', targetId: del1.job.id, metadata: { amount: 2200 }, createdAt: daysAgo(13) },
      { actorId: financeAdminId, action: 'payout.create', targetType: 'payout', targetId: payoutPaid.id, metadata: { amount: del1.tx.netToDriver }, createdAt: daysAgo(11) },
      { actorId: superAdminId, action: 'settings.commission', targetType: 'setting', targetId: 'commission_pct', metadata: { from: '10', to: '12' }, createdAt: daysAgo(25) },
      { actorId: superAdminId, action: 'user.ban', targetType: 'user', targetId: cBanned.userId, metadata: { reason: 'แจ้งข้อมูลเท็จ' }, createdAt: daysAgo(5) },
      { actorId: opsAdminId, action: 'dispute.resolve', targetType: 'job', targetId: del2.job.id, metadata: { resolution: 'ชดเชยส่วนลด' }, createdAt: daysAgo(2) },
    ],
  });

  // ── Recompute denormalised driver stats (ratings + counters) ───────────────
  const allDrivers = await prisma.driver.findMany({ select: { id: true } });
  for (const { id } of allDrivers) {
    const agg = await prisma.review.aggregate({ where: { driverId: id }, _avg: { rating: true }, _count: true });
    const completedCount = await prisma.job.count({ where: { driverId: id, status: 'DELIVERED' } });
    const cancelCount = await prisma.job.count({ where: { driverId: id, status: 'CANCELLED' } });
    await prisma.driver.update({
      where: { id },
      data: {
        ratingAvg: agg._avg.rating ? Math.round(agg._avg.rating * 100) / 100 : 0,
        ratingCount: agg._count,
        completedCount,
        cancelCount,
      },
    });
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const counts = {
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    drivers: await prisma.driver.count(),
    jobs: await prisma.job.count(),
    transactions: await prisma.transaction.count(),
    payouts: await prisma.payout.count(),
    disputes: await prisma.dispute.count(),
    reviews: await prisma.review.count(),
    notifications: await prisma.notification.count(),
    promos: await prisma.promoCode.count(),
  };
  console.info('✅ Seed complete (fresh reset)');
  console.info('   Admin logins (password = changeme123):');
  console.info('     admin@movesook.local   (SUPER)');
  console.info('     ops@movesook.local      (OPS)');
  console.info('     finance@movesook.local  (FINANCE)');
  console.info('   Counts:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
