import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

// Seed: 1 admin (email/password), commission_pct=12, 2 approved drivers,
// 3 users, and a sample หาดใหญ่ ↔ ปัตตานี job.
async function main() {
  // ── AppSetting: central commission ──────────────────────────────────────
  await prisma.appSetting.upsert({
    where: { key: 'commission_pct' },
    create: { key: 'commission_pct', value: '12' },
    update: { value: '12' },
  });

  // ── Admin (bootstrap; never via public API) ──────────────────────────────
  const adminEmail = 'admin@movesook.local';
  const passwordHash = await hash('changeme123', 12);
  const admin = await prisma.user.upsert({
    where: { lineUserId: 'seed-admin' },
    create: { lineUserId: 'seed-admin', displayName: 'ผู้ดูแลระบบ', role: 'ADMIN' },
    update: { role: 'ADMIN' },
  });
  await prisma.adminCredential.upsert({
    where: { email: adminEmail },
    create: { userId: admin.id, email: adminEmail, passwordHash },
    update: { passwordHash },
  });

  // ── Customers (USER) ──────────────────────────────────────────────────────
  const customers = await Promise.all(
    [
      { lineUserId: 'seed-user-1', displayName: 'สมชาย ลูกค้า' },
      { lineUserId: 'seed-user-2', displayName: 'สมหญิง ผู้ย้าย' },
      { lineUserId: 'seed-user-3', displayName: 'อนันต์ ขนของ' },
    ].map((u) =>
      prisma.user.upsert({
        where: { lineUserId: u.lineUserId },
        create: { ...u, role: 'USER' },
        update: {},
      }),
    ),
  );

  // ── Drivers (approved) ────────────────────────────────────────────────────
  const driverSeeds = [
    { lineUserId: 'seed-driver-1', displayName: 'ก้อง คนขับ', vehicleType: 'PICKUP' as const, homeProvince: 'ปัตตานี', plateNumber: 'กข 1234' },
    { lineUserId: 'seed-driver-2', displayName: 'หนุ่ม รถบรรทุก', vehicleType: 'TRUCK_4W' as const, homeProvince: 'สงขลา', plateNumber: 'คง 5678' },
  ];
  const drivers = [];
  for (const d of driverSeeds) {
    const user = await prisma.user.upsert({
      where: { lineUserId: d.lineUserId },
      create: { lineUserId: d.lineUserId, displayName: d.displayName, role: 'DRIVER' },
      update: { role: 'DRIVER' },
    });
    const driver = await prisma.driver.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        vehicleType: d.vehicleType,
        plateNumber: d.plateNumber,
        homeProvince: d.homeProvince,
        verifyStatus: 'APPROVED',
      },
      update: { verifyStatus: 'APPROVED' },
    });
    drivers.push(driver);
  }

  // ── Sample job: หาดใหญ่ (สงขลา) → ปัตตานี ──────────────────────────────────
  const customer = customers[0]!;
  const existing = await prisma.job.findFirst({
    where: { customerId: customer.id, originProvince: 'สงขลา', destProvince: 'ปัตตานี' },
  });
  if (!existing) {
    await prisma.job.create({
      data: {
        customerId: customer.id,
        status: 'POSTED',
        itemDescription: 'ตู้เย็น 2 ประตู + เตียง 6 ฟุต + กล่องลัง 10 ใบ',
        vehicleType: 'PICKUP',
        originAddress: '123 ถ.เพชรเกษม อ.หาดใหญ่',
        originProvince: 'สงขลา',
        originLat: 7.0086,
        originLng: 100.4747,
        destAddress: '45 ถ.ปากน้ำ อ.เมือง',
        destProvince: 'ปัตตานี',
        destLat: 6.8694,
        destLng: 101.2502,
        priceQuoted: 1800,
      },
    });
  }

  // ── BackhaulTrip: driver 1 (home ปัตตานี) declares a สงขลา → ปัตตานี return leg ──
  const driver1 = drivers[0]!;
  const tripExists = await prisma.backhaulTrip.findFirst({ where: { driverId: driver1.id } });
  if (!tripExists) {
    await prisma.backhaulTrip.create({
      data: {
        driverId: driver1.id,
        fromProvince: 'สงขลา',
        toProvince: 'ปัตตานี',
        departAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // +2 days
        capacity: 'PICKUP',
        notes: 'เที่ยวกลับว่าง รับของได้',
        status: 'OPEN',
      },
    });
  }

  // ── A completed job → Transaction (commission ledger) + Review (rating) ──────
  const completedExists = await prisma.job.findFirst({
    where: { status: 'DELIVERED', driverId: driver1.id },
  });
  if (!completedExists) {
    const commissionPct = 12;
    const gross = 2200;
    const commissionAmount = Math.round((gross * commissionPct) / 100);
    const delivered = await prisma.job.create({
      data: {
        customerId: customers[1]!.id,
        driverId: driver1.id,
        status: 'DELIVERED',
        itemDescription: 'โซฟา 3 ที่นั่ง + โต๊ะทำงาน',
        vehicleType: 'PICKUP',
        originAddress: '88 ถ.นิพัทธ์อุทิศ อ.หาดใหญ่',
        originProvince: 'สงขลา',
        destAddress: '12 ถ.เจริญประดิษฐ์ อ.เมือง',
        destProvince: 'ปัตตานี',
        priceQuoted: gross,
        commissionPct,
      },
    });
    await prisma.transaction.create({
      data: {
        jobId: delivered.id,
        driverId: driver1.id,
        grossAmount: gross,
        commissionPct,
        commissionAmount,
        netToDriver: gross - commissionAmount,
        status: 'PAID',
      },
    });
    await prisma.review.create({
      data: {
        jobId: delivered.id,
        customerId: customers[1]!.id,
        driverId: driver1.id,
        rating: 5,
        comment: 'ขับดีมาก ของไม่เสียหาย ตรงเวลา',
      },
    });
    await prisma.driver.update({
      where: { id: driver1.id },
      data: { ratingAvg: 5, ratingCount: 1 },
    });
  }

  console.info('✅ Seed complete');
  console.info(`   Admin login: ${adminEmail} / changeme123`);
  console.info(
    `   ${customers.length} users, ${drivers.length} approved drivers, 2 jobs (1 posted, 1 delivered), 1 backhaul trip, 1 transaction, 1 review`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
