import { api } from './api'
import type { OperatingCategory, OperatingExpense } from '@/types/budget'

export type ExpenseCostType = 'FIXED' | 'VARIABLE' | 'CONTINGENCY'

export const EXPENSE_COST_TYPE_LABEL: Record<ExpenseCostType, string> = {
  FIXED: '고정지출비',
  VARIABLE: '변동비',
  CONTINGENCY: '예비비',
}

export const ALL_EXPENSE_COST_TYPES: ExpenseCostType[] = ['FIXED', 'VARIABLE', 'CONTINGENCY']

export const operatingExpenseApi = {
  list: (seasonId: number) =>
    api.get<OperatingExpense[]>(`/operating-expenses?seasonId=${seasonId}`),

  create: (payload: {
    seasonId: number
    category: OperatingCategory
    costType?: ExpenseCostType
    amount: number
    date: string
    note?: string
    budgetLineId?: number
  }) => api.post<OperatingExpense>('/operating-expenses', payload),

  delete: (id: string) =>
    api.delete(`/operating-expenses/${id}`),
}
