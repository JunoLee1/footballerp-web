export type CertificationType =
  | "PLAYER_REGISTRATION" | "PLAYER_CONTRACT" | "PLAYER_HEALTH_CHECK"
  | "PLAYER_HEALTH_INSURANCE" | "PLAYER_FIFA_ID"
  | "COACH_UEFA_LICENSE" | "COACH_YOUTH_LICENSE" | "COACH_REFEREE_TRAINING"
  | "STAFF_DOCTOR_LICENSE" | "STAFF_MEDICAL_COORDINATOR"
  | "STAFF_PHYSIOTHERAPIST" | "STAFF_SAFETY_OFFICER"
  | "FACILITY_STADIUM_SAFETY" | "FACILITY_STRUCTURAL" | "FACILITY_LIGHTING"
  | "FACILITY_MEDICAL_EQUIPMENT" | "FACILITY_FIRE_ELECTRICAL"
  | "CLUB_LICENSE" | "CLUB_CORPORATE_REGISTRATION" | "CLUB_FINANCIAL_AUDIT"
  | "CLUB_LIABILITY_INSURANCE" | "CLUB_YOUTH_PROGRAM";

export type CertEntityType = "PLAYER" | "COACH" | "STAFF" | "FACILITY" | "CLUB";

export type CertStatus =
  | "DRAFT" | "PENDING_REVIEW" | "FM_APPROVED" | "VALID"
  | "EXPIRING_SOON" | "EXPIRED" | "REJECTED" | "SUSPENDED" | "CANCELLED";

export interface Certification {
  id: number;
  certType: CertificationType;
  entityType: CertEntityType;
  issuingBody: string;
  issuedAt: string;
  expiresAt: string;
  status: CertStatus;
  isLocked: boolean;
  documentUrl: string | null;
  reminderDays: number[];
  notes: string | null;
  rejectionReason: string | null;
  ownerId: string;
  approvedById: string | null;
  approvedAt: string | null;
  gmApprovedById: string | null;
  gmApprovedAt: string | null;
  owner: { id: number; username: string };
  player?: { id: string; playerName: string } | null;
  coach?: { id: number; name: string } | null;
  staff?: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export const CERT_STATUS_LABEL: Record<CertStatus, string> = {
  DRAFT:          "초안",
  PENDING_REVIEW: "검토 중",
  FM_APPROVED:    "1차 승인",
  VALID:          "유효",
  EXPIRING_SOON:  "만료 임박",
  EXPIRED:        "만료",
  REJECTED:       "반려",
  SUSPENDED:      "정지",
  CANCELLED:      "취소",
};

export const CERT_STATUS_COLOR: Record<CertStatus, string> = {
  DRAFT:          "gray",
  PENDING_REVIEW: "blue",
  FM_APPROVED:    "indigo",
  VALID:          "green",
  EXPIRING_SOON:  "yellow",
  EXPIRED:        "red",
  REJECTED:       "orange",
  SUSPENDED:      "purple",
  CANCELLED:      "gray",
};
