export interface RequestNormalMedicalLoanDto {
  equipmentItemId: string;
  equipmentUnitId?: string;
  notes?: string;
  originalCost: number;
  overrideDiscountRate?: number;
  overrideReason?: string;
  budgetLineId: string;
  seasonId: number;
  categoryId: string;
}

export interface RequestEmergencyMedicalLoanDto {
  equipmentItemId: string;
  equipmentUnitId?: string;
  notes?: string;
  emergencyReason: string;
  originalCost: number;
  overrideDiscountRate?: number;
  overrideReason?: string;
}

export interface ApproveMedicalLoanDto {
  budgetLineId?: string;
  seasonId?: number;
  categoryId?: string;
}

export interface RejectMedicalLoanDto {
  rejectionReason: string;
}
