import { ContractStatus, BonusMetric, BonusPeriod, CompetitionType } from "../../generated/enums";

export interface CreateContractDto {
  playerId: string;
  startDate: string;
  endDate: string;
  salary: number;
  managedById?: string;
  agencyId?: string;
  agencyCommission?: number;
  signingBonus?: number;          // ≥ 0
  signingBonusScheduledAt?: string; // ISO date; signingBonus > 0 일 때만 유효
}

export interface MarkSigningBonusPaidDto {
  paidAt?: string; // ISO date; 생략 시 서비스에서 new Date() 사용
}

export interface UpdateContractStatusDto {
  status: ContractStatus;
}

export interface CreateBuyoutDto {
  amount: number;
  validUntil?: string;
}

export interface CreateExtensionDto {
  condition: string;
  durationMonths: number;
  conditionText?: string;
  minAppearances?: number;
}

export interface BonusTriggerDto {
  metric: BonusMetric;
  threshold: number;
  period: BonusPeriod;
  competitionType?: CompetitionType;
}

export interface CreateBonusDto {
  amount: number;
  description: string;
  triggers: BonusTriggerDto[];
}
