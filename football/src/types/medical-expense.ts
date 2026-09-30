export type ExpenseCostCategory = 'OUTPATIENT' | 'EXAMINATION' | 'SURGERY' | 'REHABILITATION' | 'MEDICATION'
export type ExpensePayerType = 'CLUB' | 'ASSOCIATION' | 'INDIVIDUAL'
export type MedicalExpenseStatus = 'DRAFT' | 'SUBMITTED' | 'LEADER_APPROVED' | 'APPROVED' | 'REJECTED'

export interface ExpenseUser {
  id: number
  nickname: string
  role: string
  coachingRole: string | null
}

export interface ExpenseInjury {
  id: number
  bodyPart: string
  playerId: string
}

export interface ExpensePlayer {
  id: string
  playerName: string
  position: string
  dateOfBirth: string
}

export interface MedicalExpense {
  id: number
  status: MedicalExpenseStatus
  injuryId: number | null
  injury: ExpenseInjury | null
  playerId: string | null
  player: ExpensePlayer | null
  receiptDate: string
  costCategory: ExpenseCostCategory
  totalAmount: number
  payerType: ExpensePayerType
  description: string | null
  fileUrl: string | null
  fileName: string | null
  rejectionReason: string | null
  submittedById: string
  submittedBy: ExpenseUser
  leaderReviewerId: string | null
  leaderReviewer: ExpenseUser | null
  adminReviewerId: string | null
  adminReviewer: ExpenseUser | null
  submittedAt: string | null
  leaderReviewedAt: string | null
  adminReviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateExpenseDto {
  receiptDate: string
  costCategory: ExpenseCostCategory
  totalAmount: number
  payerType: ExpensePayerType
  injuryId?: number
  playerId?: string
  description?: string
  file?: File
}

export interface UpdateExpenseDto {
  receiptDate?: string
  costCategory?: ExpenseCostCategory
  totalAmount?: number
  payerType?: ExpensePayerType
  injuryId?: number | null
  playerId?: string | null
  description?: string
  file?: File
}

export const COST_CATEGORY_LABEL: Record<ExpenseCostCategory, string> = {
  OUTPATIENT: 'Outpatient',
  EXAMINATION: 'Examination',
  SURGERY: 'Surgery',
  REHABILITATION: 'Rehabilitation',
  MEDICATION: 'Medication',
}

export const PAYER_TYPE_LABEL: Record<ExpensePayerType, string> = {
  CLUB: 'Club',
  ASSOCIATION: 'Association',
  INDIVIDUAL: 'Individual',
}

export const EXPENSE_STATUS_LABEL: Record<MedicalExpenseStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  LEADER_APPROVED: '1st Approved',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

export const EXPENSE_STATUS_STYLE: Record<MedicalExpenseStatus, string> = {
  DRAFT: 'border-border text-muted-foreground',
  SUBMITTED: 'border-blue-300 text-blue-700 bg-blue-50',
  LEADER_APPROVED: 'border-indigo-300 text-indigo-700 bg-indigo-50',
  APPROVED: 'border-green-300 text-green-700 bg-green-50',
  REJECTED: 'border-red-300 text-red-700 bg-red-50',
}
