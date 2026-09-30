export interface RequestNormalMedicalLoanDto {
  equipmentItemId: string;
  equipmentUnitId?: string;
  notes?: string;
  originalCost: number;
  overrideDiscountRate?: number;
  overrideReason?: string;
  budgetLineId: number;
  seasonId: number;
  categoryId: number;
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
  budgetLineId?: number;
  seasonId?: number;
  categoryId?: number;
}

export interface RejectMedicalLoanDto {
  rejectionReason: string;
}
