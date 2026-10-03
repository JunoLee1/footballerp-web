import { TransferType, TransferRequestStatus, NegotiationType } from "../../generated/enums";

export interface CreateTransferRequestDto {
  playerId: string;
  agencyId: string;
  type: TransferType;
  fromClub?: string;
  toClub?: string;
  fee?: number;
  expectedSalary?: number;
  startDate?: string;
  endDate?: string;
}

export interface UpdateTransferRequestDto {
  type?: TransferType;
  fromClub?: string | null;
  toClub?: string | null;
  fee?: number | null;
  expectedSalary?: number | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ReviewTransferRequestDto {
  action: "approve" | "reject";
  rejectReason?: string;
}

export interface ConfirmTransferRequestDto {
  action: "send-to-medical" | "reject";
  rejectReason?: string;
}

export interface MedicalResultDto {
  result: "pass" | "fail";
  medicalNotes?: string;
}

export interface CreateNegotiationLogDto {
  type: NegotiationType;
  note: string;
  amount?: number;
}

export interface ListTransferRequestQuery {
  status?: TransferRequestStatus;
  playerId?: string;
}
