import type { Customer, Driver, Job } from '@movesook/db';
import type { CustomerDto, DriverDto, JobDto, JobItem } from '@movesook/shared';

// Convert a Prisma Job row to the wire DTO (Dates -> ISO strings).
export function toJobDto(job: Job): JobDto {
  return {
    id: job.id,
    customerId: job.customerId,
    createdByAdminId: job.createdByAdminId,
    driverId: job.driverId,
    status: job.status,
    itemDescription: job.itemDescription,
    // `items` is a Prisma Json column; it always holds JobItem[] | null as written at create time.
    items: (job.items as unknown as JobItem[] | null) ?? null,
    vehicleType: job.vehicleType,
    itemCategory: (job.itemCategory as JobDto['itemCategory']) ?? null,
    prohibitedAck: job.prohibitedAck,
    flaggedIllegalAt: job.flaggedIllegalAt ? job.flaggedIllegalAt.toISOString() : null,
    flaggedIllegalReason: job.flaggedIllegalReason,
    itemCount: job.itemCount,
    needsHelpers: job.needsHelpers,
    contactPhone: job.contactPhone,
    notes: job.notes,
    originAddress: job.originAddress,
    originProvince: job.originProvince,
    originLat: job.originLat,
    originLng: job.originLng,
    originFloor: job.originFloor,
    originHasElevator: job.originHasElevator,
    destAddress: job.destAddress,
    destProvince: job.destProvince,
    destLat: job.destLat,
    destLng: job.destLng,
    destFloor: job.destFloor,
    destHasElevator: job.destHasElevator,
    scheduledAt: job.scheduledAt ? job.scheduledAt.toISOString() : null,
    termsAcceptedAt: job.termsAcceptedAt ? job.termsAcceptedAt.toISOString() : null,
    paymentSlipUrl: job.paymentSlipUrl,
    paymentSlipUploadedAt: job.paymentSlipUploadedAt ? job.paymentSlipUploadedAt.toISOString() : null,
    paymentApprovedAt: job.paymentApprovedAt ? job.paymentApprovedAt.toISOString() : null,
    paymentRejectedReason: job.paymentRejectedReason,
    pricingMode: job.pricingMode,
    priceQuoted: job.priceQuoted,
    promoCode: job.promoCode,
    discountAmount: job.discountAmount,
    commissionPct: job.commissionPct,
    itemPhotos: job.itemPhotos,
    pickupProofUrls: job.pickupProofUrls,
    deliveryProofUrls: job.deliveryProofUrls,
    customerConfirmedAt: job.customerConfirmedAt ? job.customerConfirmedAt.toISOString() : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

// Convert a Prisma Driver row to the wire DTO. `displayName` is the linked
// user's name when known; otherwise we fall back to the admin-entered name.
export function toDriverDto(driver: Driver, displayName: string | null): DriverDto {
  return {
    id: driver.id,
    userId: driver.userId,
    vehicleType: driver.vehicleType,
    plateNumber: driver.plateNumber,
    licenseTw2: driver.licenseTw2,
    verifyStatus: driver.verifyStatus,
    rejectionReason: driver.rejectionReason,
    serviceProvince: driver.serviceProvince,
    isAvailable: driver.isAvailable,
    ratingAvg: driver.ratingAvg,
    ratingCount: driver.ratingCount,
    bankName: driver.bankName,
    bankAccountName: driver.bankAccountName,
    bankAccountNo: driver.bankAccountNo,
    phone: driver.phone,
    nationalId: driver.nationalId,
    nationalIdUrl: driver.nationalIdUrl,
    licenseNo: driver.licenseNo,
    licenseExpiry: driver.licenseExpiry ? driver.licenseExpiry.toISOString() : null,
    vehicleRegUrl: driver.vehicleRegUrl,
    vehicleRegExpiry: driver.vehicleRegExpiry ? driver.vehicleRegExpiry.toISOString() : null,
    insuranceExpiry: driver.insuranceExpiry ? driver.insuranceExpiry.toISOString() : null,
    completedCount: driver.completedCount,
    cancelCount: driver.cancelCount,
    submittedAt: driver.submittedAt ? driver.submittedAt.toISOString() : null,
    lastActiveAt: driver.lastActiveAt ? driver.lastActiveAt.toISOString() : null,
    createdAt: driver.createdAt.toISOString(),
    displayName: displayName ?? driver.name,
  };
}

// Convert a Prisma Customer row to the wire DTO.
export function toCustomerDto(customer: Customer): CustomerDto {
  return {
    id: customer.id,
    userId: customer.userId,
    name: customer.name,
    phone: customer.phone,
    note: customer.note,
    tags: customer.tags,
    referralCode: customer.referralCode,
    createdAt: customer.createdAt.toISOString(),
  };
}
