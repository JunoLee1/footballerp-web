export type SurveyStatus = 'DRAFT' | 'OPEN' | 'CLOSED'
export type SurveyPriority = 'HIGH' | 'MEDIUM' | 'LOW'
export type SurveyResponseStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'

export const PRIORITY_LABELS: Record<SurveyPriority, string> = {
  HIGH: '높음',
  MEDIUM: '보통',
  LOW: '낮음',
}

export const RESPONSE_STATUS_LABELS: Record<SurveyResponseStatus, string> = {
  DRAFT: '작성 중',
  SUBMITTED: '결재 대기',
  APPROVED: '승인 완료',
  REJECTED: '반려',
}

// Tailwind class tuples used by the status badge — kept alongside the labels so
// the FE has one source of truth for status vocabulary.
export const RESPONSE_STATUS_BADGE_CLASSES: Record<SurveyResponseStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
}

export interface SurveyTargetDept {
  surveyId: number
  departmentId: number
  department: { id: number; name: string; headId: string | null }
}

export interface SurveyResponse {
  id: number
  surveyId: number
  departmentId: number
  department: { id: number; name: string }
  submittedBy: { id: number; username: string }
  approvedBy?: { id: number; username: string } | null
  approvedAt?: string | null
  status: SurveyResponseStatus
  rejectionReason?: string | null
  roleTitle: string
  headcount: number
  quarter: number | null
  priority: SurveyPriority
  estimatedBudget: number | null
  reason: string
  createdAt: string
}

export interface HiringNeedsSurvey {
  id: number
  title: string
  deadlineAt: string
  status: SurveyStatus
  createdBy: { id: number; username: string }
  targetDepartments: SurveyTargetDept[]
  responses: SurveyResponse[]
  createdAt: string
}

export interface UpdateHiringSurveyDraftDto {
  title?: string
  deadlineAt?: string
  targetDeptIds?: number[]
}

export interface CreateSurveyResponseDto {
  departmentId: number
  roleTitle: string
  headcount: number
  quarter?: number
  priority: SurveyPriority
  estimatedBudget?: number
  reason: string
}

export interface UpdateSurveyResponseDto {
  roleTitle?: string
  headcount?: number
  quarter?: number | null
  priority?: SurveyPriority
  estimatedBudget?: number | null
  reason?: string
}

/**
 * Error payload from HR close guard when target dept responses aren't all
 * APPROVED — surfaced in FE toast/inline message.
 */
export interface SurveyCloseBlockingDetail {
  departmentId: number
  departmentName: string
  status: SurveyResponseStatus | 'MISSING'
}

export interface HiringPlanItem {
  id: number
  planReportId: number
  surveyResponseId: number | null
  roleTitle: string
  headcount: number
  quarter: number | null
  priority: SurveyPriority
  estimatedBudget: number | null
  createdAt: string
}
