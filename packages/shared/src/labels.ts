import type {
  AdminRole,
  ConsentType,
  DisputeReason,
  DisputeStatus,
  DriverVerifyStatus,
  JobStatus,
  NotificationType,
  PayoutStatus,
  PricingMode,
  Role,
  TransactionStatus,
  VehicleType,
} from './enums';

// Thai display labels for every enum, shared by web + admin so dropdowns,
// tables, and badges never surface raw English enum values to users.
// Keep keys in sync with the Zod enums in ./enums.ts.

export const ROLE_LABEL: Record<Role, string> = {
  USER: 'ลูกค้า',
  DRIVER: 'คนขับ',
  ADMIN: 'ผู้ดูแลระบบ',
  SYSTEM: 'ระบบ',
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  DRAFT: 'ร่าง',
  PENDING_PAYMENT: 'รอชำระเงิน/ตรวจสลิป',
  POSTED: 'รอคนขับรับงาน',
  ACCEPTED: 'คนขับรับงานแล้ว',
  PICKED_UP: 'รับของแล้ว',
  IN_TRANSIT: 'กำลังขนส่ง',
  PENDING_CONFIRMATION: 'รอแอดมินยืนยัน',
  DELIVERED: 'ส่งสำเร็จ',
  FLAGGED_ILLEGAL: 'แจ้งของผิดกฎหมาย',
  CANCELLED: 'ยกเลิก',
};

export const VEHICLE_TYPE_LABEL: Record<VehicleType, string> = {
  MOTORCYCLE: 'มอเตอร์ไซค์',
  PICKUP: 'รถกระบะ',
  TRUCK_4W: 'รถบรรทุก 4 ล้อ',
  TRUCK_6W: 'รถบรรทุก 6 ล้อ',
};

export const PRICING_MODE_LABEL: Record<PricingMode, string> = {
  CHARTER: 'เหมาลำ',
  PER_ITEM: 'คิดตามจำนวนสินค้า',
};

export const DRIVER_VERIFY_STATUS_LABEL: Record<DriverVerifyStatus, string> = {
  PENDING: 'รอตรวจสอบ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ปฏิเสธ',
  SUSPENDED: 'ระงับการใช้งาน',
};

export const TRANSACTION_STATUS_LABEL: Record<TransactionStatus, string> = {
  PENDING: 'รอดำเนินการ',
  PAID: 'ชำระแล้ว',
  REFUNDED: 'คืนเงินแล้ว',
};

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  SUPER: 'ผู้ดูแลสูงสุด',
  OPS: 'ฝ่ายปฏิบัติการ',
  FINANCE: 'ฝ่ายการเงิน',
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  JOB_ASSIGNED: 'ได้รับมอบหมายงาน',
  JOB_NEW_IN_AREA: 'มีงานใหม่ในพื้นที่',
  JOB_STATUS: 'อัปเดตสถานะงาน',
  DRIVER_VERIFY: 'ผลการตรวจสอบคนขับ',
  DISPUTE: 'ข้อพิพาท',
  GENERIC: 'ทั่วไป',
};

export const DISPUTE_STATUS_LABEL: Record<DisputeStatus, string> = {
  OPEN: 'เปิดอยู่',
  RESOLVED: 'แก้ไขแล้ว',
  REJECTED: 'ปฏิเสธ',
};

export const DISPUTE_REASON_LABEL: Record<DisputeReason, string> = {
  ITEM_DAMAGED: 'สินค้าเสียหาย',
  DRIVER_NO_SHOW: 'คนขับไม่มารับงาน',
  LATE: 'ล่าช้า',
  OVERCHARGED: 'เรียกเก็บเงินเกิน',
  OTHER: 'อื่น ๆ',
};

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  PENDING: 'รอจ่าย',
  PAID: 'จ่ายแล้ว',
};

export const CONSENT_TYPE_LABEL: Record<ConsentType, string> = {
  TERMS: 'ข้อกำหนดการใช้งาน',
  PRIVACY: 'นโยบายความเป็นส่วนตัว',
  MARKETING: 'การตลาด',
  DRIVER_AGREEMENT: 'ข้อตกลงคนขับ',
};
