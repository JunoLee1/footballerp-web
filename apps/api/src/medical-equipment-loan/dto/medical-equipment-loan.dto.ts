export interface RequestNormalMedicalLoanDto {
  equipmentItemId: string;
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
  equipmentItemId: string;
  equipmentUnitId?: number;
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
