import { InjuryCause, InjuryStatus, HospitalType, RehabStage, RiskLevel, SecurityLevel, BodyPart } from "../../generated/enums";

export interface CreateInjuryDto {
  playerId: string;
  bodyPart: BodyPart;
  cause: InjuryCause;
  expectedReturnDate?: string;
  medicalStaffId: string;
  hospitalType?: HospitalType;
  partnerId?: number;
  customHospitalName?: string;
}

export interface UpdateInjuryStatusDto {
  status: InjuryStatus;
  expectedReturnDate?: string;
}

export interface UpsertInjuryReportDto {
  diagnosisName?: string;
  treatmentContent?: string;
  rehabStage?: RehabStage;
  trainingReturnDate?: string;
  matchAvailable?: boolean;
  reinjuryRisk?: RiskLevel;
  medicalOpinion?: string;
  securityLevel?: SecurityLevel;
  allowedActivities?: string;
  rehabLoadPercentage?: number;
}

export interface UpsertAssessmentDto {
  painLevel: number;
  hasSwelling: boolean;
  romScore: number;
  strengthScore: number;
  sprintScore: number;
  jumpScore: number;
  psychScore: number;
  positionRiskScore: number;
}
