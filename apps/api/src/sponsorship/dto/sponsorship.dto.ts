import type { SponsorType, PaymentSchedule, CurrencyCode } from "../../generated/enums";

export interface CreateSponsorshipDto {
  sponsorName: string;
  type: SponsorType;
  totalFee: number;
  contractStart: string;
  contractEnd: string;
  paymentSchedule: PaymentSchedule;
  currency?: CurrencyCode;
  targetExposureCount?: number;
  targetFanReach?: number;
  targetMediaValue?: number;
  attachedContractId?: string;
  // 국내 계좌
  domesticBankName?: string;
  domesticAccountNumber?: string;
  domesticAccountHolder?: string;
  // 영국 계좌
  ukBankName?: string;
  ukSortCode?: string;
  ukAccountNumber?: string;
  ukSwiftBic?: string;
  // 국내/해외 구분
  isOverseas?: boolean;
  // 국내 전용
  businessRegNumber?: string;
  postalCode?: string;
  address?: string;
  addressDetail?: string;
  // 해외 전용
  taxId?: string;
  overseasAddress?: string;
}

export interface UpdateSponsorshipDto {
  sponsorName?: string;
  type?: SponsorType;
  totalFee?: number;
  contractStart?: string;
  contractEnd?: string;
  paymentSchedule?: PaymentSchedule;
  attachedContractId?: string;
  // 국내 계좌
  domesticBankName?: string | null;
  domesticAccountNumber?: string | null;
  domesticAccountHolder?: string | null;
  // 영국 계좌
  ukBankName?: string | null;
  ukSortCode?: string | null;
  ukAccountNumber?: string | null;
  ukSwiftBic?: string | null;
  // 국내/해외 구분
  isOverseas?: boolean;
  // 국내 전용
  businessRegNumber?: string | null;
  postalCode?: string | null;
  address?: string | null;
  addressDetail?: string | null;
  // 해외 전용
  taxId?: string | null;
  overseasAddress?: string | null;
  targetExposureCount?: number | null;
  targetFanReach?: number | null;
  targetMediaValue?: number | null;
}

export interface SponsorshipListQuery {
  type?: SponsorType;
  page?: string;
}

export interface MarkPaidDto {
  adjustedAmount?: number;
  adjustmentReason?: string;
  appliedClauseId?: number;
  exchangeRate?: number;
}
