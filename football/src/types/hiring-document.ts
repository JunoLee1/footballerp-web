/**
 * FE types mirror the Prisma shape of HiringDocument. All timestamps are
 * strings (JSON transport). See `apps/api/src/hiring-document/` for the
 * BE source of truth.
 */

export type HiringDocReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface HiringDocument {
  id: number
  applicationId: number | null
  hiringDispatchId: number | null
  docType: string
  fileUrl: string
  fileName: string | null
  fileSize: number | null
  status: HiringDocReviewStatus
  uploadedById: string
  uploadedAt: string
  reviewedById: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
  updatedAt: string
  uploadedBy: { id: number; username: string; nickname: string }
  reviewedBy: { id: number; username: string; nickname: string } | null
}

/**
 * FE-side view of a docType: what's required, what's been uploaded (latest),
 * and derived state used by badges/buttons. Extra (non-required) uploads
 * come through as `isRequired = false`.
 */
export interface DocumentSlot {
  docType: string
  isRequired: boolean
  latest: HiringDocument | null
}

/**
 * Localized labels for status pills. Keep in sync with the backend enum.
 */
export const DOC_STATUS_LABEL: Record<HiringDocReviewStatus, string> = {
  PENDING: '검토 대기',
  APPROVED: '승인',
  REJECTED: '반려',
}

export const DOC_STATUS_COLOR: Record<HiringDocReviewStatus, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
}

/**
 * "기본 서류 추가" template. Free-form but ships with a sensible default
 * set — HR overrides per posting/dispatch through the RequiredDocumentsInput.
 */
export const DEFAULT_REQUIRED_DOCS: string[] = [
  '신분증',
  '통장사본',
  '최종학력증명',
]
