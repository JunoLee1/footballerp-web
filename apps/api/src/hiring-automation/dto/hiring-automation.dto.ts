import type { LeagueLevel, DepartmentCategory } from "../../generated/enums";

export interface UpsertLeagueWeightDto {
  weight: number;
}

export interface CreateDepartmentIbiConfigDto {
  departmentId: string;
  jobTitle: string;
  coreTaskRatio: number;
  replacementDays: number;
  backupHeadcount: number;
  effectiveFrom: string; // ISO date string
}

export interface UpdateDepartmentIbiConfigDto {
  coreTaskRatio?: number;
  replacementDays?: number;
  backupHeadcount?: number;
}

export interface UpsertSeasonComplianceCheckDto {
  afcQualificationMet: boolean;
  officeStaffCountMet: boolean;
}

export interface CreateComplianceDeadlineDto {
  name: string;
  deadlineDate: string;
  triggerDaysBefore: number;
  betaMultiplier: number;
  isActive?: boolean;
}

export interface UpdateComplianceDeadlineDto {
  name?: string;
  deadlineDate?: string;
  triggerDaysBefore?: number;
  betaMultiplier?: number;
  isActive?: boolean;
}
