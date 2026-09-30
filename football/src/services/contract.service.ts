import { api } from './api'
import type {
  ContractSummary, ContractSummaryWithPlayer, ContractDetail, ContractStatus,
  CreateExtensionDto, CreateBonusDto,
} from '@/types/contract'

export interface ContractCreateResult extends ContractDetail {
  wageCapWarning?: { percentOver: number }
}

export const contractApi = {
  getAll: () =>
    api.get<ContractSummaryWithPlayer[]>(`/contracts`),

  byPlayer: (playerId: string) =>
    api.get<ContractSummary[]>(`/contracts/player/${playerId}`),

  get: (id: string) =>
    api.get<ContractDetail>(`/contracts/${id}`),

  create: (payload: {
    playerId: string
    startDate: string
    endDate: string
    salary: number
    managedById?: string
    signingBonus?: number
    signingBonusScheduledAt?: string
  }) => api.post<ContractCreateResult>('/contracts', payload),

  updateStatus: (id: string, status: ContractStatus) =>
    api.patch<ContractDetail>(`/contracts/${id}/status`, { status }),

  addBuyout: (contractId: string, amount: number) =>
    api.post<ContractDetail>(`/contracts/${contractId}/buyout`, { amount }),

  addExtension: (contractId: string, dto: CreateExtensionDto) =>
    api.post<ContractDetail>(`/contracts/${contractId}/extensions`, dto),

  addBonus: (contractId: string, dto: CreateBonusDto) =>
    api.post<ContractDetail>(`/contracts/${contractId}/bonuses`, dto),

  markSigningBonusPaid: (id: string, paidAt?: string) =>
    api.patch<ContractDetail>(`/contracts/${id}/signing-bonus-paid`, paidAt ? { paidAt } : {}),
}
