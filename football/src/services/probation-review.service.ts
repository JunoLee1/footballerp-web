import { api } from './api'

export type ProbationReviewType = 'THREE_MO' | 'SIX_MO'
export type ProbationReviewStatus = 'PENDING' | 'PASSED' | 'FAILED'
export type ProbationStatus = 'IN_PROGRESS' | 'PASSED' | 'FAILED'

export interface ProbationReview {
  id: number
  staffRecordId: number
  reviewType: ProbationReviewType
  status: ProbationReviewStatus
  leaderAssessment: string | null
  reviewedById: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  reviewedBy: {
    id: number
    username: string
    nickname: string
  } | null
}

export interface SubmitProbationReviewPayload {
  reviewType: ProbationReviewType
  status: Exclude<ProbationReviewStatus, 'PENDING'>
  leaderAssessment: string
}

/**
 * Client for probation-review endpoints (see apps/api/src/probation-review/).
 * Mirrors the router mounted at `/staff-records`:
 *   POST /staff-records/:id/probation-review
 *   GET  /staff-records/:id/probation-reviews
 */
export const probationReviewApi = {
  submit: (staffId: number, payload: SubmitProbationReviewPayload) =>
    api.post<ProbationReview>(`/staff-records/${staffId}/probation-review`, payload),

  list: (staffId: number) =>
    api.get<ProbationReview[]>(`/staff-records/${staffId}/probation-reviews`),
}
