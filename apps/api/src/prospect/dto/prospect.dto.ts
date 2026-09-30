import { Foot, NegotiationType, Position, ProspectStatus, VisaEligibility, WorkPermitStatus } from "../../generated/enums";

export interface CreateProspectDto {
  name: string;
  nationalityId: number;
  position?: Position;
  currentTeam?: string;
  notes?: string;
  createdById?: string;
  status?: 'LONGLIST' | 'PRE_SHORTLIST';
  playStyle?: string;
  visaRequired?: boolean;
}

export interface UpdateProspectDto {
  name?: string;
  nationalityId?: number;
  position?: Position;
  currentTeam?: string;
  notes?: string;
  visaRequired?: boolean;
  visaEligibility?: VisaEligibility;
  currentMarketValue?: number | null;
}

export interface TransitionProspectStatusDto {
  status: ProspectStatus;
}

export interface SignProspectDto {
  dateOfBirth: string;
  preferredFoot?: Foot;
  height: number;
  weight: number;
  position?: Position;
  contractStartDate: string;
  contractEndDate: string;
  salary: number;
  signingBonus?: number;
  managedById?: string;
  workPermitStatus?: WorkPermitStatus;
  workPermitExpiry?: string;
}

export interface ProspectMedicalResultDto {
  result: "pass" | "fail";
  medicalNotes?: string;
}

export interface CreateProspectNegotiationLogDto {
  type: NegotiationType;
  note: string;
  amount?: number;
}
