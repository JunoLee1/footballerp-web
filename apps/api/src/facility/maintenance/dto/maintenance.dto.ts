import type { MaintenancePriority, MaintenanceStatus } from "../../../generated/enums";

export interface CreateMaintenanceDto {
  title: string;
  description: string;
  priority: MaintenancePriority;
  sourceInspectionId?: string;
  estimatedCost?: number;
  partnerId?: string;
}

export interface UpdateMaintenanceDto {
  title?: string;
  description?: string;
  priority?: MaintenancePriority;
  postIncidentReport?: string;
  estimatedCost?: number;
  actualCost?: number;
}

export interface UpdateMaintenanceStatusDto {
  status: MaintenanceStatus;
}

export interface RejectMaintenanceDto {
  reason?: string;
}

export interface MaintenanceListQuery {
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
}
