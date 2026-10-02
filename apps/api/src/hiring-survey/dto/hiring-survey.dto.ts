export type SurveyPriority = 'HIGH' | 'MEDIUM' | 'LOW'
export type SurveyResponseStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'

export interface CreateHiringSurveyDto {
  title: string
  deadlineAt: string
  targetDeptIds: string[]
}

export interface CreateSurveyResponseDto {
  roleTitle: string
  headcount: number
  quarter?: number
  priority: SurveyPriority
  estimatedBudget?: number
  reason: string
}

/**
 * DTO for 팀장 editing a DRAFT/REJECTED SurveyResponse.
 * All fields optional — validated against non-blank on the server if provided.
 */
export interface UpdateSurveyResponseDto {
  roleTitle?: string
  headcount?: number
  quarter?: number | null
  priority?: SurveyPriority
  estimatedBudget?: number | null
  reason?: string
}

export interface RejectSurveyResponseDto {
  rejectionReason: string
}

export interface CreateHiringPlanItemDto {
  roleTitle: string
  headcount: number
  quarter?: number
  priority: SurveyPriority
  estimatedBudget?: number
}

export interface UpdateHiringPlanItemDto {
  roleTitle?: string
  headcount?: number
  quarter?: number | null
  priority?: SurveyPriority
  estimatedBudget?: number | null
}

export interface UpdateHiringSurveyDraftDto {
  title?: string
  deadlineAt?: string
  targetDeptIds?: string[]
}
