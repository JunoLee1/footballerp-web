import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { financialReportApi } from '@/services/financial-report.service'
import {
  useBudgetPlan,
  type BudgetPlanStatus,
} from '@/services/budget-plan.service'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useExpenseCategories } from '@/hooks/useExpenseCategories'
import type { UserDto } from '@/types/auth'
import type { BudgetPlan } from '@/types/budget'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PlanStatusBadge } from './PlanStatusBadge'
import { GmReplanPanel } from './GmReplanPanel'

interface Props {
  seasonId: number
}

/**
 * `FinancialReport` 응답에는 아직 `planStatus` 필드가 서비스 layer 타입에
 * 반영돼 있지 않다 (services/financial-report.service.ts 는 legacy shape).
 * 서버 (`apps/api/prisma/schema.prisma`) 는 이미 필드를 노출하므로 여기서
 * 좁혀 사용한다. Slice 통합 시 FinancialReport interface 에 planStatus 를
 * 추가하고 이 로컬 타입은 제거한다.
 */
interface FinancialReportWithPlanStatus {
  planStatus: BudgetPlanStatus
}

/**
 * `user.role + user.frontOfficeRole` 로 편성 워크플로우 상의 페르소나를 판정한다.
 *
 * - GM (단장) → GM 승인 패널
 * - FRONT_OFFICE + FINANCE_MANAGER → FM 심사 화면 (#429 slice)
 * - COACHING_STAFF (HEAD_COACH) or FRONT_OFFICE (FINANCE 외) → 팀장/부서장 편성 신청 위저드 (#427 slice)
 * - ADMIN/SUPER_ADMIN → 뱃지 + 안내만
 * - 그 외 → 빈 뷰
 *
 * 부서장 판정을 위해서는 `Department.headId === user.id` 매핑이 필요하나 이번 slice
 * 에서는 API/hook 이 아직 없어 role 기반으로만 판별한다. TODO(#432) 로 정합화 예정.
 */
type Persona = 'TEAM_LEADER' | 'FINANCE_MANAGER' | 'GM' | 'ADMIN' | 'OTHER'

function resolvePersona(user: UserDto): Persona {
  if (user.role === 'GM') return 'GM'
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return 'ADMIN'
  if (user.role === 'FRONT_OFFICE') {
    if (user.frontOfficeRole === 'FINANCE_MANAGER') return 'FINANCE_MANAGER'
    // FRONT_OFFICE 중 FINANCE 계열 이외는 부서장 후보로 취급 (부서장 매핑
    // 정합화 전 임시 규칙 — headId 조회 API 도입 시 좁힌다).
    if (user.frontOfficeRole && user.frontOfficeRole !== 'FINANCE_STAFF') {
      return 'TEAM_LEADER'
    }
    return 'OTHER'
  }
  if (user.role === 'COACHING_STAFF') {
    // 팀장 (감독) 만 편성 위저드 접근. 그 외 코칭 스태프는 뷰 없음.
    if (user.coachingRole === 'HEAD_COACH') return 'TEAM_LEADER'
    return 'OTHER'
  }
  return 'OTHER'
}

// ============================================================================
// mandatoryMinimum 위반 배너 (#453 F4)
// ----------------------------------------------------------------------------
// FINALIZED 이후 categoryPlan 의 basicCost 가 mandatoryMinimum 을 하회하는
// 카테고리가 있으면 페이지 상단에 재편성 필요를 알리는 warning bar 를 노출한다.
// 배너는 조회 데이터만 사용하고 서버에 별도 위반 감지 요청을 보내지 않는다 —
// backend B3 (#449) 가 FINALIZED 승인 시점에 GM 에게 이미 알림을 발송하고,
// FE 배너는 즉시 UX 를 위한 병행 감지 채널이다.
// ============================================================================

interface Violation {
  categoryPlanId: string
  categoryCode: string
  basicCost: number
  mandatoryMinimum: number
}

/**
 * BudgetPlan → 위반 카테고리 목록. `basicCost < mandatoryMinimum` 인 항목만
 * 뽑고, 그 외는 제외한다. Basic tier 가 없는 카테고리는 자동화 미실행 상태로
 * 간주해 basicCost = 0 으로 취급 (Wizard `basicCostByCategoryCode` 규약).
 */
export function detectMinimumViolations(
  plan: BudgetPlan | null | undefined,
): Violation[] {
  if (!plan) return []
  const out: Violation[] = []
  for (const cp of plan.budgetCategoryPlans) {
    const basicTier = cp.tiers.find((t) => t.name === 'Basic')
    const basicCost = basicTier?.cost ?? 0
    if (basicCost < cp.mandatoryMinimum) {
      out.push({
        categoryPlanId: cp.id,
        categoryCode: cp.category,
        basicCost,
        mandatoryMinimum: cp.mandatoryMinimum,
      })
    }
  }
  return out
}

/** ₩ 포맷터 — Intl.NumberFormat 을 재사용 (배너 안 delta 표시). */
const wonFmt = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
})

interface ViolationBannerProps {
  seasonId: number
  isGm: boolean
}

/**
 * 위반 배너 자체. `useBudgetPlan` 은 hook 이라 조건부 호출이 안 되므로,
 * 이 컴포넌트는 배너 유무를 반환값으로 판단해 상위에서 렌더 여부를 결정할 수
 * 있도록 위반 카운트 = 0 이면 null 반환.
 */
function MandatoryMinimumViolationBanner({
  seasonId,
  isGm,
}: ViolationBannerProps) {
  const budgetPlanQuery = useBudgetPlan(seasonId)
  const { labelOf } = useExpenseCategories()

  const violations = useMemo(
    () => detectMinimumViolations(budgetPlanQuery.data),
    [budgetPlanQuery.data],
  )

  if (violations.length === 0) return null

  return (
    <section
      role="alert"
      data-testid="mm-violation-banner"
      data-violation-count={violations.length}
      className={cn(
        'flex flex-col gap-2 rounded-md border p-3 text-sm',
        'border-amber-300 bg-amber-50 text-amber-900',
        'dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100',
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <div className="flex-1 space-y-1">
          <p className="font-medium" data-testid="mm-violation-headline">
            재편성 필요: {violations.length}개 카테고리에서 basicCost &lt;
            mandatoryMinimum 위반
          </p>
          <div
            className="flex flex-wrap gap-1.5"
            data-testid="mm-violation-chips"
          >
            {violations.map((v) => {
              const delta = v.mandatoryMinimum - v.basicCost
              return (
                <Badge
                  key={v.categoryPlanId}
                  variant="outline"
                  className={cn(
                    'border-amber-400 bg-amber-100 text-amber-900',
                    'dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100',
                  )}
                  data-testid={`mm-violation-chip-${v.categoryCode}`}
                >
                  {labelOf(v.categoryCode)} · 부족 {wonFmt.format(delta)}
                </Badge>
              )
            })}
          </div>
        </div>
        {isGm && (
          // 앵커 링크 — 실제 재편성 액션은 GmReplanPanel 내부 dialog 를 통해서만
          // 이루어진다. shadcn Button 은 base-ui 로 감싸져 있어 asChild 를
          // 지원하지 않으므로 buttonVariants 클래스만 재사용해 anchor 로 스타일한다.
          <a
            href="#gm-replan-panel"
            className={cn(
              buttonVariants({ variant: 'outline', size: 'sm' }),
              'shrink-0 border-amber-400 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800',
            )}
            data-testid="mm-violation-replan-shortcut"
          >
            재편성 트리거
          </a>
        )}
      </div>
    </section>
  )
}

/**
 * 편성 워크플로우의 진입점 페이지.
 *
 * role + planStatus 를 기준으로 하위 slice (#427 Wizard, #429 FMReview, #432 GmApproval)
 * 중 하나를 렌더한다. 이번 PR (#428) 은 뱃지 + 라우팅 skeleton 만 담당하며,
 * 각 slice 는 병렬 PR 로 나뉘어 있어 아직 export 가 없다 (placeholder + TODO 유지).
 *
 * 상단에는 mandatoryMinimum 위반 배너 (#453 F4) 를 조건부로 노출한다.
 */
export function BudgetPlanPage({ seasonId }: Props) {
  const { user, loading: userLoading } = useCurrentUser()
  const [planStatus, setPlanStatus] = useState<BudgetPlanStatus | null>(null)
  const [reportLoading, setReportLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setReportLoading(true)
    financialReportApi
      .get(seasonId)
      .then((report) => {
        if (cancelled) return
        // 서버 응답에 planStatus 가 포함돼 있으나 legacy interface 로 인해 좁혀서 읽는다.
        const withStatus = report as unknown as FinancialReportWithPlanStatus
        setPlanStatus(withStatus.planStatus ?? 'DRAFT')
      })
      .catch(() => {
        if (!cancelled) setPlanStatus(null)
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [seasonId])

  if (userLoading || reportLoading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">로그인이 필요합니다.</p>
      </div>
    )
  }

  if (planStatus === null) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">
          시즌 재무보고서를 불러오지 못했습니다.
        </p>
      </div>
    )
  }

  const persona = resolvePersona(user)
  const isGm = persona === 'GM'

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">편성 워크플로우</h1>
        <PlanStatusBadge status={planStatus} />
      </header>

      {/*
        mandatoryMinimum 위반 배너 (#453 F4). basicCost < mm 인 카테고리가
        하나 이상이면 노출된다. GM 은 재편성 shortcut 도 함께 렌더.
        위반이 없으면 컴포넌트 자체가 null 이라 배너 자리를 차지하지 않는다.
      */}
      <MandatoryMinimumViolationBanner seasonId={seasonId} isGm={isGm} />

      {/*
        각 slice 는 별도 PR 로 진행되므로 이번 PR 은 place-holder + TODO 만 남긴다.
        #427 (Wizard) / #429 (FMReview) 는 병렬 개발 중이며 export 가 붙는 대로
        여기서 import 로 교체한다.
      */}
      {persona === 'TEAM_LEADER' && (
        // TODO(#427): <BudgetPlanWizard seasonId={seasonId} planStatus={planStatus} />
        <section
          data-persona="TEAM_LEADER"
          className="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
        >
          팀장/부서장 편성 위저드 (준비 중)
        </section>
      )}

      {persona === 'FINANCE_MANAGER' && (
        // TODO(#429): <FinanceManagerReview seasonId={seasonId} planStatus={planStatus} />
        <section
          data-persona="FINANCE_MANAGER"
          className="rounded-md border border-dashed p-4 text-sm text-muted-foreground"
        >
          재무담당 심사 화면 (준비 중)
        </section>
      )}

      {persona === 'GM' && (
        // #432 GM 재편성 지시 패널. 확정된 편성만 재편성 트리거 가능하며,
        // 그 외 상태 (승인 대기 등) UI 는 별도 slice 에서 붙는다.
        //
        // #453 F4 위반 배너의 "재편성 트리거" shortcut 이 이 anchor 로 스크롤한다.
        // 재편성 실행 자체는 GmReplanPanel 내부 dialog 를 통해서만 이루어진다.
        <div id="gm-replan-panel">
          <GmReplanPanel seasonId={seasonId} planStatus={planStatus} />
        </div>
      )}

      {persona === 'ADMIN' && (
        <section
          data-persona="ADMIN"
          className="rounded-md border p-4 text-sm text-muted-foreground"
        >
          시즌 {seasonId} 편성 상태: <strong>{planStatus}</strong>
        </section>
      )}

      {persona === 'OTHER' && (
        <section
          data-persona="OTHER"
          className="text-sm text-muted-foreground"
        >
          편성 워크플로우에 접근 권한이 없습니다.
        </section>
      )}
    </div>
  )
}
