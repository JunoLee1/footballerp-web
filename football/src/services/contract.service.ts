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

  get: (id: number) =>
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

  updateStatus: (id: number, status: ContractStatus) =>
    api.patch<ContractDetail>(`/contracts/${id}/status`, { status }),

  addBuyout: (contractId: number, amount: number) =>
    api.post<ContractDetail>(`/contracts/${contractId}/buyout`, { amount }),

  addExtension: (contractId: number, dto: CreateExtensionDto) =>
    api.post<ContractDetail>(`/contracts/${contractId}/extensions`, dto),

  addBonus: (contractId: number, dto: CreateBonusDto) =>
    api.post<ContractDetail>(`/contracts/${contractId}/bonuses`, dto),

  markSigningBonusPaid: (id: number, paidAt?: string) =>
    api.patch<ContractDetail>(`/contracts/${id}/signing-bonus-paid`, paidAt ? { paidAt } : {}),
}
