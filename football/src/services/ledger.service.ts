import { api } from './api'

export interface LedgerEntry {
  id: number
  type: 'INCOME' | 'EXPENSE'
  category: string
  amount: number
  currency: string
  exchangeRate: number
  amountKrw: number
  description?: string
  relatedModule?: string
  relatedId?: number
  isRefund: boolean
  createdById: string
  createdAt: string
}

export const ledgerApi = {
  list: (params?: { type?: string; category?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams()
    if (params?.type) qs.set('type', params.type)
    if (params?.category) qs.set('category', params.category)
    if (params?.from) qs.set('from', params.from)
    if (params?.to) qs.set('to', params.to)
    const q = qs.toString()
    return api.get<LedgerEntry[]>(`/ledger${q ? `?${q}` : ''}`)
  },

  get: (id: number) =>
    api.get<LedgerEntry>(`/ledger/${id}`),

  create: (payload: {
    type: 'INCOME' | 'EXPENSE'
    category: string
    amount: number
    currency?: string
    exchangeRate?: number
    description?: string
  }) => api.post<LedgerEntry>('/ledger', payload),

  refund: (id: number) =>
    api.post<LedgerEntry>(`/ledger/${id}/refund`, {}),

  lockPeriod: (year: number, month: number) =>
    api.post(`/ledger/lock?year=${year}&month=${month}`, {}),
}
