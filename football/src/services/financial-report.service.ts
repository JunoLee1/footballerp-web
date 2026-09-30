import { api } from './api'
import type { BudgetPlan, UpsertBudgetPlanPayload, OptimizeResult, AutoGenerateResult } from '@/types/budget'
import type { BudgetPlanStatus } from './budget-plan.service'

export interface RevenueBreakdown {
  plannedRevenueTicket: number
  plannedRevenueSponsorship: number
  /**
   * Sponsorship accrual (dueDate ∈ season window, status 무관) — ADR 0024.
   * Optional 로 두어 기존 소비처 (Actual 만 쓰던 upload/CSV 경로) 하위 호환.
   */
  expectedRevenueSponsorship?: number | null
  plannedRevenueBroadcast: number
  plannedRevenueMerchandise: number
  plannedRevenueSubsidy: number
  plannedRevenueParentCompany: number
  plannedRevenueAcademyFee: number
  plannedRevenueOther: number
}

export interface FinancialReport {
  id: number
  seasonId: number
  totalRevenue: number
  note: string | null
  createdAt: string
  updatedAt: string
  plannedRevenueTicket?: number
  plannedRevenueSponsorship?: number
  /**
   * Sponsorship Expected (accrual by dueDate) — ADR 0024, PR #480 (BE slice).
   * null 인 경우: 기존 row 아직 backfill 안 됨 or 계약/payment schedule 없음.
   */
  expectedRevenueSponsorship?: number | null
  plannedRevenueBroadcast?: number
  plannedRevenueMerchandise?: number
  plannedRevenueSubsidy?: number
  plannedRevenueParentCompany?: number
  plannedRevenueAcademyFee?: number
  plannedRevenueOther?: number
  /**
   * 편성 워크플로우 상태 (schema.prisma enum BudgetPlanStatus).
   * `findUnique` 로 뽑는 raw FinancialReport 에 늘 포함되므로 optional 이 아니지만,
   * 예전 API 응답 캐시나 CSV upload 경로에서 undefined 로 오는 경우가 있어 optional 로 둔다.
   */
  planStatus?: BudgetPlanStatus
  planStatusChangedAt?: string | null
  planStatusChangedById?: string | null
  reviewOpenedAt?: string | null
  reviewDeadline?: string | null
}

export interface PnLRevenueActual {
  ticket: number
  merchandise: number
  other: number
  sponsorship: number
  academyFee: number
  broadcast: number
  subsidy: number
  parentCompany: number
  total: number
}

export interface PnLExpenseActual {
  playerSalary: number
  staffPayroll: number
  operating: number
  operatingByCategory: Record<string, number>
  medical: number
  meals: number
  total: number
}

export interface PnL {
  season: { id: number; name: string; startDate: string; endDate: string }
  plannedRevenue: number | null
  revenue: PnLRevenueActual
  expenses: PnLExpenseActual
  summary: {
    grossProfit: number
    profitMargin: number
    revenueVsPlan: number | null
  }
}

export const financialReportApi = {
  get: (seasonId: number) =>
    api.get<FinancialReport>(`/financial-reports/${seasonId}`),

  set: (seasonId: number, payload: { totalRevenue: number; note?: string }) =>
    api.post<FinancialReport>(`/financial-reports/${seasonId}`, payload),

  uploadCSV: (seasonId: number, file: File, note?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (note) form.append('note', note)
    return api.postForm<FinancialReport>(`/financial-reports/${seasonId}/csv`, form)
  },

  setRevenueBreakdown: (seasonId: number, breakdown: RevenueBreakdown) =>
    api.put<FinancialReport>(`/financial-reports/${seasonId}/revenue`, breakdown),

  setFromPrevSeason: (seasonId: number, prevSeasonId: number) =>
    api.post<FinancialReport>(`/financial-reports/${seasonId}/from-prev-season`, { prevSeasonId }),

  autoFillRevenue: (seasonId: number) =>
    api.post<FinancialReport>(`/financial-reports/${seasonId}/revenue/auto-fill`, {}),

  getPnL: (seasonId: number) =>
    api.get<PnL>(`/financial-reports/${seasonId}/pl`),

  overrideCarryOver: (seasonId: number, payload: { amount: number; reason: string }) =>
    api.patch<{
      seasonId: number
      carryOverFromPrev: number
      carryOverOverriddenById: string | null
      carryOverOverriddenAt: string | null
      carryOverOverrideReason: string | null
    }>(`/financial-reports/${seasonId}/carryover`, payload),
}

export const budgetPlanApi = {
  get: (seasonId: number) =>
    api.get<BudgetPlan>(`/financial-reports/${seasonId}/budget`),

  save: (seasonId: number, payload: UpsertBudgetPlanPayload) =>
    api.put<BudgetPlan>(`/financial-reports/${seasonId}/budget`, payload),

  optimize: (seasonId: number) =>
    api.post<OptimizeResult>(`/financial-reports/${seasonId}/budget/optimize`, {}),

  addOverride: (seasonId: number, payload: { category: string; amount: number; reason: string }) =>
    api.post(`/financial-reports/${seasonId}/budget/override`, payload),

  autoGenerate: (seasonId: number, payload: { growthRate: number; contingencyRate?: number }) =>
    api.post<AutoGenerateResult>(`/financial-reports/${seasonId}/budget/auto-generate`, payload),
}
