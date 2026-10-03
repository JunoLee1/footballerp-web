import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { resolveRequesterScope, assertCategoryScopeMatch, type CategoryScope } from "./scope";

export interface OverrideRequestDto {
  categoryId: string;
  amount: number;
  reason: string;
}

/**
 * #444: BudgetOverrideLog PENDING 목록 조회용 query 파라미터.
 * status 미지정 시 전체 상태 반환, limit 미지정 시 50 (max 200).
 * cursor 는 마지막으로 본 log.id (exclusive, DESC ordering) — 다음 페이지 요청 시 사용.
 */
export interface ListOverrideLogsQuery {
  status?: "PENDING" | "APPROVED" | "REJECTED";
  limit?: number;
  cursor?: string;
}

const OVERRIDE_LOG_LIST_INCLUDE = {
  expenseCategory: { select: { id: true, code: true, label: true } },
  createdBy: {
    select: { id: true, email: true, username: true, frontOfficeRole: true },
  },
  reviewedBy: {
    select: { id: true, email: true, username: true, frontOfficeRole: true },
  },
} as const;

export class BudgetOverrideService {
  constructor(private prisma: PrismaClient) {}

  async requestOverride(
    seasonId: number,
    actorUserId: string,
    dto: OverrideRequestDto,
  ): Promise<{ id: string }> {
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true, planStatus: true },
    });
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (report.planStatus !== "FINALIZED") {
      throw new AppError(409, "INVALID_PLAN_STATUS_TRANSITION");
    }
    if (dto.amount <= 0) throw new AppError(400, "AMOUNT_MUST_BE_POSITIVE");
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new AppError(400, "REASON_REQUIRED");
    }

    // 스코프 검증: 요청자가 해당 카테고리의 스코프와 매칭되어야 함
    const requester = await resolveRequesterScope(actorUserId, this.prisma);
    const category = await this.prisma.expenseCategory.findUnique({
      where: { id: dto.categoryId },
      select: { scope: true },
    });
    if (!category) throw new AppError(400, "UNKNOWN_CATEGORY");
    assertCategoryScopeMatch(requester, { scope: category.scope as CategoryScope });

    const log = await this.prisma.budgetOverrideLog.create({
      data: {
        financialReportId: report.id,
        categoryId: dto.categoryId,
        amount: dto.amount,
        reason: dto.reason,
        createdById: actorUserId,
        status: "PENDING",
      },
    });
    return { id: String(log.id) };
  }

  async reviewOverride(
    logId: string,
    reviewerUserId: string,
    decision: "APPROVED" | "REJECTED",
    note?: string,
  ): Promise<void> {
    const log = await this.prisma.budgetOverrideLog.findUnique({
      where: { id: logId },
      select: { id: true, status: true, financialReportId: true, categoryId: true, amount: true },
    });
    if (!log) throw new AppError(404, "OVERRIDE_LOG_NOT_FOUND");
    if (log.status !== "PENDING") throw new AppError(409, "INVALID_OVERRIDE_STATUS_TRANSITION");

    const now = new Date();
    if (decision === "REJECTED") {
      await this.prisma.budgetOverrideLog.update({
        where: { id: logId },
        data: {
          status: "REJECTED",
          reviewedById: reviewerUserId,
          reviewedAt: now,
          reviewNote: note ?? null,
        },
      });
      return;
    }

    // APPROVED: capacity 검증 후 knapsackAllocated 조정
    const plan = await this.prisma.budgetCategoryPlan.findFirst({
      where: { financialReportId: log.financialReportId, categoryId: log.categoryId },
      select: { id: true, knapsackAllocated: true },
    });
    if (!plan) throw new AppError(400, "CATEGORY_PLAN_NOT_FOUND");

    const [allPlans, report] = await Promise.all([
      this.prisma.budgetCategoryPlan.findMany({
        where: { financialReportId: log.financialReportId },
        select: { id: true, knapsackAllocated: true },
      }),
      this.prisma.financialReport.findUnique({
        where: { id: log.financialReportId },
        select: { totalOperatingBudget: true, contingencyReserve: true },
      }),
    ]);
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");

    const otherAllocated = allPlans
      .filter((p) => p.id !== plan.id)
      .reduce((s, p) => s + (p.knapsackAllocated ?? 0), 0);
    const newTotal = otherAllocated + log.amount + (report.contingencyReserve ?? 0);
    const budget = report.totalOperatingBudget ?? 0;
    if (newTotal > budget) {
      throw new AppError(409, "OVERRIDE_EXCEEDS_TOTAL_BUDGET");
    }

    await this.prisma.$transaction([
      this.prisma.budgetOverrideLog.update({
        where: { id: logId },
        data: {
          status: "APPROVED",
          reviewedById: reviewerUserId,
          reviewedAt: now,
          reviewNote: note ?? null,
        },
      }),
      this.prisma.budgetCategoryPlan.update({
        where: { id: String(plan.id) }, //TODO: plan Id 수정
        data: { knapsackAllocated: log.amount },
      }),
    ]);
  }

  /**
   * #444: BudgetOverrideLog 목록 조회 (id DESC, 커서 페이지네이션).
   *
   * FM/GM/ADMIN 을 상정한 전 시즌 로그 조회. 컨트롤러가 권한 게이트를 담당하며,
   * 서비스는 순수 데이터 접근만 책임진다 (팀장/부서장 scope 매칭은 후속 이슈).
   *
   * 기존 `GET /financial-reports/:seasonId/budget` 응답의 `overrideLogs` include
   * (`financial-report.repo.ts:180` — take 50) 는 FM 리뷰 UI 가 PENDING 만 필터
   * 하기엔 잘림 리스크가 있어 이 endpoint 로 대체한다.
   *
   * FinancialReport 가 아직 없으면 빈 배열 반환 (404 대신 idempotent 응답).
   */
  async list(seasonId: number, query: ListOverrideLogsQuery) {
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true },
    });
    if (!report) return [];

    const rawLimit = query.limit ?? 50;
    if (!Number.isInteger(rawLimit) || rawLimit <= 0) {
      throw new AppError(400, "INVALID_LIMIT");
    }
    if (rawLimit > 200) throw new AppError(400, "LIMIT_EXCEEDS_MAX");

    if (
      query.status !== undefined &&
      query.status !== "PENDING" &&
      query.status !== "APPROVED" &&
      query.status !== "REJECTED"
    ) {
      throw new AppError(400, "INVALID_STATUS");
    }

    if (query.cursor !== undefined) {
      if (typeof query.cursor !== "string" || query.cursor.length === 0) {
        throw new AppError(400, "INVALID_CURSOR");
      }
    }

    return this.prisma.budgetOverrideLog.findMany({
      where: {
        financialReportId: report.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor !== undefined ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: rawLimit,
      include: OVERRIDE_LOG_LIST_INCLUDE,
    });
  }
}
