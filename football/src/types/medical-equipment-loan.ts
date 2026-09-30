export type MedicalEquipmentLoanStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'REJECTED'
  | 'ISSUED'
  | 'EMERGENCY_ISSUED'
  | 'EMERGENCY_PENDING_POST_APPROVAL'
  | 'EMERGENCY_RESOLVED'
  | 'EMERGENCY_REJECTED'
  | 'RETURNED';

export interface MedicalEquipmentLoanLedger {
  id: number;
  equipmentLoanId: number;
  status: MedicalEquipmentLoanStatus;
  requestedById: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  rejectedById?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  isEmergency: boolean;
  emergencyReason?: string | null;
  partnerId?: number | null;
  partnerContractId?: number | null;
  sponsorshipId?: number | null;
  discountRate: number;
  originalCost: number;
  finalCost: number;
  overrideReason?: string | null;
  budgetLineId?: number | null;
  operatingExpenseId?: number | null;
  escalatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  equipmentLoan?: {
    id: number;
    status: string;
    issuedAt?: string | null;
    equipmentItem?: { id: number; name: string };
  };
  requestedBy?: { id: number; nickname: string };
  approvedBy?: { id: number; nickname: string };
  partner?: { id: number; name: string };
}

export interface RequestNormalMedicalLoanDto {
  equipmentItemId: number;
  equipmentUnitId?: number;
  notes?: string;
  originalCost: number;
  overrideDiscountRate?: number;
  overrideReason?: string;
  budgetLineId: number;
  seasonId: number;
  categoryId: number;
}

export interface RequestEmergencyMedicalLoanDto {
  equipmentItemId: number;
  equipmentUnitId?: number;
  notes?: string;
  emergencyReason: string;
  originalCost: number;
  overrideDiscountRate?: number;
  overrideReason?: string;
}

export const MEDICAL_LOAN_STATUS_LABEL: Record<MedicalEquipmentLoanStatus, string> = {
  DRAFT: '승인 대기',
  APPROVED: '승인됨',
  REJECTED: '반려',
  ISSUED: '지급됨',
  EMERGENCY_ISSUED: '응급 지급',
  EMERGENCY_PENDING_POST_APPROVAL: '응급 — 사후 승인 대기',
  EMERGENCY_RESOLVED: '응급 — 사후 승인 완료',
  EMERGENCY_REJECTED: '응급 — 사후 반려',
  RETURNED: '반납 완료',
};

export const MEDICAL_LOAN_STATUS_STYLE: Record<MedicalEquipmentLoanStatus, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  APPROVED: 'bg-blue-100 text-blue-800 border-blue-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  ISSUED: 'bg-green-100 text-green-800 border-green-200',
  EMERGENCY_ISSUED: 'bg-orange-100 text-orange-800 border-orange-200',
  EMERGENCY_PENDING_POST_APPROVAL: 'bg-orange-100 text-orange-800 border-orange-200',
  EMERGENCY_RESOLVED: 'bg-green-100 text-green-800 border-green-200',
  EMERGENCY_REJECTED: 'bg-red-100 text-red-800 border-red-200',
  RETURNED: 'bg-gray-100 text-gray-700 border-gray-200',
};
