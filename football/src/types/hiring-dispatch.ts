/**
 * Frontend types mirroring `apps/api/src/hiring-dispatch`.
 *
 * Note on `monthlySalary` — the backend model uses Prisma BigInt, and the
 * controller serialize()s it as a string over the wire. Client code should
 * treat it as a numeric string and coerce with Number()/BigInt() only when
 * it needs arithmetic. We keep the field typed as `string` here so callers
 * don't accidentally lose precision on very large payloads.
 */

export type HiringDispatchStatus =
  | 'CREATED'
  | 'BUDGET_REVERIFIED'
  | 'DISPATCH_APPROVED'
  | 'DISPATCHED'
  | 'ONBOARDING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'

export type HiringDispatchStage =
  | 'BUDGET_REVIEW'
  | 'DISPATCH_APPROVAL'
  | 'EXECUTION'

export type HiringDispatchAction = 'APPROVED' | 'REJECTED'

export type JobGrade =
  | 'INTERN'
  | 'JUNIOR'
  | 'ASSOCIATE'
  | 'MANAGER'
  | 'DIRECTOR'
  | 'EXECUTIVE'

export type EmploymentType =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'CONTRACT'
  | 'INTERN'
  | 'ADVISOR'

export type HiringDispatchFilter =
  | 'me'
  | 'pending-budget'
  | 'pending-dispatch'
  | 'pending-execution'
  | 'all'

export interface HiringDispatchApproval {
  id: number
  stage: HiringDispatchStage
  action: HiringDispatchAction
  reviewerId: string
  reason: string | null
  createdAt: string
  reviewer: { id: number; username: string; nickname: string }
}

/**
 * Full HiringDispatch as returned by GET /:id (detailInclude on the server).
 * List endpoints return a subset — see HiringDispatchListItem. Nullable
 * relations are `null` (not undefined) to match Prisma's shape.
 */
export interface HiringDispatch {
  id: number
  applicationId: number | null
  candidateName: string
  candidateEmail: string
  jobTitle: string
  jobGrade: JobGrade
  employmentType: EmploymentType
  departmentId: number
  reportsToUserId: string | null
  monthlySalary: string
  startDate: string
  targetRole: string
  targetFrontOfficeRole: string | null
  targetCoachingRole: string | null
  permissionNotes: string | null
  status: HiringDispatchStatus
  createdById: string
  createdUserId: string | null
  createdAt: string
  updatedAt: string
  // #372 — application-free path uses this list; when applicationId is set,
  // the posting.requiredDocuments is authoritative and this field is unused
  // by the gate.
  requiredDocuments?: string[]

  application: {
    id: number
    applicantName: string
    email: string
    status: string
    postingId: number
    posting: {
      id: number
      title: string
      headcount: number
      hiringPlanItemId: number | null
      requiredDocuments?: string[]
      hiringPlanItem: { id: number; roleTitle: string; headcount: number } | null
    }
  } | null
  department: {
    id: number
    name: string
    headId: string | null
    parentId: number | null
    parent: { id: number; name: string; headId: string | null } | null
  }
  createdBy: { id: string; username: string; nickname: string }
  createdUser: { id: string; username: string; nickname: string; email: string } | null
  reportsToUser: { id: string; username: string; nickname: string } | null
  approvals: HiringDispatchApproval[]
  onboarding: {
    id: number
    otpCode: string
    otpExpiresAt: string
    completedAt: string | null
  } | null
}

export interface HiringDispatchListItem {
  id: number
  applicationId: number | null
  candidateName: string
  candidateEmail: string
  jobTitle: string
  jobGrade: JobGrade
  employmentType: EmploymentType
  departmentId: number
  monthlySalary: string
  startDate: string
  targetRole: string
  targetFrontOfficeRole: string | null
  targetCoachingRole: string | null
  status: HiringDispatchStatus
  createdById: string
  createdAt: string
  updatedAt: string

  application: { id: number; applicantName: string; email: string } | null
  department: { id: number; name: string; headId: string | null }
  createdBy: { id: number; username: string; nickname: string }
}

export interface CreateHiringDispatchPayload {
  applicationId?: number
  candidateName: string
  candidateEmail: string
  jobTitle: string
  jobGrade: JobGrade
  employmentType: EmploymentType
  departmentId: number
  reportsToUserId?: string
  monthlySalary: number
  startDate: string
  targetRole: string
  targetFrontOfficeRole?: string
  targetCoachingRole?: string
  permissionNotes?: string
  // Application-free dispatches carry their own requiredDocuments (#372).
  // Application-anchored dispatches ignore this in favor of posting-level list.
  requiredDocuments?: string[]
}

export interface BudgetReverifyPayload {
  toOverride?: boolean
  offerMismatchOverride?: boolean
}

export const STATUS_LABEL: Record<HiringDispatchStatus, string> = {
  CREATED: '재무 재검증 대기',
  BUDGET_REVERIFIED: '임원 승인 대기',
  DISPATCH_APPROVED: 'HR 실행 대기',
  DISPATCHED: '발령 완료 (온보딩 진행)',
  ONBOARDING: '온보딩 진행',
  COMPLETED: '온보딩 완료',
  REJECTED: '반려',
  CANCELLED: '취소',
}

export const STATUS_STYLE: Record<HiringDispatchStatus, string> = {
  CREATED: 'bg-blue-100 text-blue-800 border-blue-200',
  BUDGET_REVERIFIED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  DISPATCH_APPROVED: 'bg-violet-100 text-violet-800 border-violet-200',
  DISPATCHED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  ONBOARDING: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
}

export const JOB_GRADE_LABEL: Record<JobGrade, string> = {
  INTERN: '인턴',
  JUNIOR: '주니어',
  ASSOCIATE: '어소시에이트',
  MANAGER: '매니저',
  DIRECTOR: '디렉터',
  EXECUTIVE: '임원',
}

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: '정규직',
  PART_TIME: '파트타임',
  CONTRACT: '계약직',
  INTERN: '인턴',
  ADVISOR: '자문',
}

export const STAGE_LABEL: Record<HiringDispatchStage, string> = {
  BUDGET_REVIEW: '재무 재검증',
  DISPATCH_APPROVAL: '임원 승인',
  EXECUTION: 'HR 실행',
}

/**
 * Target role choices for the create form. Kept narrow — INSTANCE mgr / staff
 * roles that make sense as post-dispatch destinations. ADMIN/SUPER_ADMIN etc.
 * are gated at the backend and not offered here.
 */
export const TARGET_ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'FRONT_OFFICE', label: 'Front Office' },
  { value: 'COACHING_STAFF', label: 'Coaching Staff' },
  { value: 'GM', label: 'GM' },
  { value: 'ADMIN', label: 'Admin' },
]
