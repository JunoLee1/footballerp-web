import { api } from './api'

export type LicenseSupplyType = 'EXCLUSIVE' | 'NON_EXCLUSIVE'

export interface SoftwareLicense {
  id: number
  name: string
  vendor: string
  totalSeats: number
  usedSeats: number
  expiresAt: string | null
  renewalCost: number | null
  createdAt: string
  updatedAt: string
  // #593 — 라이선스 등록 확장
  version?: string | null
  ipRegistrationNumber?: string | null
  licenseCertificateUrl?: string | null
  contractDocumentUrl?: string | null
  supplyType?: LicenseSupplyType | null
  territory?: string | null
  deviceLimit?: number | null
  serverSpec?: string | null
  siteLimit?: number | null
}

export interface CreateSoftwareLicenseDto {
  name: string
  vendor: string
  partnerId?: number  // (PR C 예정: 등록된 Partner FK 강제)
  totalSeats: number
  expiresAt?: string
  renewalCost?: number
  // #593
  version?: string
  ipRegistrationNumber?: string
  licenseCertificateUrl?: string
  contractDocumentUrl?: string
  supplyType?: LicenseSupplyType
  territory?: string
  deviceLimit?: number
  serverSpec?: string
  siteLimit?: number
}

export interface UpdateSoftwareLicenseDto {
  name?: string
  vendor?: string
  partnerId?: number | null
  totalSeats?: number
  expiresAt?: string
  renewalCost?: number
  version?: string | null
  ipRegistrationNumber?: string | null
  licenseCertificateUrl?: string | null
  contractDocumentUrl?: string | null
  supplyType?: LicenseSupplyType | null
  territory?: string | null
  deviceLimit?: number | null
  serverSpec?: string | null
  siteLimit?: number | null
}

export const SUPPLY_TYPE_LABEL: Record<LicenseSupplyType, string> = {
  EXCLUSIVE: '독점 (Exclusive)',
  NON_EXCLUSIVE: '비독점 (Non-exclusive)',
}

export const softwareLicenseApi = {
  list: () => api.get<SoftwareLicense[]>('/software-licenses'),
  create: (dto: CreateSoftwareLicenseDto) => api.post<SoftwareLicense>('/software-licenses', dto),
  update: (id: number, dto: UpdateSoftwareLicenseDto) => api.patch<SoftwareLicense>(`/software-licenses/${id}`, dto),
  assign: (id: number, userId: string) => api.post<SoftwareLicense>(`/software-licenses/${id}/assign`, { userId }),
  revoke: (id: number, userId: string) => api.delete<SoftwareLicense>(`/software-licenses/${id}/assign/${userId}`),
}
