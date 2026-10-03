import { api } from './api'
import type { Partner, PartnerContract, CreatePartnerDto, CreatePartnerContractDto } from '@/types/partner'
import type { PartnerType, PartnerContractStatus } from '@/types/partner'

export const partnerApi = {
  list: (type?: PartnerType) =>
    api.get<Partner[]>(`/partners${type ? `?type=${type}` : ''}`),

  get: (id: string) => api.get<Partner>(`/partners/${id}`),

  create: (dto: CreatePartnerDto) => api.post<Partner>('/partners', dto),

  update: (id: string, dto: Partial<CreatePartnerDto>) =>
    api.patch<Partner>(`/partners/${id}`, dto),

  createContract: (partnerId: string, dto: CreatePartnerContractDto) =>
    api.post<PartnerContract>(`/partners/${partnerId}/contracts`, dto),

  updateContract: (partnerId: string, contractId: number, dto: { status?: PartnerContractStatus; endDate?: string }) =>
    api.patch<PartnerContract>(`/partners/${partnerId}/contracts/${contractId}`, dto),
}
