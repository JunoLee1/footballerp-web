export type AssetRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'LEADER_APPROVED'
  | 'LEADER_REJECTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'FULFILLED'

export type AssetRequestType = 'SOFTWARE' | 'HARDWARE'

export type AssetRequestApprovalStage = 'LEADER' | 'DEPT_HEAD'
export type AssetRequestApprovalAction = 'APPROVED' | 'REJECTED'

/** Filter for GET /asset-requests (backend switch). */
export type AssetRequestFilter =
  | 'me'
  | 'pending-leader'
  | 'pending-dept-head'
  | 'all'

/** Approval-history row nested under a full AssetRequest. */
export interface AssetRequestApproval {
  id: number
  stage: AssetRequestApprovalStage
  action: AssetRequestApprovalAction
  reviewerId: string
  reason: string | null
  createdAt: string
  reviewer: { id: number; username: string; nickname: string }
}

/**
 * Full AssetRequest as returned by /:id (detailInclude on the server).
 * List endpoints return a subset — see AssetRequestListItem.
 */
export interface AssetRequest {
  id: number
  requesterId: string
  departmentId: number
  type: AssetRequestType
  status: AssetRequestStatus

  // Hybrid payload — exactly one of the three per backend validation.
  equipmentItemId: number | null
  softwareLicenseId: string | null
  customName: string | null
  customDescription: string | null

  expenseCategoryId: number
  expectedAmount: number
  neededBy: string | null
  justification: string

  operatingExpenseId: number | null

  // #373 자동 프로비저닝 — HiringDispatch.dispatch() 성공 후 부서 default kit
  // 로부터 자동 생성된 draft 여부와 원본 dispatch 링크. DRAFT 상태에서 배지 표시.
  isAutoProvisioned: boolean
  provisionedFromDispatchId: number | null

  createdAt: string
  updatedAt: string

  requester: { id: number; username: string; nickname: string }
  department: {
    id: number
    name: string
    headId: string | null
    parent: { id: number; name: string; headId: string | null } | null
  }
  expenseCategory: { id: number; code: string; label: string }
  equipmentItem: { id: string; name: string; category: string } | null
  softwareLicense: { id: string; name: string; vendor: string } | null
  operatingExpense: {
    id: number
    status: string
    amount: number
    budgetLineId: number | null
  } | null
  approvals: AssetRequestApproval[]
}

/**
 * List endpoint payload (listInclude on the server). Relations are lighter.
 * Kept structurally compatible with `AssetRequest` so a list row can be
 * rendered without a re-fetch — nullable fields default to null.
 */
export interface AssetRequestListItem {
  id: number
  requesterId: string
  departmentId: number
  type: AssetRequestType
  status: AssetRequestStatus

  equipmentItemId: number | null
  softwareLicenseId: string | null
  customName: string | null
  customDescription: string | null

  expenseCategoryId: number
  expectedAmount: number
  neededBy: string | null
  justification: string

  operatingExpenseId: number | null

  // #373 자동 프로비저닝 — 리스트 뷰에서도 배지 렌더 위해 노출.
  isAutoProvisioned: boolean
  provisionedFromDispatchId: number | null

  createdAt: string
  updatedAt: string

  requester: { id: number; username: string; nickname: string }
  department: { id: number; name: string; headId: string | null; parentId: number | null }
  expenseCategory: { id: number; code: string; label: string }
}

export interface CreateAssetRequestPayload {
  type: AssetRequestType
  equipmentItemId?: number
  softwareLicenseId?: string
  customName?: string
  customDescription?: string
  expenseCategoryId: number
  expectedAmount: number
  neededBy?: string
  justification: string
}

export const STATUS_LABEL: Record<AssetRequestStatus, string> = {
  DRAFT: '임시저장',
  SUBMITTED: '팀장 결재 대기',
  LEADER_APPROVED: '부서장 결재 대기',
  LEADER_REJECTED: '팀장 반려',
  APPROVED: '승인 (지급 대기)',
  REJECTED: '부서장 반려',
  CANCELLED: '취소됨',
  FULFILLED: '지급 완료',
}

/**
 * Tailwind classes for a Badge wrapper. Kept as string classes (not Badge
 * variant) so a single Badge component can render any status with the same
 * styling contract used elsewhere (equipment, injury).
 */
export const STATUS_STYLE: Record<AssetRequestStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
  SUBMITTED: 'bg-blue-100 text-blue-800 border-blue-200',
  LEADER_APPROVED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  LEADER_REJECTED: 'bg-orange-100 text-orange-800 border-orange-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
  FULFILLED: 'bg-violet-100 text-violet-800 border-violet-200',
}

export const TYPE_LABEL: Record<AssetRequestType, string> = {
  SOFTWARE: '소프트웨어',
  HARDWARE: '하드웨어',
}
