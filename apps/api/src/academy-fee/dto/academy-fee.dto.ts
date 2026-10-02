export interface CreateAcademyFeeDto {
  playerId: string
  guardianId: string
  amount: number
  dueDate: Date
  year: number
  month: number
}

export interface SubmitPaymentProofDto {
  paymentProofUrl: string
}

export interface FeeListQuery {
  status?: string
  teamId?: number
  year?: number
  month?: number
}

export interface TossConfirmDto {
  paymentKey: string
  orderId: string
  amount: number
}

export interface AdminSubmitDto {
  paymentProofUrl?: string
}

export interface CreateSingleFeeDto {
  playerId: string
  amount: number
  dueDate: string  // ISO date string
  year: number
  month: number
}
