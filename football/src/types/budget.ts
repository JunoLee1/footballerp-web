// Category set is now DB-backed via ExpenseCategory table (ADR-0012).
// Runtime source of truth: useExpenseCategories() hook fetching /expense-categories.
// This type is intentionally widened to string — union literals are no longer available
// at compile time.
import type { ExpenseCategoryCode } from './expense-category'

export type OperatingCategory = ExpenseCategoryCode

export interface BudgetTier {
  id: string
  categoryPlanId: number
  name: string
  cost: number
  value: number
  isSelected: boolean
}

export interface BudgetCategoryPlan {
  id: string
  financialReportId: string
  category: OperatingCategory
  mandatoryMinimum: number
  knapsackAllocated: number | null
  tiers: BudgetTier[]
}

export interface BudgetOverrideLog {
  id: string
  category: OperatingCategory
  amount: number
  reason: string
  createdAt: string
}

export interface BudgetPlan {
  id: string
  seasonId: number
  totalRevenue: number
  totalOperatingBudget: number | null
  contingencyReserve: number | null
  playerSalaryBudget: number | null
  budgetCategoryPlans: BudgetCategoryPlan[]
  overrideLogs: BudgetOverrideLog[]
  actuals: Record<string, number> | null
}

export interface UpsertBudgetPlanPayload {
  totalOperatingBudget: number
  contingencyReserve: number
  playerSalaryBudget?: number
  categories: {
    category: OperatingCategory
    mandatoryMinimum: number
    /** Position within the wizard (0-indexed). Preserves user D&D order. */
    sortOrder: number
    tiers: {
      name: string
      cost: number
      value: number
      /** Position within the category (0-indexed). Preserves user D&D order. */
      sortOrder: number
    }[]
  }[]
}

export interface OptimizeResult {
  selectedTiers: { tierId: number; categoryPlanId: number; allocated: number }[]
  totalCost: number
  totalValue: number
  capacity: number
  mandatoryTotal: number
}

export interface OperatingExpense {
  id: string
  seasonId: number
  category: OperatingCategory
  amount: number
  date: string
  note: string | null
  createdAt: string
  createdBy: { id: number; username: string }
}

export interface AutoGenerateResult {
  totalOperatingBudget: number
  contingencyReserve: number
  categories: { category: OperatingCategory; mandatoryMinimum: number }[]
  zeroCategories: OperatingCategory[]
}
