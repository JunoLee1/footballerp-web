export type JobPostingStatus = 'DRAFT' | 'OPEN' | 'CLOSED'
export type JobApplicationStatus =
  | 'APPLIED'
  | 'SCREENING'
  | 'INTERVIEW_1'
  | 'INTERVIEW_2'
  | 'REFERENCE_CHECK'
  | 'OFFER_PENDING_LEADER'
  | 'OFFER_PENDING_DEPT_HEAD'
  | 'OFFER_PENDING_HR'
  | 'OFFER_LEADER_REJECTED'
  | 'OFFER_DEPT_HEAD_REJECTED'
  | 'OFFER_HR_REJECTED'
  | 'OFFERED'
  | 'ONBOARDED'
  | 'REJECTED'
export type InterviewRound = 'ROUND_1' | 'ROUND_2'
export type InterviewResult = 'PENDING' | 'PASS' | 'FAIL'
export type ReferenceCheckResult = 'PENDING' | 'CLEAR' | 'FLAGGED'

// #370 — offer 3-stage approval trail
export type OfferApprovalStage = 'LEADER' | 'DEPT_HEAD' | 'HR'
export type OfferApprovalAction = 'APPROVED' | 'REJECTED'

export interface OfferApproval {
  id: number
  applicationId: number
  stage: OfferApprovalStage
  action: OfferApprovalAction
  reviewerId: string
  reason: string | null
  createdAt: string
  reviewer: { id: number; username: string; nickname: string | null }
}

// Korean status labels — reused by badges + timeline
export const APPLICATION_STATUS_LABEL: Record<JobApplicationStatus, string> = {
  APPLIED: '지원',
  SCREENING: '서류 심사',
  INTERVIEW_1: '1차 면접',
  INTERVIEW_2: '2차 면접',
  REFERENCE_CHECK: '평판 조회',
  OFFER_PENDING_LEADER: '팀장 결재 대기',
  OFFER_PENDING_DEPT_HEAD: '부서장 결재 대기',
  OFFER_PENDING_HR: 'HR 결재 대기',
  OFFER_LEADER_REJECTED: '팀장 반려',
  OFFER_DEPT_HEAD_REJECTED: '부서장 반려',
  OFFER_HR_REJECTED: 'HR 반려',
  OFFERED: '오퍼 완료',
  ONBOARDED: '입사 완료',
  REJECTED: '반려',
}

export const APPLICATION_STATUS_STYLE: Record<JobApplicationStatus, string> = {
  APPLIED: 'bg-slate-100 text-slate-700',
  SCREENING: 'bg-slate-100 text-slate-700',
  INTERVIEW_1: 'bg-blue-100 text-blue-800',
  INTERVIEW_2: 'bg-blue-100 text-blue-800',
  REFERENCE_CHECK: 'bg-indigo-100 text-indigo-800',
  OFFER_PENDING_LEADER: 'bg-amber-100 text-amber-800',
  OFFER_PENDING_DEPT_HEAD: 'bg-amber-100 text-amber-800',
  OFFER_PENDING_HR: 'bg-amber-100 text-amber-800',
  OFFER_LEADER_REJECTED: 'bg-red-100 text-red-800',
  OFFER_DEPT_HEAD_REJECTED: 'bg-red-100 text-red-800',
  OFFER_HR_REJECTED: 'bg-red-100 text-red-800',
  OFFERED: 'bg-emerald-100 text-emerald-800',
  ONBOARDED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
}

export const OFFER_APPROVAL_STAGE_LABEL: Record<OfferApprovalStage, string> = {
  LEADER: '팀장',
  DEPT_HEAD: '부서장',
  HR: 'HR',
}

export interface JobPosting {
  id: number
  title: string
  departmentId: number | null
  headcount: number
  description: string
  status: JobPostingStatus
  createdById: string
  approvedById: string | null
  approvedAt: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
  // #372 — free-form list of document types required before HiringDispatch execution
  requiredDocuments?: string[]
  department: { id: number; name: string } | null
  createdBy: { id: number; username: string }
  approvedBy: { id: number; username: string } | null
  applications: JobApplication[]
}

export interface JobApplication {
  id: number
  postingId: number
  applicantName: string
  email: string
  phone: string | null
  resumeUrl: string | null
  status: JobApplicationStatus
  rejectedAt: string | null
  offeredAt: string | null
  offeredById: string | null
  createdAt: string
  updatedAt: string
  posting: {
    id: number
    title: string
    departmentId?: number | null
    department?: { id: number; name: string; headId: string | null } | null
  }
  offeredBy: { id: number; username: string } | null
  interviews: Interview[]
  referenceCheck: ReferenceCheck | null
  onboarding: Onboarding | null
  // #370 — offer 3-stage approval trail, ordered by createdAt asc
  offerApprovals?: OfferApproval[]
}

export interface Interview {
  id: number
  applicationId: number
  round: InterviewRound
  scheduledAt: string | null
  interviewerIds: number[]
  scoreSkill: number | null
  scoreComm: number | null
  scoreCulture: number | null
  comment: string | null
  result: InterviewResult
  createdAt: string
  updatedAt: string
}

export interface ReferenceCheck {
  id: number
  applicationId: number
  contactName: string
  relationship: string
  result: ReferenceCheckResult
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Onboarding {
  id: number
  applicationId: number
  userId: string | null
  otpCode: string
  otpExpiresAt: string
  emailVerifiedAt: string | null
  mfaRegisteredAt: string | null
  completedAt: string | null
  createdAt: string
  user: { id: number; username: string; email: string } | null
}
