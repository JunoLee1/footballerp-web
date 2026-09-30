export type OnboardingTaskStatus = 'PENDING' | 'SELF_REPORTED' | 'DONE' | 'SKIPPED'

export interface OnboardingTaskVerifiedBy {
  id: number
  username: string
  nickname: string
}

export interface OnboardingTask {
  id: number
  onboardingId: number
  title: string
  description: string | null
  dueDate: string | null
  requiresVerification: boolean
  optional: boolean
  status: OnboardingTaskStatus
  order: number
  selfReportedAt: string | null
  verifiedById: string | null
  verifiedAt: string | null
  verifyNotes: string | null
  skipReason: string | null
  createdAt: string
  updatedAt: string
  verifiedBy: OnboardingTaskVerifiedBy | null
}

/**
 * Verify queue entry — includes onboarding + dispatch context so the queue
 * page can render "홍길동님이 SW팀에 배정된 태스크: 환영 오리엔테이션" without
 * a follow-up round-trip.
 */
export interface OnboardingVerifyQueueRow extends OnboardingTask {
  onboarding: {
    id: number
    userId: string | null
    user: { id: number; username: string; nickname: string } | null
    hiringDispatch: { id: number; departmentId: number; candidateName: string } | null
  }
}

export interface VerifyOnboardingTaskPayload {
  action: 'APPROVE' | 'REJECT'
  verifyNotes?: string
}

export interface SkipOnboardingTaskPayload {
  skipReason: string
}
