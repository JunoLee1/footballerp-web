import type { LicenseSupplyType } from "../../generated/enums";

export interface CreateSoftwareLicenseDto {
  name: string;
  vendor: string;
  partnerId?: string;         // #593 — 등록된 Partner FK (권장)
  totalSeats: number;
  expiresAt?: string;
  renewalCost?: number;
  // #593 — 라이선스 등록 확장
  version?: string;
  ipRegistrationNumber?: string;
  licenseCertificateUrl?: string;
  contractDocumentUrl?: string;
  supplyType?: LicenseSupplyType;
  territory?: string;
  deviceLimit?: number;
  serverSpec?: string;
  siteLimit?: number;
}

export interface UpdateSoftwareLicenseDto {
  name?: string;
  vendor?: string;
  partnerId?: string | null;
  totalSeats?: number;
  expiresAt?: string;
  renewalCost?: number;
  version?: string | null;
  ipRegistrationNumber?: string | null;
  licenseCertificateUrl?: string | null;
  contractDocumentUrl?: string | null;
  supplyType?: LicenseSupplyType | null;
  territory?: string | null;
  deviceLimit?: number | null;
  serverSpec?: string | null;
  siteLimit?: number | null;
}
