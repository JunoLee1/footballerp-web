import type { CertificationType, CertEntityType, CertStatus, FacilityZone } from "../../generated/enums";

export interface CreateCertificationDto {
  certType: CertificationType;
  entityType: CertEntityType;
  issuingBody: string;
  issuedAt: string;
  expiresAt: string;
  reminderDays?: number[];
  notes?: string;
  playerId?: string;
  coachId?: string;
  staffId?: string;
  facilityZone?: FacilityZone;
}

export interface UpdateCertificationDto {
  issuingBody?: string;
  issuedAt?: string;
  expiresAt?: string;
  documentUrl?: string;
  reminderDays?: number[];
  notes?: string;
}

export interface RejectCertificationDto {
  reason: string;
}

export interface CertificationListQuery {
  entityType?: CertEntityType;
  certType?: CertificationType;
  status?: CertStatus;
  playerId?: string;
  coachId?: string;
  staffId?: string;
}
