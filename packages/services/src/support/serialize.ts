import type {
  BlogPost,
  Customer,
  Driver,
  Job,
  LedgerAttachment,
  LedgerEntry,
  User,
} from '@movesook/db';
import type {
  BlogPostDto,
  CustomerDto,
  DriverDto,
  JobDto,
  JobItem,
  LedgerEntryDto,
} from '@movesook/shared';

// Convert a Prisma BlogPost row to the admin wire DTO (Dates -> ISO strings).
export function toBlogPostDto(post: BlogPost): BlogPostDto {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    coverImageUrl: post.coverImageUrl,
    author: post.author,
    status: post.status,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

// Convert a Prisma LedgerEntry (with attachments + creator) to the admin DTO.
export function toLedgerEntryDto(
  entry: LedgerEntry & { attachments: LedgerAttachment[]; createdBy: Pick<User, 'displayName'> | null },
): LedgerEntryDto {
  return {
    id: entry.id,
    type: entry.type,
    category: entry.category,
    title: entry.title,
    amount: entry.amount,
    note: entry.note,
    occurredAt: entry.occurredAt.toISOString(),
    createdById: entry.createdById,
    createdByName: entry.createdBy?.displayName ?? null,
    attachments: entry.attachments.map((a) => ({
      id: a.id,
      url: a.url,
      name: a.name,
      mimeType: a.mimeType,
    })),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

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
    paymentMethod: job.paymentMethod,
    paymentSlipUrl: job.paymentSlipUrl,
    paymentSlipUploadedAt: job.paymentSlipUploadedAt ? job.paymentSlipUploadedAt.toISOString() : null,
    paymentApprovedAt: job.paymentApprovedAt ? job.paymentApprovedAt.toISOString() : null,
    paymentRejectedReason: job.paymentRejectedReason,
    codCommissionFee: job.codCommissionFee,
    codCommissionSlipUrl: job.codCommissionSlipUrl,
    codCommissionSlipUploadedAt: job.codCommissionSlipUploadedAt
      ? job.codCommissionSlipUploadedAt.toISOString()
      : null,
    codCommissionApprovedAt: job.codCommissionApprovedAt
      ? job.codCommissionApprovedAt.toISOString()
      : null,
    codCommissionRejectedReason: job.codCommissionRejectedReason,
    pricingMode: job.pricingMode,
    priceQuoted: job.priceQuoted,
    promoCode: job.promoCode,
    discountAmount: job.discountAmount,
    commissionPct: job.commissionPct,
    itemPhotos: job.itemPhotos,
    pickupProofUrls: job.pickupProofUrls,
    deliveryProofUrls: job.deliveryProofUrls,
    customerConfirmedAt: job.customerConfirmedAt ? job.customerConfirmedAt.toISOString() : null,
    destChangeStatus: job.destChangeStatus,
    destChangeNewAddress: job.destChangeNewAddress,
    destChangeNewProvince: job.destChangeNewProvince,
    destChangeNewLat: job.destChangeNewLat,
    destChangeNewLng: job.destChangeNewLng,
    destChangeReason: job.destChangeReason,
    destChangeFee: job.destChangeFee,
    destChangeExtraKm: job.destChangeExtraKm,
    destChangeRequestedAt: job.destChangeRequestedAt ? job.destChangeRequestedAt.toISOString() : null,
    destChangeRejectedReason: job.destChangeRejectedReason,
    destChangeSlipUrl: job.destChangeSlipUrl,
    destChangeSlipUploadedAt: job.destChangeSlipUploadedAt ? job.destChangeSlipUploadedAt.toISOString() : null,
    destChangeCompletedAt: job.destChangeCompletedAt ? job.destChangeCompletedAt.toISOString() : null,
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
    appealMessage: driver.appealMessage,
    appealAt: driver.appealAt ? driver.appealAt.toISOString() : null,
    serviceProvince: driver.serviceProvince,
    isAvailable: driver.isAvailable,
    ratingAvg: driver.ratingAvg,
    ratingCount: driver.ratingCount,
    bankName: driver.bankName,
    bankAccountName: driver.bankAccountName,
    bankAccountNo: driver.bankAccountNo,
    phone: driver.phone,
    firstName: driver.firstName,
    lastName: driver.lastName,
    birthDate: driver.birthDate ? driver.birthDate.toISOString() : null,
    gender: driver.gender,
    email: driver.email,
    emergencyContactName: driver.emergencyContactName,
    emergencyContactPhone: driver.emergencyContactPhone,
    nationalId: driver.nationalId,
    nationalIdUrl: driver.nationalIdUrl,
    address: driver.address,
    screening: (driver.screening as unknown as DriverDto['screening']) ?? null,
    licenseNo: driver.licenseNo,
    licenseExpiry: driver.licenseExpiry ? driver.licenseExpiry.toISOString() : null,
    vehicleRegUrl: driver.vehicleRegUrl,
    vehicleRegExpiry: driver.vehicleRegExpiry ? driver.vehicleRegExpiry.toISOString() : null,
    insuranceExpiry: driver.insuranceExpiry ? driver.insuranceExpiry.toISOString() : null,
    vehiclePhotoFront: driver.vehiclePhotoFront,
    vehiclePhotoBack: driver.vehiclePhotoBack,
    vehiclePhotoLeft: driver.vehiclePhotoLeft,
    vehiclePhotoRight: driver.vehiclePhotoRight,
    vehiclePhotoPlate: driver.vehiclePhotoPlate,
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
