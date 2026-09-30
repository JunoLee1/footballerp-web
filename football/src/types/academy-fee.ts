export type FeeStatus = 'PENDING' | 'SUBMITTED' | 'FIRST_APPROVED' | 'PAID' | 'OVERDUE' | 'LOCKED'
export type PaymentMethod = 'PG' | 'BANK_TRANSFER'

export interface AcademyFee {
  id: number
  playerId: string
  player: { id: string; playerName: string; teamId: number | null; status: string }
  guardianId: string
  guardian: { id: number; username: string }
  amount: number
  dueDate: string
  status: FeeStatus
  paidAt: string | null
  paymentProofUrl: string | null
  paymentSubmittedAt: string | null
  paymentMethod: PaymentMethod | null
  pgTransactionId: string | null
  receiptIssuedAt: string | null
  year: number
  month: number
  createdAt: string
}

export interface FeeReceipt {
  id: number
  year: number
  month: number
  amount: number
  paidAt: string
  paymentMethod: PaymentMethod | null
  pgTransactionId: string | null
  receiptIssuedAt: string
  playerName: string
  guardianUsername: string
}

export interface YouthPlayerSearchResult {
  id: string
  playerName: string
  guardianId: string | null
  guardianUsername: string | null
}

export interface AcademyFinanceStats {
  monthlyCollectionRate: number
  totalRevenue: number
  overdueCount: number
  lockedPlayerCount: number
  lockedAmount: number
}
