export type PartnerType = 'MANUFACTURER' | 'HOSPITAL'
export type PartnerContractStatus = 'ACTIVE' | 'EXPIRED' | 'TERMINATED'

export interface Partner {
  id: number
  type: PartnerType
  name: string
  country: string | null
  website: string | null
  address: string | null
  phone: string | null
  createdAt: string
  contracts?: PartnerContract[]
  // #593 — 업체 등록 확장
  sla?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  paymentBankName?: string | null
  paymentTerms?: string | null
  // 사업자등록번호 · 계좌번호는 암호화 저장 · 응답에는 마스킹 처리 (server side)
  hasPaymentAccountNumber?: boolean
  hasBusinessRegNumber?: boolean
}

export interface PartnerContract {
  id: number
  partnerId: number
  status: PartnerContractStatus
  startDate: string
  endDate: string
  sponsorshipFee: number | null
  discountRate: number | null
  notes: string | null
  createdAt: string
}

export interface CreatePartnerDto {
  type: PartnerType
  name: string
  country?: string
  website?: string
  address?: string
  phone?: string
  // #593
  sla?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  paymentBankName?: string
  paymentAccountNumber?: string
  paymentTerms?: string
  businessRegNumber?: string
}

export interface UpdatePartnerDto {
  name?: string
  country?: string | null
  website?: string | null
  address?: string | null
  phone?: string | null
  sla?: string | null
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  paymentBankName?: string | null
  paymentAccountNumber?: string | null
  paymentTerms?: string | null
  businessRegNumber?: string | null
}

export interface CreatePartnerContractDto {
  startDate: string
  endDate: string
  sponsorshipFee?: number
  discountRate?: number
  notes?: string
}

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = {
  MANUFACTURER: 'Manufacturer',
  HOSPITAL: 'Partner Hospital',
}

export const CONTRACT_STATUS_LABEL: Record<PartnerContractStatus, string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
}

export const CONTRACT_STATUS_STYLE: Record<PartnerContractStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 border-green-200',
  EXPIRED: 'bg-gray-100 text-gray-500 border-gray-200',
  TERMINATED: 'bg-red-100 text-red-800 border-red-200',
}
