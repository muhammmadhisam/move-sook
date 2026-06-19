import { HTTPException } from 'hono/http-exception';
import { prisma } from '@movesook/db';
import { writeAudit } from '@movesook/services/support';
import type {
  AdminUpsertVehiclePricingInput,
  VehiclePricingDto,
} from '@movesook/shared';

/** Per-vehicle pricing — list. */
export async function listVehiclePricing(): Promise<{ items: VehiclePricingDto[] }> {
  const rows = await prisma.vehiclePricing.findMany();
  const items: VehiclePricingDto[] = rows.map((r) => ({
    vehicleType: r.vehicleType,
    label: r.label,
    description: r.description,
    imageUrl: r.imageUrl,
    requirements: r.requirements,
    maxWeightKg: r.maxWeightKg,
    pricePerKm: r.pricePerKm,
    pricePerKmShared: r.pricePerKmShared,
    flatRate: r.flatRate,
    perItemRate: r.perItemRate,
    maxActiveJobs: r.maxActiveJobs,
    isActive: r.isActive,
  }));
  return { items };
}

/** Upsert a vehicle type's pricing. */
export async function upsertVehiclePricing(
  sub: string,
  input: AdminUpsertVehiclePricingInput,
): Promise<VehiclePricingDto> {
  const { vehicleType, label, description, imageUrl, requirements, maxWeightKg, pricePerKm, pricePerKmShared, flatRate, perItemRate, maxActiveJobs, isActive } =
    input;
  const data = {
    ...(label !== undefined ? { label } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(imageUrl !== undefined ? { imageUrl } : {}),
    ...(requirements !== undefined ? { requirements } : {}),
    ...(maxWeightKg !== undefined ? { maxWeightKg } : {}),
    ...(pricePerKm !== undefined ? { pricePerKm } : {}),
    ...(pricePerKmShared !== undefined ? { pricePerKmShared } : {}),
    ...(flatRate !== undefined ? { flatRate } : {}),
    ...(perItemRate !== undefined ? { perItemRate } : {}),
    ...(maxActiveJobs !== undefined ? { maxActiveJobs } : {}),
    isActive,
  };
  const row = await prisma.vehiclePricing.upsert({
    where: { vehicleType },
    create: { vehicleType, ...data },
    update: data,
  });
  await writeAudit({
    actorId: sub,
    action: 'settings.vehicle_pricing',
    targetType: 'setting',
    targetId: vehicleType,
    metadata: { isActive, pricePerKm: pricePerKm ?? null, pricePerKmShared: pricePerKmShared ?? null, flatRate: flatRate ?? null, perItemRate: perItemRate ?? null, maxActiveJobs: maxActiveJobs ?? null },
  });
  return {
    vehicleType: row.vehicleType,
    label: row.label,
    description: row.description,
    imageUrl: row.imageUrl,
    requirements: row.requirements,
    maxWeightKg: row.maxWeightKg,
    pricePerKm: row.pricePerKm,
    pricePerKmShared: row.pricePerKmShared,
    flatRate: row.flatRate,
    perItemRate: row.perItemRate,
    maxActiveJobs: row.maxActiveJobs,
    isActive: row.isActive,
  };
}

/**
 * Remove a vehicle type from the catalog. Refused while any driver or job still
 * references it — close it (isActive=false) instead of deleting in that case.
 */
export async function deleteVehiclePricing(
  sub: string,
  vehicleType: string,
): Promise<{ ok: true }> {
  const [driverCount, jobCount] = await Promise.all([
    prisma.driver.count({ where: { vehicleType } }),
    prisma.job.count({ where: { vehicleType } }),
  ]);
  if (driverCount > 0 || jobCount > 0) {
    throw new HTTPException(409, {
      message: `ลบไม่ได้: มีคนขับ ${driverCount} คน และงาน ${jobCount} รายการที่ใช้ประเภทรถนี้อยู่ — ปิดรับแทนได้`,
    });
  }
  await prisma.vehiclePricing.delete({ where: { vehicleType } }).catch(() => {
    throw new HTTPException(404, { message: 'ไม่พบประเภทรถนี้' });
  });
  await writeAudit({
    actorId: sub,
    action: 'settings.vehicle_pricing_delete',
    targetType: 'setting',
    targetId: vehicleType,
  });
  return { ok: true };
}
