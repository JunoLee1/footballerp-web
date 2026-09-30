/**
 * Frontend types mirroring `apps/api/src/employee-contract` (#371).
 *
 * State machine: DRAFT → ISSUED → SIGNED / CANCELLED. Re-issue after
 * CANCELLED is a *new* row (append-only) — the FE keys "current" off the
 * newest non-CANCELLED record via findLatestActiveByDispatch (server-side),
 * so a full history endpoint always includes CANCELLED rows too.
 */

export type EmployeeContractStatus = 'DRAFT' | 'ISSUED' | 'SIGNED' | 'CANCELLED'

export interface UserRef {
  id: string
  username: string
  nickname: string
}

export interface EmployeeContract {
  id: number
  hiringDispatchId: number
  status: EmployeeContractStatus
  fileUrl: string | null
  fileName: string | null
  signedFileUrl: string | null
  signedFileName: string | null
  createdById: string
  issuedById: string | null
  issuedAt: string | null
  signedAt: string | null
  signedConfirmedById: string | null
  signedConfirmedAt: string | null
  cancelledById: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
  updatedAt: string

  createdBy: UserRef
  issuedBy: UserRef | null
  signedConfirmedBy: UserRef | null
  cancelledBy: UserRef | null
}

export const EMPLOYEE_CONTRACT_STATUS_LABEL: Record<EmployeeContractStatus, string> = {
  DRAFT: '초안',
  ISSUED: '발행 (서명 대기)',
  SIGNED: '서명 완료',
  CANCELLED: '취소',
}

export const EMPLOYEE_CONTRACT_STATUS_STYLE: Record<EmployeeContractStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  ISSUED: 'bg-amber-100 text-amber-800 border-amber-200',
  SIGNED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-200',
}
