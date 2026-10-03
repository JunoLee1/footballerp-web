import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useExpenseCategories } from '@/hooks/useExpenseCategories'
import {
  useBudgetPlan,
  useExecuteKnapsack,
  useFinalize,
  useOpenReview,
  usePendingOverrideLogs,
  usePlanRequests,
  useRePlan,
  useReviewOverride,
  type BudgetOverrideLogDto,
  type BudgetPlanRequestDto,
  type BudgetPlanRequestLineDto,
  type BudgetPlanStatus,
} from '@/services/budget-plan.service'
import { usePendingMinimums } from '@/services/mandatory-minimum.service'
import { MandatoryMinimumProposalDialog } from './MandatoryMinimumProposalDialog'
import { MandatoryMinimumHistoryDialog } from './MandatoryMinimumHistoryDialog'
import type { CategoryScope } from '@/types/expense-category'

// ============================================================================
// Widened planStatus (issue #429 spec)
// ----------------------------------------------------------------------------
// budget-plan.service.ts 는 UI 소비 관점에서 `DRAFT | AWAITING_REVIEW |
// KNAPSACK_EXECUTED | AWAITING_GM_APPROVAL | FINALIZED` 5 개만 export 하지만,
// backend Prisma enum `BudgetPlanStatus` 는 `CAPACITY_FAILED` 와 `RE_PLANNING`
// 도 갖고 있다. FM 리뷰 화면에서는 두 상태도 UI 에 도달할 수 있으므로 (재편성
// 워크플로우 중, 이의 신청 처리 중) 부모가 그 값을 넘기더라도 정상 컴파일되도록
// 여기서만 확장 union 을 정의해 둔다. 액션 활성 규칙은 여전히 spec 매트릭스에
// 명시된 4 상태 (`DRAFT` / `AWAITING_REVIEW` / `KNAPSACK_EXECUTED` /
// `FINALIZED`) 로만 열린다.
// ============================================================================
export type FinanceManagerReviewPlanStatus =
  | BudgetPlanStatus
  | 'CAPACITY_FAILED'
  | 'RE_PLANNING'

interface Props {
  seasonId: number
  planStatus: FinanceManagerReviewPlanStatus
}

// ---------------------------------------------------------------------------
// 트리거 라벨 (TriggerMultiSelect 와 동일). 여기서는 chip 표시를 위해 별도로
// 인라인한다. 값이 drift 하면 TriggerMultiSelect.tsx 의 `TRIGGERS` 상수와 함께
// 갱신할 것.
// ---------------------------------------------------------------------------
const TRIGGER_LABEL: Record<string, string> = {
  MULTI_LOCATION: '다중거점 관리',
  DIRECT_BUSINESS: '사업 직접비',
  PUBLIC_UTILITY: '공공요금',
  HOME_MATCH: '홈경기 현장지원',
  WEEKEND_OVERTIME: '주말 야근',
}

const SCOPE_BADGE_LABEL: Record<'TEAM' | 'DEPARTMENT', string> = {
  TEAM: '팀',
  DEPARTMENT: '부서',
}

const SCOPE_BADGE_CLASS: Record<'TEAM' | 'DEPARTMENT', string> = {
  // 팀 = teal, 부서 = amber (CategoryEditor 와 동일)
  TEAM: 'bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950 dark:text-teal-100 dark:border-teal-800',
  DEPARTMENT:
    'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
  DRAFT: '작성 중',
  SUBMITTED: '제출됨',
  PROCESSED: '처리 완료',
}

// ---------------------------------------------------------------------------
// 에러 코드 → 한국어 안내. api.ts 의 `throw new Error(body.code ?? ...)`
// 규약에 따라 mutation onError 는 `Error` 객체를 받고, `.message` 가 곧 서버
// 코드 문자열이다. 매핑에 없으면 원문 그대로 노출.
// ---------------------------------------------------------------------------
const ERROR_MESSAGE: Record<string, string> = {
  INVALID_PLAN_STATUS_TRANSITION:
    '지금은 이 액션을 실행할 수 없습니다 (상태 전이 실패)',
  SELF_APPROVAL_REQUIRES_GM: '본인 신청 확정은 GM 승인이 필요합니다',
  KNAPSACK_CAPACITY_FAILED: '예산 부족 — GM 알림 발송됨',
  // 이의 신청 심사 (override.service.ts)
  OVERRIDE_EXCEEDS_TOTAL_BUDGET: '총 예산 초과 — 승인 불가',
  INVALID_OVERRIDE_STATUS_TRANSITION:
    '이미 심사된 이의 신청입니다 (다시 심사할 수 없음)',
  OVERRIDE_LOG_NOT_FOUND: '이의 신청 기록을 찾을 수 없습니다',
  CATEGORY_PLAN_NOT_FOUND: '해당 카테고리의 편성 계획이 없습니다',
  DECISION_MUST_BE_APPROVED_OR_REJECTED: '승인 또는 반려를 선택해야 합니다',
}

function translateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  return ERROR_MESSAGE[raw] ?? raw ?? '알 수 없는 오류가 발생했습니다'
}

// ---------------------------------------------------------------------------
// 라인 → 트리거 chip 렌더. 없으면 하이픈.
// ---------------------------------------------------------------------------
function TriggerChips({ triggers }: { triggers: readonly string[] }) {
  if (triggers.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {triggers.map((t) => (
        <Badge
          key={t}
          variant="outline"
          className="text-[10px] whitespace-nowrap"
          data-trigger={t}
        >
          {TRIGGER_LABEL[t] ?? t}
        </Badge>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 소유자 표기. issue #445 로 서버가 ownerName (Team.name / Department.name)
// 을 조합해 반환하므로 그대로 소비한다. 서버 lookup 실패 시 서버가 이미
// `팀 #7` / `부서 #3` fallback 을 넣으므로 FE 는 추가 방어를 하지 않는다.
// ---------------------------------------------------------------------------
function ownerDisplayName(req: BudgetPlanRequestDto): string {
  return req.ownerName
}

// ---------------------------------------------------------------------------
// 신청자 표기. issue #445 로 서버가 requestedBy (id/username/email/…) 를
// include 하므로 username 우선, 없으면 email 로 표시한다. `#id` fallback 은
// 서버 응답이 실제로 없을 때만 (테스트 편의) 로 축소한다.
// ---------------------------------------------------------------------------
function requesterDisplayName(req: BudgetPlanRequestDto): string {
  const requestedBy = req.requestedBy
  if (!requestedBy) return `#${req.requestedById}`
  return requestedBy.username ?? requestedBy.email ?? `#${requestedBy.id}`
}

interface OwnerGroup {
  key: string
  scope: 'TEAM' | 'DEPARTMENT'
  ownerId: string
  displayName: string
  requests: BudgetPlanRequestDto[]
}

function groupByOwner(rows: BudgetPlanRequestDto[]): OwnerGroup[] {
  const groups = new Map<string, OwnerGroup>()
  for (const req of rows) {
    const key = `${req.scope}:${req.ownerId}`
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        scope: req.scope,
        ownerId: req.ownerId,
        displayName: ownerDisplayName(req),
        requests: [],
      }
      groups.set(key, g)
    }
    g.requests.push(req)
  }
  // TEAM 이 먼저, 그 안에서 ownerId 오름차순. DEPARTMENT 는 그 다음.
  return Array.from(groups.values()).sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === 'TEAM' ? -1 : 1
    return a.ownerId.localeCompare(b.ownerId)
  })
}

// ---------------------------------------------------------------------------
// 액션 활성 규칙 매트릭스 (spec #429 정확 반영).
// ---------------------------------------------------------------------------
function canOpenReview(status: FinanceManagerReviewPlanStatus): boolean {
  return status === 'DRAFT'
}

function canExecuteKnapsack(
  status: FinanceManagerReviewPlanStatus,
  requestCount: number,
): boolean {
  return status === 'AWAITING_REVIEW' && requestCount > 0
}

function canFinalize(status: FinanceManagerReviewPlanStatus): boolean {
  return status === 'KNAPSACK_EXECUTED'
}

function canRePlan(status: FinanceManagerReviewPlanStatus): boolean {
  return status === 'FINALIZED'
}

// ---------------------------------------------------------------------------
// 자체 신청 감지: 현재 로그인 사용자 id 가 requestedById 로 존재하는 request
// 가 리스트에 있으면 self-approval 경로. `KNAPSACK_EXECUTED` + 확정 시 GM
// 승인이 필요함을 UI 에서 미리 알려준다 (backend 는 자동으로
// AWAITING_GM_APPROVAL 로 escalate).
// ---------------------------------------------------------------------------
function hasSelfSubmittedRequest(
  rows: BudgetPlanRequestDto[] | undefined,
  currentUserId: string | undefined,
): boolean {
  if (!rows || currentUserId == null) return false
  return rows.some((r) => r.requestedById === currentUserId)
}

// ---------------------------------------------------------------------------
// 재편성 Dialog. reason 필수.
// ---------------------------------------------------------------------------
interface RePlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  submitting: boolean
  onSubmit: (reason: string) => void
}

function RePlanDialog({
  open,
  onOpenChange,
  submitting,
  onSubmit,
}: RePlanDialogProps) {
  const [reason, setReason] = useState('')
  const disabled = submitting || reason.trim().length === 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setReason('')
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>재편성 트리거</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="re-plan-reason">사유 (필수)</Label>
          <Textarea
            id="re-plan-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="재편성 사유를 입력하세요 (심사 창이 다시 열립니다)"
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            확정된 편성을 되돌리고 심사 창을 다시 개방합니다.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </Button>
          <Button
            onClick={() => onSubmit(reason.trim())}
            disabled={disabled}
            data-testid="re-plan-submit"
          >
            {submitting ? '재편성 중…' : '재편성 실행'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// 이의 신청 심사 Dialog (승인/반려 공용).
// 반려는 reviewNote 필수, 승인은 optional.
// ---------------------------------------------------------------------------
interface OverrideReviewDialogProps {
  open: boolean
  decision: 'APPROVED' | 'REJECTED' | null
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (note: string) => void
}

function OverrideReviewDialog({
  open,
  decision,
  submitting,
  onOpenChange,
  onSubmit,
}: OverrideReviewDialogProps) {
  const [note, setNote] = useState('')
  const noteTrimmed = note.trim()
  const requireNote = decision === 'REJECTED'
  const disabled =
    submitting || (requireNote && noteTrimmed.length === 0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setNote('')
      }}
    >
      <DialogContent data-testid="override-review-dialog">
        <DialogHeader>
          <DialogTitle>
            {decision === 'APPROVED' ? '이의 신청 승인' : '이의 신청 반려'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="override-review-note">
            심사 메모 {requireNote ? '(필수)' : '(선택)'}
          </Label>
          <Textarea
            id="override-review-note"
            data-testid="override-review-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              requireNote
                ? '반려 사유를 입력하세요 (신청자에게 전달됨)'
                : '심사 메모 (선택 사항)'
            }
            disabled={submitting}
          />
          {decision === 'APPROVED' && (
            <p className="text-xs text-muted-foreground">
              승인 시 해당 카테고리의 knapsackAllocated 가 신청 금액으로 자동
              조정됩니다.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            data-testid="override-review-cancel"
          >
            취소
          </Button>
          <Button
            onClick={() => onSubmit(noteTrimmed)}
            disabled={disabled}
            data-testid="override-review-submit"
          >
            {submitting
              ? '처리 중…'
              : decision === 'APPROVED'
                ? '승인'
                : '반려'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// 신청 한 건의 라인 테이블.
// ---------------------------------------------------------------------------
function LinesTable({
  lines,
  labelOf,
}: {
  lines: BudgetPlanRequestLineDto[]
  labelOf: (code: string) => string
}) {
  const { rows: categories } = useExpenseCategories()
  const categoryLabel = (categoryId: number): string => {
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return `#${categoryId}`
    return labelOf(cat.code)
  }

  if (lines.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">라인이 없습니다.</p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">카테고리</TableHead>
          <TableHead className="text-xs">트리거</TableHead>
          <TableHead className="text-xs text-right">표준 델타</TableHead>
          <TableHead className="text-xs text-right">프리미엄 델타</TableHead>
          <TableHead className="text-xs">증빙</TableHead>
          <TableHead className="text-xs">메모</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.id} data-line-id={line.id}>
            <TableCell className="text-xs">
              {categoryLabel(line.categoryId)}
            </TableCell>
            <TableCell className="text-xs">
              <TriggerChips triggers={line.triggers} />
            </TableCell>
            <TableCell className="text-xs tabular-nums text-right">
              ₩{line.standardDelta.toLocaleString('ko-KR')}
            </TableCell>
            <TableCell className="text-xs tabular-nums text-right">
              ₩{line.premiumDelta.toLocaleString('ko-KR')}
            </TableCell>
            <TableCell className="text-xs">
              {line.evidenceUrl ? (
                <a
                  href={line.evidenceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-blue-600 hover:underline"
                >
                  링크
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-xs max-w-[16rem]">
              {line.comment ? (
                <span
                  className="block truncate"
                  title={line.comment}
                  data-comment
                >
                  {line.comment}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------
export function FinanceManagerReview({ seasonId, planStatus }: Props) {
  const { user: currentUser } = useCurrentUser()
  const { labelOf, rows: categories } = useExpenseCategories()
  const requestsQuery = usePlanRequests(seasonId)
  const overrideLogsQuery = usePendingOverrideLogs(seasonId)
  const openReview = useOpenReview(seasonId)
  const executeKnapsack = useExecuteKnapsack(seasonId)
  const finalize = useFinalize(seasonId)
  const rePlan = useRePlan(seasonId)
  const reviewOverride = useReviewOverride()
  // #451: mandatoryMinimum 관리 섹션. BudgetPlan(budgetCategoryPlans[]) +
  // PENDING mm 제안 목록. 각 하위 hook 이 seasonId 로 스코프.
  const budgetPlanQuery = useBudgetPlan(seasonId)
  const pendingMinimumsQuery = usePendingMinimums(seasonId)

  const [rePlanOpen, setRePlanOpen] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<{
    log: BudgetOverrideLogDto
    decision: 'APPROVED' | 'REJECTED'
  } | null>(null)

  const requests: BudgetPlanRequestDto[] = requestsQuery.data ?? []
  const groups = useMemo(() => groupByOwner(requests), [requests])

  const showSelfApprovalWarning =
    planStatus === 'KNAPSACK_EXECUTED' &&
    hasSelfSubmittedRequest(requests, currentUser?.id)

  const openReviewEnabled = canOpenReview(planStatus) && !openReview.isPending
  const executeKnapsackEnabled =
    canExecuteKnapsack(planStatus, requests.length) && !executeKnapsack.isPending
  const finalizeEnabled = canFinalize(planStatus) && !finalize.isPending
  const rePlanEnabled = canRePlan(planStatus) && !rePlan.isPending

  const handleOpenReview = () => {
    openReview.mutate(undefined, {
      onSuccess: () => toast.success('심사 창이 개방되었습니다'),
      onError: (err) => toast.error(translateError(err)),
    })
  }

  const handleExecuteKnapsack = () => {
    executeKnapsack.mutate(undefined, {
      onSuccess: () => toast.success('Knapsack 실행 완료'),
      onError: (err) => toast.error(translateError(err)),
    })
  }

  const handleFinalize = () => {
    finalize.mutate(undefined, {
      onSuccess: () => toast.success('편성이 확정되었습니다'),
      onError: (err) => toast.error(translateError(err)),
    })
  }

  const handleRePlanSubmit = (reason: string) => {
    if (!reason) return
    rePlan.mutate(reason, {
      onSuccess: () => {
        toast.success('재편성이 트리거되었습니다 — 심사 창이 다시 열렸습니다')
        setRePlanOpen(false)
      },
      onError: (err) => toast.error(translateError(err)),
    })
  }

  // 이의 신청 심사: 사용자가 [승인] 또는 [반려] 버튼을 누르면 대상 로그+결정을
  // reviewTarget 에 저장하고 Dialog 를 연다. Dialog submit 시 아래 핸들러가 mutate.
  const handleOverrideReviewSubmit = (note: string) => {
    if (!reviewTarget) return
    const { log, decision } = reviewTarget
    reviewOverride.mutate(
      {
        logId: log.id,
        decision,
        // 서버는 note 를 undefined 로 두면 null 로 저장 (승인 case), REJECTED
        // 는 이미 dialog 에서 non-empty 를 강제.
        note: note.length > 0 ? note : undefined,
        seasonId,
      },
      {
        onSuccess: () => {
          toast.success(
            decision === 'APPROVED'
              ? '이의 신청이 승인되었습니다 — knapsackAllocated 가 조정됩니다'
              : '이의 신청이 반려되었습니다',
          )
          setReviewTarget(null)
        },
        onError: (err) => toast.error(translateError(err)),
      },
    )
  }

  const categoryLabelById = (categoryId: number): string => {
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return `#${categoryId}`
    return labelOf(cat.code)
  }

  const pendingLogs: BudgetOverrideLogDto[] = overrideLogsQuery.data ?? []

  return (
    <div className="space-y-6" data-testid="finance-manager-review">
      {/* 액션 헤더 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-base">FM 심사 워크플로우</CardTitle>
            <Badge variant="outline" data-plan-status={planStatus}>
              {planStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleOpenReview}
              disabled={!openReviewEnabled}
              data-testid="btn-open-review"
            >
              심사 창 개방
            </Button>
            <Button
              variant="outline"
              onClick={handleExecuteKnapsack}
              disabled={!executeKnapsackEnabled}
              data-testid="btn-execute-knapsack"
            >
              Knapsack 실행
            </Button>
            <Button
              variant="outline"
              onClick={handleFinalize}
              disabled={!finalizeEnabled}
              data-testid="btn-finalize"
            >
              확정
            </Button>
            <Button
              variant="outline"
              onClick={() => setRePlanOpen(true)}
              disabled={!rePlanEnabled}
              data-testid="btn-re-plan"
            >
              재편성 트리거
            </Button>
          </div>

          {showSelfApprovalWarning && (
            <div
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800"
              data-testid="self-approval-warning"
            >
              본인 신청 포함 → GM 승인 필요
            </div>
          )}
        </CardContent>
      </Card>

      {/* 신청 현황 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">신청 현황</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {requestsQuery.isLoading && (
            <div className="space-y-2" data-testid="requests-loading">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {requestsQuery.isError && !requestsQuery.isLoading && (
            <div
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100 dark:border-red-800"
              data-testid="requests-error"
            >
              신청 현황을 불러오지 못했습니다: {translateError(requestsQuery.error)}
            </div>
          )}

          {!requestsQuery.isLoading &&
            !requestsQuery.isError &&
            groups.length === 0 && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="requests-empty"
              >
                아직 접수된 신청이 없습니다.
              </p>
            )}

          {groups.map((group) => (
            <div
              key={group.key}
              className="space-y-3"
              data-owner-group={group.key}
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn('border', SCOPE_BADGE_CLASS[group.scope])}
                  data-scope-badge={group.scope}
                >
                  {SCOPE_BADGE_LABEL[group.scope]}
                </Badge>
                <h3 className="text-sm font-semibold">{group.displayName}</h3>
                <span className="text-xs text-muted-foreground">
                  ({group.requests.length}건)
                </span>
              </div>
              {group.requests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-md border p-3 space-y-2"
                  data-request-id={req.id}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={cn('border', SCOPE_BADGE_CLASS[req.scope])}
                    >
                      {SCOPE_BADGE_LABEL[req.scope]}
                    </Badge>
                    <span className="font-medium">{ownerDisplayName(req)}</span>
                    <span className="text-muted-foreground">
                      신청자 {requesterDisplayName(req)}
                    </span>
                    <span className="text-muted-foreground">
                      {req.submittedAt
                        ? new Date(req.submittedAt).toLocaleString('ko-KR')
                        : '미제출'}
                    </span>
                    <Badge
                      variant="outline"
                      className="ml-auto"
                      data-request-status={req.status}
                    >
                      {REQUEST_STATUS_LABEL[req.status] ?? req.status}
                    </Badge>
                  </div>
                  <LinesTable lines={req.lines} labelOf={labelOf} />
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 이의 신청 심사 (PENDING BudgetOverrideLog) */}
      <Card data-testid="override-review-section">
        <CardHeader>
          <CardTitle className="text-base">
            이의 신청 심사
            <span className="ml-2 text-xs text-muted-foreground">
              ({pendingLogs.length}건 대기)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {overrideLogsQuery.isLoading && (
            <div className="space-y-2" data-testid="override-logs-loading">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {overrideLogsQuery.isError && !overrideLogsQuery.isLoading && (
            <div
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100 dark:border-red-800"
              data-testid="override-logs-error"
            >
              이의 신청 목록을 불러오지 못했습니다:{' '}
              {translateError(overrideLogsQuery.error)}
            </div>
          )}

          {!overrideLogsQuery.isLoading &&
            !overrideLogsQuery.isError &&
            pendingLogs.length === 0 && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="override-logs-empty"
              >
                대기 중인 이의 신청이 없습니다.
              </p>
            )}

          {pendingLogs.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">카테고리</TableHead>
                  <TableHead className="text-xs text-right">금액</TableHead>
                  <TableHead className="text-xs">사유</TableHead>
                  <TableHead className="text-xs">신청자</TableHead>
                  <TableHead className="text-xs">신청일시</TableHead>
                  <TableHead className="text-xs text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingLogs.map((log) => (
                  <TableRow key={log.id} data-override-log-id={log.id}>
                    <TableCell className="text-xs">
                      {log.expenseCategory?.label
                        ? log.expenseCategory.label
                        : log.expenseCategory?.code
                          ? labelOf(log.expenseCategory.code)
                          : categoryLabelById(log.categoryId)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-right">
                      ₩{log.amount.toLocaleString('ko-KR')}
                    </TableCell>
                    <TableCell className="text-xs max-w-[16rem]">
                      <span
                        className="block truncate"
                        title={log.reason}
                        data-override-reason
                      >
                        {log.reason}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {/* 서버가 아직 requestedBy.username 을 include 하지 않아 id fallback */}
                      #{log.createdById}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">
                      {new Date(log.createdAt).toLocaleString('ko-KR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setReviewTarget({ log, decision: 'APPROVED' })
                          }
                          disabled={reviewOverride.isPending}
                          data-testid={`override-approve-${log.id}`}
                        >
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setReviewTarget({ log, decision: 'REJECTED' })
                          }
                          disabled={reviewOverride.isPending}
                          data-testid={`override-reject-${log.id}`}
                        >
                          반려
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 카테고리별 mandatoryMinimum 관리 (issue #451 F2 / ADR 0022) */}
      <Card data-testid="mm-manage-section">
        <CardHeader>
          <CardTitle className="text-base">
            카테고리별 최소 배정액 관리
            {pendingMinimumsQuery.data && pendingMinimumsQuery.data.length > 0 && (
              <span
                className="ml-2 text-xs text-muted-foreground"
                data-testid="mm-pending-count"
              >
                ({pendingMinimumsQuery.data.length}건 PENDING)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {budgetPlanQuery.isLoading && (
            <div className="space-y-2" data-testid="mm-loading">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {budgetPlanQuery.isError && !budgetPlanQuery.isLoading && (
            <div
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100 dark:border-red-800"
              data-testid="mm-error"
            >
              편성 계획을 불러오지 못했습니다:{' '}
              {translateError(budgetPlanQuery.error)}
            </div>
          )}

          {!budgetPlanQuery.isLoading &&
            !budgetPlanQuery.isError &&
            (budgetPlanQuery.data?.budgetCategoryPlans ?? []).length === 0 && (
              <p
                className="text-sm text-muted-foreground"
                data-testid="mm-empty"
              >
                아직 편성 카테고리가 없습니다.
              </p>
            )}

          {(budgetPlanQuery.data?.budgetCategoryPlans ?? []).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">카테고리</TableHead>
                  <TableHead className="text-xs">스코프</TableHead>
                  <TableHead className="text-xs text-right">
                    현재 최소 배정액
                  </TableHead>
                  <TableHead className="text-xs">PENDING</TableHead>
                  <TableHead className="text-xs text-right">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(budgetPlanQuery.data?.budgetCategoryPlans ?? []).map((cp) => {
                  // BudgetCategoryPlan.category 는 code 문자열. label / scope 는
                  // useExpenseCategories 결과에서 조회한다.
                  const cat = categories.find((c) => c.code === cp.category)
                  const label = cat?.label ?? labelOf(cp.category)
                  const scope: CategoryScope | undefined = cat?.scope
                  // PENDING 제안 lookup — 같은 categoryPlanId 로 매칭.
                  const cpIdNum = Number(cp.id)
                  const pending = (pendingMinimumsQuery.data ?? []).find(
                    (p) => p.categoryPlanId === cpIdNum,
                  )
                  return (
                    <TableRow key={cp.id} data-mm-category-plan-id={cp.id}>
                      <TableCell className="text-xs font-medium">
                        {label}
                      </TableCell>
                      <TableCell className="text-xs">
                        {scope ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              'border',
                              SCOPE_BADGE_CLASS[scope],
                            )}
                            data-mm-scope={scope}
                          >
                            {SCOPE_BADGE_LABEL[scope]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-right">
                        ₩{cp.mandatoryMinimum.toLocaleString('ko-KR')}
                      </TableCell>
                      <TableCell className="text-xs">
                        {pending ? (
                          <Badge
                            variant="outline"
                            className="border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800 tabular-nums"
                            title={`제안 금액 ₩${pending.newAmount.toLocaleString('ko-KR')} — 사유: ${pending.reason}`}
                            data-testid={`mm-pending-badge-${cp.id}`}
                          >
                            PENDING ₩
                            {pending.newAmount.toLocaleString('ko-KR')}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <MandatoryMinimumProposalDialog
                            categoryPlan={{
                              id: cpIdNum,
                              mandatoryMinimum: cp.mandatoryMinimum,
                              expenseCategory: {
                                code: cp.category,
                                label,
                              },
                            }}
                            seasonId={seasonId}
                            trigger={
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`mm-propose-btn-${cp.id}`}
                              >
                                값 제안
                              </Button>
                            }
                          />
                          <MandatoryMinimumHistoryDialog
                            categoryPlanId={cpIdNum}
                            categoryLabel={label}
                            trigger={
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`mm-history-btn-${cp.id}`}
                              >
                                이력
                              </Button>
                            }
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RePlanDialog
        open={rePlanOpen}
        onOpenChange={setRePlanOpen}
        submitting={rePlan.isPending}
        onSubmit={handleRePlanSubmit}
      />

      <OverrideReviewDialog
        open={reviewTarget !== null}
        decision={reviewTarget?.decision ?? null}
        submitting={reviewOverride.isPending}
        onOpenChange={(next) => {
          if (!next && !reviewOverride.isPending) setReviewTarget(null)
        }}
        onSubmit={handleOverrideReviewSubmit}
      />
    </div>
  )
}
