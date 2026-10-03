import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useHiringDispatches } from '@/hooks/useHiringDispatches'
import { hiringDispatchApi } from '@/services/hiring-dispatch.service'
import {
  EMPLOYMENT_TYPE_LABEL,
  JOB_GRADE_LABEL,
  STAGE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  type BudgetReverifyPayload,
  type HiringDispatch,
  type HiringDispatchFilter,
  type HiringDispatchListItem,
} from '@/types/hiring-dispatch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'
import { EmployeeContractSection } from '@/components/employee-contract/EmployeeContractSection'
import type { EmployeeContract } from '@/types/employee-contract'

function fmtWon(n: string | number) {
  const num = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(num)) return String(n)
  return `${num.toLocaleString('ko-KR')}원`
}

/** Which stage the current tab represents — drives approve vs reject verb. */
type Stage = 'BUDGET' | 'DISPATCH' | 'EXECUTION'

const STAGE_META: Record<
  Stage,
  {
    filter: Extract<
      HiringDispatchFilter,
      'pending-budget' | 'pending-dispatch' | 'pending-execution'
    >
    title: string
    approveLabel: string
    approveIcon: typeof CheckCircle2
    approveTooltip: string
  }
> = {
  BUDGET: {
    filter: 'pending-budget',
    title: '재무 재검증',
    approveLabel: '재검증 승인',
    approveIcon: ShieldCheck,
    approveTooltip: 'TO/오퍼 조건을 확인 후 임원 승인 단계로 넘깁니다.',
  },
  DISPATCH: {
    filter: 'pending-dispatch',
    title: '임원 승인',
    approveLabel: '승인',
    approveIcon: CheckCircle2,
    approveTooltip: 'HR 실행 단계로 넘깁니다.',
  },
  EXECUTION: {
    filter: 'pending-execution',
    title: 'HR 실행',
    approveLabel: '발령 실행',
    approveIcon: CheckCircle2,
    approveTooltip:
      '계정 생성 + 부서 배정 + 직원기록 생성 + 온보딩 시작을 한 트랜잭션으로 실행합니다.',
  },
}

function messageForCode(code: string, fallback: string): string {
  // #371 contract gate — same shape as MISSING_APPROVED_DOCS from #372.
  if (code.startsWith('CONTRACT_NOT_SIGNED')) {
    const parts = code.split(':')
    const status = parts[1] ?? ''
    if (status === 'DRAFT') {
      return '계약서가 아직 발행되지 않았습니다. 발행 후 서명을 완료해주세요.'
    }
    if (status === 'ISSUED') {
      return '계약서가 아직 서명되지 않았습니다. 서명본을 업로드해주세요.'
    }
    return '계약서 서명이 완료되지 않았습니다.'
  }
  switch (code) {
    case 'INVALID_STATUS':
      return '이미 다른 결재가 진행된 요청입니다. 새로고침 후 다시 시도해주세요.'
    case 'SELF_APPROVAL_FORBIDDEN':
      return '본인이 생성한 발령은 결재할 수 없습니다.'
    case 'REASON_REQUIRED':
      return '반려 사유는 필수입니다.'
    case 'NOT_FINANCE_MANAGER':
      return '재무 매니저 권한이 없습니다.'
    case 'NOT_EXECUTIVE':
      return '임원 승인 권한이 없습니다.'
    case 'NOT_HR_MANAGER':
      return 'HR 매니저 권한이 없습니다.'
    case 'EMAIL_ALREADY_IN_USE':
      return '이미 사용 중인 이메일입니다. 계정 생성이 실패했습니다.'
    case 'TO_EXCEEDED':
      return '채용 계획(TO)을 초과합니다. 필요 시 "TO 초과 강제 승인"에 체크 후 재시도해주세요.'
    case 'OFFER_MISMATCH':
      return '오퍼 조건과 발령 조건이 다릅니다. 필요 시 "오퍼 불일치 강제 승인"에 체크 후 재시도해주세요.'
    case 'CONTRACT_NOT_ISSUED':
      return '발령을 실행하려면 먼저 근로계약서를 발행하고 서명을 완료해야 합니다.'
    case 'NOT_FOUND':
      return '요청을 찾을 수 없습니다.'
    case 'FORBIDDEN':
      return '권한이 없습니다.'
    default:
      return fallback
  }
}

interface ApprovalListProps {
  stage: Stage
}

function ApprovalList({ stage }: ApprovalListProps) {
  const meta = STAGE_META[stage]
  const { dispatches, loading, reload } = useHiringDispatches(meta.filter)

  const [detailId, setDetailId] = useState<number | null>(null)
  const [detail, setDetail] = useState<HiringDispatch | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Reject flow — shared across stages, distinguished by the row.stage snapshot.
  const [rejectingId, setRejectingId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  // Budget-reverify override flags. Only the BUDGET stage uses them; the state
  // lives here so the confirmation dialog can gate on them cleanly.
  const [reverifyId, setReverifyId] = useState<number | null>(null)
  const [reverifyOverrides, setReverifyOverrides] = useState<BudgetReverifyPayload>({})

  const [rowActingId, setRowActingId] = useState<number | null>(null)

  const navigate = useNavigate()

  // EXECUTION-stage only: latest active EmployeeContract for the detail row.
  // Drives the disabled state on the "발령 실행" button so HR sees why they
  // can't ship — the server-side gate (`assertContractSigned`) is the source
  // of truth, this is a UX pre-check.
  const [currentContract, setCurrentContract] = useState<EmployeeContract | null>(null)

  const openDetail = async (id: number) => {
    setDetailId(id)
    setDetail(null)
    setCurrentContract(null)
    setDetailLoading(true)
    try {
      setDetail(await hiringDispatchApi.get(id))
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, code || '상세 조회에 실패했습니다.'))
    } finally {
      setDetailLoading(false)
    }
  }

  /**
   * Runs the stage-specific approve. For BUDGET we route through the reverify
   * dialog (needs override checkboxes); for DISPATCH/EXECUTION we call directly.
   */
  const approveOne = async (id: number, overrides?: BudgetReverifyPayload) => {
    setRowActingId(id)
    try {
      if (stage === 'BUDGET') {
        await hiringDispatchApi.budgetReverify(id, overrides ?? {})
        toast.success('재무 재검증이 완료됐습니다. 임원 승인 대기로 넘어갔습니다.')
      } else if (stage === 'DISPATCH') {
        await hiringDispatchApi.dispatchApprove(id)
        toast.success('임원 승인 완료. HR 실행 대기로 넘어갔습니다.')
      } else {
        await hiringDispatchApi.dispatch(id)
        toast.success(
          '발령이 실행됐습니다. 계정과 직원기록이 생성되어 온보딩이 시작됩니다.',
        )
      }
      await reload()
      if (detailId === id) {
        setDetailId(null)
        setDetail(null)
      }
      if (reverifyId === id) {
        setReverifyId(null)
        setReverifyOverrides({})
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, code || '처리에 실패했습니다.'))
    } finally {
      setRowActingId(null)
    }
  }

  const openReject = (id: number) => {
    setRejectingId(id)
    setRejectReason('')
  }

  const submitReject = async () => {
    if (!rejectingId) return
    const reason = rejectReason.trim()
    if (!reason) {
      toast.error('반려 사유를 입력해주세요.')
      return
    }
    setRowActingId(rejectingId)
    try {
      if (stage === 'BUDGET') {
        await hiringDispatchApi.budgetReject(rejectingId, reason)
      } else if (stage === 'DISPATCH') {
        await hiringDispatchApi.dispatchReject(rejectingId, reason)
      } else {
        // EXECUTION stage doesn't have a dedicated reject — HR should cancel
        // the request from the main page instead. Guarded at the UI (button
        // hidden) but we throw here as a safety net.
        toast.error('실행 단계에서는 반려 대신 요청 취소를 사용해주세요.')
        return
      }
      toast.success('반려됐습니다.')
      setRejectingId(null)
      setRejectReason('')
      await reload()
      if (detailId === rejectingId) {
        setDetailId(null)
        setDetail(null)
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : ''
      toast.error(messageForCode(code, code || '반려에 실패했습니다.'))
    } finally {
      setRowActingId(null)
    }
  }

  const openApprove = (id: number) => {
    if (stage === 'BUDGET') {
      setReverifyId(id)
      setReverifyOverrides({})
    } else {
      void approveOne(id)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (dispatches.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
        결재 대기 중인 발령 요청이 없습니다.
      </div>
    )
  }

  const rows: HiringDispatchListItem[] = [...dispatches].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  )

  const ApproveIcon = meta.approveIcon

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>생성일</TableHead>
            <TableHead>후보자</TableHead>
            <TableHead>직무</TableHead>
            <TableHead>직급</TableHead>
            <TableHead>부서</TableHead>
            <TableHead className="text-right">월급여</TableHead>
            <TableHead>요청자</TableHead>
            <TableHead className="w-48 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const acting = rowActingId === r.id
            return (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => void openDetail(r.id)}
              >
                <TableCell className="tabular-nums text-sm">
                  {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                </TableCell>
                <TableCell className="text-sm">{r.candidateName}</TableCell>
                <TableCell className="text-sm">{r.jobTitle}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {JOB_GRADE_LABEL[r.jobGrade]}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.department.name}
                </TableCell>
                <TableCell className="tabular-nums font-medium text-sm text-right">
                  {fmtWon(r.monthlySalary)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {r.createdBy.nickname}
                </TableCell>
                <TableCell
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      disabled={acting}
                      onClick={() => openApprove(r.id)}
                      title={meta.approveTooltip}
                    >
                      <ApproveIcon className="h-3 w-3 mr-1" />
                      {meta.approveLabel}
                    </Button>
                    {stage !== 'EXECUTION' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-red-700 hover:bg-red-50 hover:text-red-800"
                        disabled={acting}
                        onClick={() => openReject(r.id)}
                      >
                        <XCircle className="h-3 w-3 mr-1" />반려
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Budget-reverify override dialog. */}
      <Dialog
        open={reverifyId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setReverifyId(null)
            setReverifyOverrides({})
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>재무 재검증</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p className="text-muted-foreground">
              시스템이 TO 초과와 오퍼 불일치를 자동 감지합니다. 초과가 감지되면
              해당 강제 승인 체크박스를 활성화한 뒤 다시 실행해주세요. 체크 없이
              실행하면 서버가 <code>TO_EXCEEDED</code> 또는{' '}
              <code>OFFER_MISMATCH</code>로 거절합니다.
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!!reverifyOverrides.toOverride}
                onCheckedChange={(v) =>
                  setReverifyOverrides((p) => ({ ...p, toOverride: Boolean(v) }))
                }
              />
              <span>TO 초과 강제 승인</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={!!reverifyOverrides.offerMismatchOverride}
                onCheckedChange={(v) =>
                  setReverifyOverrides((p) => ({
                    ...p,
                    offerMismatchOverride: Boolean(v),
                  }))
                }
              />
              <span>오퍼 조건 불일치 강제 승인</span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReverifyId(null)
                setReverifyOverrides({})
              }}
              disabled={rowActingId !== null}
            >
              닫기
            </Button>
            <Button
              onClick={() => {
                if (reverifyId != null) void approveOne(reverifyId, reverifyOverrides)
              }}
              disabled={rowActingId !== null}
            >
              재검증 실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog. */}
      <Dialog
        open={rejectingId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRejectingId(null)
            setRejectReason('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>발령 요청 반려</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              반려 사유를 입력해주세요. 요청자에게 알림으로 전달됩니다.
            </p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="예: 채용 계획 초과, 재검토 필요"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectingId(null)
                setRejectReason('')
              }}
              disabled={rowActingId !== null}
            >
              닫기
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitReject()}
              disabled={rowActingId !== null}
            >
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog. */}
      <Dialog
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDetailId(null)
            setDetail(null)
            setCurrentContract(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>발령 요청 #{detailId ?? ''}</DialogTitle>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-3 py-2 text-sm max-h-[70vh] overflow-y-auto pr-1">
              <div className="flex items-center gap-2">
                <Badge className={STATUS_STYLE[detail.status]}>
                  {STATUS_LABEL[detail.status]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {EMPLOYMENT_TYPE_LABEL[detail.employmentType]} ·{' '}
                  {JOB_GRADE_LABEL[detail.jobGrade]}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span className="text-muted-foreground">후보자</span>
                <span className="col-span-2">
                  {detail.candidateName} ({detail.candidateEmail})
                </span>

                <span className="text-muted-foreground">직무</span>
                <span className="col-span-2">{detail.jobTitle}</span>

                <span className="text-muted-foreground">부서</span>
                <span className="col-span-2">
                  {detail.department.parent
                    ? `${detail.department.parent.name} > `
                    : ''}
                  {detail.department.name}
                </span>

                <span className="text-muted-foreground">월급여</span>
                <span className="col-span-2 tabular-nums font-medium">
                  {fmtWon(detail.monthlySalary)}
                </span>

                <span className="text-muted-foreground">입사일</span>
                <span className="col-span-2">
                  {new Date(detail.startDate).toLocaleDateString('ko-KR')}
                </span>

                <span className="text-muted-foreground">대상 롤</span>
                <span className="col-span-2">
                  {detail.targetRole}
                  {detail.targetFrontOfficeRole
                    ? ` / ${detail.targetFrontOfficeRole}`
                    : ''}
                  {detail.targetCoachingRole
                    ? ` / ${detail.targetCoachingRole}`
                    : ''}
                </span>

                <span className="text-muted-foreground">요청자</span>
                <span className="col-span-2">{detail.createdBy.nickname}</span>

                {detail.application && (
                  <>
                    <span className="text-muted-foreground">연동 지원서</span>
                    <span className="col-span-2">
                      #{detail.application.id} · {detail.application.applicantName}
                      {detail.application.posting && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({detail.application.posting.title})
                        </span>
                      )}
                    </span>
                  </>
                )}

                {detail.permissionNotes && (
                  <>
                    <span className="text-muted-foreground">추가 권한 메모</span>
                    <span className="col-span-2 whitespace-pre-wrap">
                      {detail.permissionNotes}
                    </span>
                  </>
                )}
              </div>

              {detail.approvals.length > 0 && (
                <div className="border-t pt-2">
                  <p className="font-medium mb-1.5">결재 이력</p>
                  <ul className="space-y-1">
                    {detail.approvals.map((a) => (
                      <li key={a.id} className="text-xs">
                        <span className="text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString('ko-KR')} ·{' '}
                          {STAGE_LABEL[a.stage]} · {a.reviewer.nickname}
                        </span>
                        <span
                          className={
                            a.action === 'APPROVED'
                              ? 'ml-1 text-emerald-700'
                              : 'ml-1 text-red-700'
                          }
                        >
                          {a.action === 'APPROVED' ? '승인' : '반려'}
                        </span>
                        {a.reason && (
                          <span className="ml-1 text-muted-foreground">
                            · {a.reason}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* EmployeeContract 관리 — EXECUTION 단계에서만 노출. 다른
                  단계에서는 계약이 아직 필요하지 않아 잡음이 된다. */}
              {stage === 'EXECUTION' && (
                <div className="border-t pt-3">
                  <EmployeeContractSection
                    dispatchId={detail.id}
                    onCurrentChange={setCurrentContract}
                  />
                </div>
              )}

              <div className="border-t pt-2 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    navigate(`/hiring/dispatches/${detail.id}/documents`)
                  }
                >
                  서류 관리
                </Button>
                {stage !== 'EXECUTION' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openReject(detail.id)}
                    disabled={rowActingId === detail.id}
                  >
                    <XCircle className="h-3 w-3 mr-1" />반려
                  </Button>
                )}
                {/* EXECUTION 게이트 pre-check: server-side gates
                    (`assertHiringDocsGate` #372 + `assertContractSigned` #371)
                    are authoritative, but pre-checking here prevents obvious
                    round-trips + surfaces the reason inline. */}
                {stage === 'EXECUTION' && currentContract?.status !== 'SIGNED' ? (
                  <Button
                    size="sm"
                    disabled
                    title={
                      currentContract == null
                        ? '먼저 근로계약서를 발행하고 서명을 완료해주세요.'
                        : `계약 상태: ${currentContract.status} — 서명 완료(SIGNED) 후 실행 가능합니다.`
                    }
                  >
                    <ApproveIcon className="h-3 w-3 mr-1" />
                    {meta.approveLabel}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => openApprove(detail.id)}
                    disabled={rowActingId === detail.id}
                    title={
                      stage === 'EXECUTION'
                        ? '필수 서류가 모두 승인되지 않으면 실행 시 400 오류가 발생합니다.'
                        : undefined
                    }
                  >
                    <ApproveIcon className="h-3 w-3 mr-1" />
                    {meta.approveLabel}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function HiringDispatchApprovalPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4 shrink-0">
        <h1 className="text-lg font-semibold tracking-tight">발령 결재함</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          채용 발령의 3단계 결재를 처리합니다. 백엔드가 권한을 검증하므로 본인이
          담당하는 단계만 실제로 결재할 수 있습니다.
        </p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="budget">
          <TabsList className="mb-4">
            <TabsTrigger value="budget">재무 재검증</TabsTrigger>
            <TabsTrigger value="dispatch">임원 승인</TabsTrigger>
            <TabsTrigger value="execution">HR 실행</TabsTrigger>
          </TabsList>
          <TabsContent value="budget">
            <ApprovalList stage="BUDGET" />
          </TabsContent>
          <TabsContent value="dispatch">
            <ApprovalList stage="DISPATCH" />
          </TabsContent>
          <TabsContent value="execution">
            <ApprovalList stage="EXECUTION" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
