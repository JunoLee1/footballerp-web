import type { FacilityZone, MaintenancePriority } from "../../../generated/enums";

export interface CreatePreventiveScheduleDto {
  facilityZone: FacilityZone;
  title: string;
  description?: string;
  intervalDays: number;
  priority: MaintenancePriority;
  partnerId?: string;
}

export interface UpdatePreventiveScheduleDto {
  title?: string;
  description?: string;
  intervalDays?: number;
  priority?: MaintenancePriority;
  partnerId?: string;
}

export interface PreventiveScheduleListQuery {
  facilityZone?: FacilityZone;
  isActive?: string;
}
