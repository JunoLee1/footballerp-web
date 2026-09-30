import { EquipmentCategory, EquipmentUnitStatus, DepreciationMethod } from "../../generated/enums";

export interface CreateEquipmentItemDto {
  name: string;
  category: EquipmentCategory;
  trackedIndividually: boolean;
  quantity?: number;
  lowStockThreshold?: number;
}

export interface UpdateQuantityDto {
  delta: number;
}

export interface CreateEquipmentUnitDto {
  serialNumber?: string;
  purchasedAt?: Date;
  purchaseValue?: number;
  depreciationRate?: number;
  depreciationMethod?: DepreciationMethod;
  isHighValue?: boolean;
}

export interface UpdateUnitStatusDto {
  status: EquipmentUnitStatus;
  disposedById?: string;
  disposalNote?: string;
  disposedAt?: Date;
}

export interface UpdateUnitSanitationDto {
  lastSanitizedAt?: string;
  sanitationStatus?: string;
  lastInspectedAt?: string;
  inspectionIntervalDays?: number;
  nextInspectionDue?: string;
}

export interface CreateAssignmentDto {
  playerId: string;
  equipmentItemId?: string;
  equipmentUnitId?: number;
}

import { EquipmentLoanStatus } from "../../generated/enums";

export interface CreateEquipmentLoanDto {
  equipmentItemId: string;
  dueDate: string;
  notes?: string;
}

export interface UpdateEquipmentLoanStatusDto {
  status: EquipmentLoanStatus;
  equipmentUnitId?: number;
}
