import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { budgetPlanKeys } from './budget-plan.service'

// ============================================================================
// mandatory-minimum.service — #450 F1 (ADR 0022)
// ----------------------------------------------------------------------------
// FinanceManager 가 카테고리별 mandatoryMinimum 을 제안하고 GM 이 심사하는
// 4-endpoint 워크플로우 wrapper. 백엔드 라우팅 mount 정보는 다음과 같다:
//   POST   /budget-category-plans/:id/mandatory-minimum             (FM propose)
//   POST   /mandatory-minimum-changes/:id/review                    (GM review)
//   GET    /budget-category-plans/:id/mandatory-minimum/history     (FM/GM/SUPER)
//   GET    /financial-reports/:seasonId/mandatory-minimum/pending   (FM/GM)
//
// 응답은 api.ts 의 request<T>() 규약대로 wrap 없이 그대로 반환한다.
// !res.ok 는 `Error(body.code ?? body.message)` 로 throw 된다.
// ============================================================================

/** apps/api/prisma/schema.prisma: enum MinimumEvidenceType */
export type MinimumEvidenceType = 'CONTRACT' | 'LEGAL' | 'FIXED_COST'

/** apps/api/prisma/schema.prisma: enum MinimumChangeStatus */
export type MinimumChangeStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELED'

/** propose 요청 body — controller.propose 가 body.effectiveDate 를 new Date() 로 파싱한다. */
export interface ProposeMinimumDto {
  newAmount: number
  evidenceType: MinimumEvidenceType
  evidenceUrl?: string
  reason: string
  /** ISO date 문자열. 서버가 new Date() 로 파싱한다. */
  effectiveDate: string
}

/**
 * MandatoryMinimumChangeLog wire type — 서버가 include 하는 관계까지 포함.
 *
 * 백엔드 include 조합 (`mandatory-minimum.service.ts`):
 *   - propose      : proposedBy(basic) + categoryPlan(+expenseCategory)
 *   - review       : proposedBy(basic) + reviewedBy(basic) + categoryPlan(+expenseCategory)
 *   - listHistory  : proposedBy(with role) + reviewedBy(with role) + categoryPlan(+expenseCategory)
 *   - listPending  : proposedBy(basic) + categoryPlan(+expenseCategory)
 *
 * 옵셔널 필드는 응답에 따라 유무가 갈리므로 모두 optional 로 선언.
 */
export interface MandatoryMinimumChangeLogDto {
  id: number
  categoryPlanId: number
  previousAmount: number
  newAmount: number
  evidenceType: MinimumEvidenceType
  evidenceUrl: string | null
  reason: string
  effectiveDate: string
  status: MinimumChangeStatus
  proposedById: string
  proposedAt: string
  reviewedById: string | null
  reviewedAt: string | null
  reviewNote: string | null
  proposedBy?: {
    id: number
    email: string
    username: string | null
    role?: string
    frontOfficeRole?: string | null
  }
  reviewedBy?: {
    id: number
    email: string
    username: string | null
    role?: string
    frontOfficeRole?: string | null
  }
  categoryPlan?: {
    id: number
    mandatoryMinimum?: number
    expenseCategory: { id: number; code: string; label: string }
  }
}

// ============================================================================
// Service — 4 endpoint wrappers
// ============================================================================

/**
 * FinanceManager: 카테고리별 mandatoryMinimum 변경 제안.
 * 같은 categoryPlanId 에 기존 PENDING 이 있으면 서버가 자동 CANCELED (grill Q5).
 * 응답: 201 + 신규 log (proposedBy + categoryPlan.expenseCategory include).
 */
export function proposeMinimum(
  categoryPlanId: number,
  dto: ProposeMinimumDto,
): Promise<MandatoryMinimumChangeLogDto> {
  return api.post<MandatoryMinimumChangeLogDto>(
    `/budget-category-plans/${categoryPlanId}/mandatory-minimum`,
    dto,
  )
}

/**
 * GM: PENDING → APPROVED/REJECTED.
 * APPROVED 시 서버가 categoryPlan.mandatoryMinimum = log.newAmount 즉시 반영 (grill Q9).
 * REJECTED 는 note 필수 (서버 400 REVIEW_NOTE_REQUIRED_FOR_REJECT).
 * 응답: 200 + 업데이트된 log.
 */
export function reviewMinimum(
  logId: number,
  decision: 'APPROVED' | 'REJECTED',
  note?: string,
): Promise<MandatoryMinimumChangeLogDto> {
  return api.post<MandatoryMinimumChangeLogDto>(
    `/mandatory-minimum-changes/${logId}/review`,
    {
      decision,
      ...(note !== undefined ? { note } : {}),
    },
  )
}

/**
 * FM/GM/SUPER_ADMIN: 특정 categoryPlan 의 변경 이력.
 * 서버 정렬: proposedAt DESC (최신순).
 */
export function listHistory(
  categoryPlanId: number,
): Promise<MandatoryMinimumChangeLogDto[]> {
  return api.get<MandatoryMinimumChangeLogDto[]>(
    `/budget-category-plans/${categoryPlanId}/mandatory-minimum/history`,
  )
}

/**
 * FM/GM: seasonId 스코프 PENDING 목록 (GM 검토 대기함용).
 * 서버 정렬: proposedAt ASC (오래된 것부터).
 * FinancialReport 가 아직 없으면 서버가 `[]` 반환.
 */
export function listPendingBySeason(
  seasonId: number,
): Promise<MandatoryMinimumChangeLogDto[]> {
  return api.get<MandatoryMinimumChangeLogDto[]>(
    `/financial-reports/${seasonId}/mandatory-minimum/pending`,
  )
}

/** budget-plan.service 와 동일 형태로 함께 export — UI 에서 편의상 오브젝트 스타일도 지원. */
export const mandatoryMinimumApi = {
  propose: proposeMinimum,
  review: reviewMinimum,
  listHistory,
  listPendingBySeason,
}

// ============================================================================
// React Query — query keys + hooks
// ============================================================================

/**
 * Query key 계층. mutation 성공 시 pending(seasonId) + history(categoryPlanId) +
 * 재무보고서(cross-cache) 를 함께 invalidate 한다.
 */
export const mandatoryMinimumKeys = {
  all: ['mandatory-minimum'] as const,
  pending: (seasonId: number) =>
    [...mandatoryMinimumKeys.all, 'pending', seasonId] as const,
  history: (categoryPlanId: number) =>
    [...mandatoryMinimumKeys.all, 'history', categoryPlanId] as const,
}

/**
 * 공통 invalidator — mm 자체 캐시 두 개 + budget-plan.service 소유의 세 계열.
 *
 * mm 변경이 categoryPlan.mandatoryMinimum 을 갱신하므로 (review APPROVED),
 * FinancialReport 조회와 budget-plan requests 리스트도 함께 만료시켜야
 * 파생 KPI (available budget 등) 가 즉시 재계산된다.
 */
function invalidateMinimum(
  qc: ReturnType<typeof useQueryClient>,
  seasonId: number,
  categoryPlanId: number,
) {
  return Promise.all([
    qc.invalidateQueries({
      queryKey: mandatoryMinimumKeys.pending(seasonId),
    }),
    qc.invalidateQueries({
      queryKey: mandatoryMinimumKeys.history(categoryPlanId),
    }),
    qc.invalidateQueries({
      queryKey: budgetPlanKeys.financialReport(seasonId),
    }),
    qc.invalidateQueries({
      queryKey: budgetPlanKeys.requests(seasonId),
    }),
  ])
}

/**
 * FM 제안 mutation. seasonId 는 pending 캐시 invalidation 대상이라 hook 시그니처에
 * 함께 받는다 (budget-plan.service 의 useReviewOverride 패턴과 대칭).
 */
export function useProposeMinimum(categoryPlanId: number, seasonId: number) {
  const qc = useQueryClient()
  return useMutation<MandatoryMinimumChangeLogDto, Error, ProposeMinimumDto>({
    mutationFn: (dto) => proposeMinimum(categoryPlanId, dto),
    onSuccess: () => invalidateMinimum(qc, seasonId, categoryPlanId),
  })
}

export interface ReviewMinimumVars {
  logId: number
  decision: 'APPROVED' | 'REJECTED'
  note?: string
}

/**
 * GM 리뷰 mutation. logId 스코프라 seasonId 는 hook 인자로 받아 invalidation 만
 * 처리한다 (categoryPlanId 는 성공 응답에서 얻어 history 캐시도 함께 만료).
 */
export function useReviewMinimum(seasonId: number) {
  const qc = useQueryClient()
  return useMutation<MandatoryMinimumChangeLogDto, Error, ReviewMinimumVars>({
    mutationFn: ({ logId, decision, note }) =>
      reviewMinimum(logId, decision, note),
    onSuccess: (data) => invalidateMinimum(qc, seasonId, data.categoryPlanId),
  })
}

/**
 * 특정 categoryPlan 의 변경 이력 조회. categoryPlanId 가 falsy 이면 자동 disable.
 * opts.enabled 로 상위에서 추가 게이팅 가능 (예: 확장 패널 open 시에만).
 */
export function useMinimumHistory(
  categoryPlanId: number | null | undefined,
  opts?: { enabled?: boolean },
) {
  const idOk =
    Number.isFinite(categoryPlanId as number) &&
    (categoryPlanId as number) > 0
  return useQuery<MandatoryMinimumChangeLogDto[]>({
    queryKey: mandatoryMinimumKeys.history((categoryPlanId ?? 0) as number),
    queryFn: () => listHistory(categoryPlanId as number),
    enabled: idOk && (opts?.enabled ?? true),
    staleTime: 60 * 1000,
  })
}

/**
 * seasonId 스코프 PENDING 조회 (GM 검토 대기함). seasonId falsy 시 auto-disable.
 */
export function usePendingMinimums(seasonId: number | null | undefined) {
  const idOk =
    Number.isFinite(seasonId as number) && (seasonId as number) > 0
  return useQuery<MandatoryMinimumChangeLogDto[]>({
    queryKey: mandatoryMinimumKeys.pending((seasonId ?? 0) as number),
    queryFn: () => listPendingBySeason(seasonId as number),
    enabled: idOk,
    staleTime: 60 * 1000,
  })
}
