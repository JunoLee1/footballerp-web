export type PlanStatus = 'DRAFT' | 'REVIEWING' | 'APPROVED' | 'REJECTED'
export type ReviewStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED'
export type PlanTemplateType = 'GENERAL' | 'HR' | 'MARKETING' | 'GOODS' | 'SQUAD' | 'MEDICAL' | 'IT'
export type ApproverLevel = 'HEAD' | 'GM' | 'ADMIN'

export interface PlanReport {
  id: number
  title: string
  purpose: string
  departmentId: number
  department: { id: number; name: string; headId: string | null }
  startDate: string
  endDate: string
  budget: number
  expectedEffect: string
  risks: string
  attachments: string[]
  resultDueDate: string
  templateType: PlanTemplateType
  extraFields: Record<string, unknown> | null
  hasNewStaff: boolean
  hasContract: boolean
  hasExternalLease: boolean
  hasPersonalInfo: boolean
  isNewBusiness: boolean
  status: PlanStatus
  requiredApproverLevel: ApproverLevel | null
  rejectionReason: string | null
  resultContent: string | null
  resultSubmittedAt: string | null
  submittedAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  vaultPath: string | null
  createdById: string
  createdBy: { id: number; username: string }
  approvedById: string | null
  approvedBy: { id: number; username: string } | null
  reviews: PlanReview[]
  createdAt: string
  updatedAt: string
}

export interface PlanReview {
  id: number
  planId: number
  reviewerDeptId: number
  reviewerDept: { id: number; name: string }
  status: ReviewStatus
  comment: string | null
  confirmedById: string | null
  confirmedBy: { id: number; username: string } | null
  confirmedAt: string | null
  createdAt: string
}

export const TEMPLATE_TYPE_LABELS: Record<PlanTemplateType, string> = {
  GENERAL: '일반',
  HR: 'HR',
  MARKETING: '마케팅',
  GOODS: '굿즈',
  SQUAD: '선수단',
  MEDICAL: '의료',
  IT: 'IT',
}

export const EXTRA_FIELDS_CONFIG: Record<PlanTemplateType, Array<{ key: string; label: string; type: 'text' | 'number' | 'date' }>> = {
  GENERAL: [],
  HR: [
    { key: 'jobTitle', label: '직무', type: 'text' },
    { key: 'headcount', label: '인원', type: 'number' },
    { key: 'salary', label: '급여', type: 'number' },
    { key: 'employmentType', label: '고용형태', type: 'text' },
    { key: 'hireDate', label: '채용일', type: 'date' },
  ],
  MARKETING: [
    { key: 'campaign', label: '캠페인', type: 'text' },
    { key: 'target', label: '타깃', type: 'text' },
    { key: 'channels', label: '홍보채널', type: 'text' },
    { key: 'kpi', label: 'KPI', type: 'text' },
  ],
  GOODS: [
    { key: 'sku', label: 'SKU', type: 'text' },
    { key: 'quantity', label: '제작수량', type: 'number' },
    { key: 'unitCost', label: '단가', type: 'number' },
    { key: 'salePrice', label: '판매가', type: 'number' },
    { key: 'stock', label: '재고', type: 'number' },
  ],
  SQUAD: [
    { key: 'contractPeriod', label: '계약기간', type: 'text' },
    { key: 'salary', label: '연봉', type: 'number' },
    { key: 'transferFee', label: '이적료', type: 'number' },
    { key: 'agent', label: '에이전트', type: 'text' },
  ],
  MEDICAL: [
    { key: 'injuryRisk', label: '부상위험', type: 'text' },
    { key: 'treatmentPlan', label: '치료계획', type: 'text' },
    { key: 'dataAccess', label: '개인정보 접근권한', type: 'text' },
  ],
  IT: [
    { key: 'scope', label: '시스템 범위', type: 'text' },
    { key: 'securityLevel', label: '보안등급', type: 'text' },
    { key: 'linkedSystems', label: '연계시스템', type: 'text' },
    { key: 'maintenance', label: '유지보수', type: 'text' },
  ],
}
