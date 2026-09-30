export type ReportType = 'PERFORMANCE' | 'MEDICAL' | 'TRAINING' | 'HR' | 'FINANCIAL' | 'ASSET'
export type ReportStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEWING' | 'FIRST_APPROVED' | 'SECOND_APPROVED' | 'APPROVED' | 'REJECTED'
export type ReviewStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED'

export interface ReportUser {
  id: number
  nickname: string
  role: string
  coachingRole: string | null
  frontOfficeRole: string | null
}

export interface ReportReview {
  id: number
  reportId: number
  reviewerDeptId: number
  status: ReviewStatus
  comment: string | null
  confirmedById: string | null
  confirmedBy: ReportUser | null
  confirmedAt: string | null
  createdAt: string
  reviewerDept: {
    id: number
    name: string
    category: string | null
  }
}

export interface Report {
  id: number
  type: ReportType
  status: ReportStatus
  title: string
  content: string
  fileUrl: string | null
  fileName: string | null
  rejectionReason: string | null
  authorId: string
  author: ReportUser
  reviewerId: string | null
  reviewer: ReportUser | null
  firstReviewerId: string | null
  firstReviewer: ReportUser | null
  firstReviewedAt: string | null
  secondReviewerId: string | null
  secondReviewer: ReportUser | null
  secondReviewedAt: string | null
  departmentId: number | null
  department: { id: number; name: string; category: string | null } | null
  reviews: ReportReview[]
  createdAt: string
  updatedAt: string
  submittedAt: string | null
  reviewedAt: string | null
}

export interface ReviewRuleSet {
  id: number
  reportType: ReportType
  reviewerCategory: string
  createdAt: string
}

export interface CreateReportDto {
  type: ReportType
  title: string
  content: string
  file?: File
  departmentId?: number
}

export interface UpdateReportDto {
  title?: string
  content?: string
  file?: File
}

export const REPORT_TYPE_LABEL: Record<ReportType, string> = {
  PERFORMANCE: 'Performance',
  MEDICAL: 'Medical',
  TRAINING: 'Training',
  HR: 'HR',
  FINANCIAL: 'Financial',
  ASSET: 'Asset',
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: '제출됨',
  REVIEWING: '검토 중',
  FIRST_APPROVED: '1차 승인',
  SECOND_APPROVED: '2차 승인',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}

export const REPORT_STATUS_STYLE: Record<ReportStatus, string> = {
  DRAFT: 'border-border text-muted-foreground',
  SUBMITTED: 'border-blue-300 text-blue-700 bg-blue-50',
  REVIEWING: 'border-yellow-300 text-yellow-700 bg-yellow-50',
  FIRST_APPROVED: 'border-indigo-300 text-indigo-700 bg-indigo-50',
  SECOND_APPROVED: 'border-violet-300 text-violet-700 bg-violet-50',
  APPROVED: 'border-green-300 text-green-700 bg-green-50',
  REJECTED: 'border-red-300 text-red-700 bg-red-50',
}

export const REPORT_TYPE_STYLE: Record<ReportType, string> = {
  PERFORMANCE: 'border-orange-300 text-orange-700 bg-orange-50',
  MEDICAL: 'border-teal-300 text-teal-700 bg-teal-50',
  TRAINING: 'border-blue-300 text-blue-700 bg-blue-50',
  HR: 'border-purple-300 text-purple-700 bg-purple-50',
  FINANCIAL: 'border-green-300 text-green-700 bg-green-50',
  ASSET: 'border-amber-300 text-amber-700 bg-amber-50',
}

export const REVIEW_STATUS_STYLE: Record<ReviewStatus, string> = {
  PENDING: 'border-yellow-300 text-yellow-700 bg-yellow-50',
  CONFIRMED: 'border-green-300 text-green-700 bg-green-50',
  REJECTED: 'border-red-300 text-red-700 bg-red-50',
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: '검토 대기',
  CONFIRMED: '승인',
  REJECTED: '반려',
}
