import type { PrismaClient, TriggerType } from "../generated/client";
import { AppError } from "../lib/appError";
import { resolveRequesterScope, assertCategoryScopeMatch, type CategoryScope } from "./scope";
import { promoteTiers, type PromotedTier } from "./promotion";
import type { KnapsackService, KnapsackGroup } from "../budget/knapsack.service";
import type { BudgetPlanNotifyHook } from "./draft";
import { autoGenBudgetHeaderFromPlan } from "./auto-header";
import { cached } from "../lib/cache";

interface Reviewer {
  userId: string;
  email: string | null;
  language: string | null;
  scope: "TEAM" | "DEPARTMENT";
  ownerId: string;
}
export type BudgetPlanReviewersFn = () => Promise<Reviewer[]>;

const REVIEW_WINDOW_DAYS = 14;
const REVIEW_WINDOW_MS = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface SubmitLineDto {
  categoryId: number;
  triggers: TriggerType[];
  standardDelta: number;
  premiumDelta: number;
  evidenceUrl?: string;
  comment?: string;
}

export class BudgetPlanRequestService {
  constructor(
    private prisma: PrismaClient,
    private knapsackService?: KnapsackService,
    private notifyHook?: BudgetPlanNotifyHook,
    private reviewersFn?: BudgetPlanReviewersFn,
  ) {}

  async openReview(seasonId: number, actorUserId: string): Promise<void> {
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true, planStatus: true },
    });
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (report.planStatus !== "DRAFT") {
      throw new AppError(409, "INVALID_PLAN_STATUS_TRANSITION");
    }
    const now = new Date();
    await this.prisma.financialReport.update({
      where: { id: report.id },
      data: {
        planStatus: "AWAITING_REVIEW",
        planStatusChangedAt: now,
        planStatusChangedById: actorUserId,
        reviewOpenedAt: now,
        reviewDeadline: new Date(now.getTime() + REVIEW_WINDOW_MS),
      },
    });
    if (this.notifyHook && this.reviewersFn) {
      const reviewers = await this.reviewersFn();
      await this.notifyHook("REVIEW_OPENED", {
        seasonId,
        deadline: new Date(now.getTime() + REVIEW_WINDOW_MS),
        reviewers,
      });
    }
  }

  async submit(seasonId: number, actorUserId: string, lines: SubmitLineDto[]) {
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true, planStatus: true },
    });
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (report.planStatus !== "AWAITING_REVIEW") {
      throw new AppError(409, "INVALID_PLAN_STATUS_TRANSITION");
    }

    const requester = await resolveRequesterScope(actorUserId, this.prisma);

    if (lines.length === 0) throw new AppError(400, "NO_LINES");

    const categoryIds = lines.map((l) => l.categoryId);
    const categories = await this.prisma.expenseCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, scope: true },
    });
    const catById = new Map(categories.map((c) => [c.id, c.scope as CategoryScope]));
    for (const line of lines) {
      const catScope = catById.get(line.categoryId);
      if (!catScope) throw new AppError(400, "UNKNOWN_CATEGORY");
      assertCategoryScopeMatch(requester, { scope: catScope });
    }

    const now = new Date();
    const request = await this.prisma.budgetPlanRequest.create({
      data: {
        financialReportId: report.id,
        requestedById: actorUserId,
        scope: requester.scope,
        ownerType: requester.scope,
        ownerId: requester.ownerId,
        status: "SUBMITTED",
        submittedAt: now,
      },
    });

    await this.prisma.budgetPlanRequestLine.createMany({
      data: lines.map((l) => ({
        requestId: request.id,
        categoryId: l.categoryId,
        triggers: l.triggers,
        standardDelta: l.standardDelta,
        premiumDelta: l.premiumDelta,
        evidenceUrl: l.evidenceUrl ?? null,
        comment: l.comment ?? null,
      })),
    });

    // TODO(#404): 심사 신청 접수 알림 (in-app to FinanceManager)
    return request;
  }

  async list(seasonId: number) {
    return cached(`budget-plan-requests:season:${seasonId}`, 30, () => this.listUncached(seasonId));
  }

  private async listUncached(seasonId: number) {
    // 신청 목록을 조회하면서 requestedBy 를 include. Prisma 는 ownerType(String)
    // 에 조건부 relation include 를 지원하지 않으므로 (Team/Department 는 서로
    // 다른 모델이고 ownerId 는 discriminator 없이 저장됨), team/department 이름은
    // 서비스 레이어에서 batch lookup 으로 조합한다.
    const requests = await this.prisma.budgetPlanRequest.findMany({
      where: { financialReport: { seasonId } },
      include: {
        lines: true,
        requestedBy: {
          select: {
            id: true,
            username: true,
            email: true,
            frontOfficeRole: true,
            coachingRole: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    // Batch lookup: ownerType 별로 id 를 모아 각각 1 회씩 findMany. 요청이 N 건
    // 이더라도 team/department 조회는 각각 최대 1 회 (총 2 회) 로 억제된다.
    const teamIds: number[] = [];
    const deptIds: number[] = [];
    for (const r of requests) {
      if (r.ownerType === "TEAM") teamIds.push(r.ownerId);
      else if (r.ownerType === "DEPARTMENT") deptIds.push(r.ownerId);
    }
    const [teams, departments] = await Promise.all([
      teamIds.length > 0
        ? this.prisma.team.findMany({
            where: { id: { in: teamIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
      deptIds.length > 0
        ? this.prisma.department.findMany({
            where: { id: { in: deptIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const deptName = new Map(departments.map((d) => [d.id, d.name]));

    return requests.map((r) => {
      const ownerName =
        r.ownerType === "TEAM"
          ? (teamName.get(r.ownerId) ?? `팀 #${r.ownerId}`)
          : r.ownerType === "DEPARTMENT"
            ? (deptName.get(r.ownerId) ?? `부서 #${r.ownerId}`)
            : `#${r.ownerId}`;
      return { ...r, ownerName };
    });
  }

  async finalize(seasonId: number, actorUserId: string): Promise<void> {
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true, planStatus: true },
    });
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (report.planStatus !== "KNAPSACK_EXECUTED") {
      throw new AppError(409, "INVALID_PLAN_STATUS_TRANSITION");
    }

    // Self-approval 방지: FM 이 요청자인 request 존재 시 GM 으로 escalate
    const selfRequest = await this.prisma.budgetPlanRequest.findFirst({
      where: { financialReportId: report.id, requestedById: actorUserId },
      select: { id: true },
    });
    const now = new Date();
    if (selfRequest) {
      await this.prisma.financialReport.update({
        where: { id: report.id },
        data: {
          planStatus: "AWAITING_GM_APPROVAL",
          planStatusChangedAt: now,
          planStatusChangedById: actorUserId,
        },
      });
      // GM approval 대기 알림은 별도 이벤트 필요 (현재 notify.ts 미정의) — 후속 이슈로 처리
      return;
    }

    // ADR 0023 Q2: FINALIZED 전이와 BudgetHeader/Line 자동 생성은 한 트랜잭션.
    // 헤더 생성이 실패하면 planStatus 전이도 롤백되어 편성-지출 정합이 깨지지 않는다.
    await this.prisma.$transaction(async (tx) => {
      await tx.financialReport.update({
        where: { id: report.id },
        data: {
          planStatus: "FINALIZED",
          planStatusChangedAt: now,
          planStatusChangedById: actorUserId,
          finalizedAt: now,
        },
      });
      await autoGenBudgetHeaderFromPlan(seasonId, actorUserId, tx);
    });
    // notifyHook 은 fire-and-forget (트랜잭션 밖). 실패해도 편성 확정은 유지된다.
    if (this.notifyHook && this.reviewersFn) {
      const reviewers = await this.reviewersFn();
      await this.notifyHook("FINALIZED", { seasonId, reviewers });
    }
  }

  async gmApprove(seasonId: number, actorUserId: string): Promise<void> {
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true, planStatus: true },
    });
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (report.planStatus !== "AWAITING_GM_APPROVAL") {
      throw new AppError(409, "INVALID_PLAN_STATUS_TRANSITION");
    }
    const now = new Date();
    // ADR 0023 Q2: self-approval 승인 경로도 finalize 와 동일한 in-tx 훅.
    await this.prisma.$transaction(async (tx) => {
      await tx.financialReport.update({
        where: { id: report.id },
        data: {
          planStatus: "FINALIZED",
          planStatusChangedAt: now,
          planStatusChangedById: actorUserId,
          finalizedAt: now,
        },
      });
      await autoGenBudgetHeaderFromPlan(seasonId, actorUserId, tx);
    });
    if (this.notifyHook && this.reviewersFn) {
      const reviewers = await this.reviewersFn();
      await this.notifyHook("FINALIZED", { seasonId, reviewers });
    }
  }

  async rePlan(seasonId: number, actorUserId: string, reason: string): Promise<void> {
    if (!reason || reason.trim().length === 0) {
      throw new AppError(400, "REASON_REQUIRED");
    }
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true, planStatus: true },
    });
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (report.planStatus !== "FINALIZED") {
      throw new AppError(409, "INVALID_PLAN_STATUS_TRANSITION");
    }
    const now = new Date();
    // 기존 SUBMITTED request 는 archive (PROCESSED)
    await this.prisma.budgetPlanRequest.updateMany({
      where: { financialReportId: report.id, status: "SUBMITTED" },
      data: { status: "PROCESSED", processedAt: now },
    });
    await this.prisma.financialReport.update({
      where: { id: report.id },
      data: {
        planStatus: "AWAITING_REVIEW",
        planStatusChangedAt: now,
        planStatusChangedById: actorUserId,
        reviewOpenedAt: now,
        reviewDeadline: new Date(now.getTime() + REVIEW_WINDOW_MS),
        note: `RE_PLAN: ${reason}`,
      },
    });
    if (this.notifyHook && this.reviewersFn) {
      const reviewers = await this.reviewersFn();
      await this.notifyHook("REVIEW_OPENED", {
        seasonId,
        deadline: new Date(now.getTime() + REVIEW_WINDOW_MS),
        reviewers,
      });
    }
  }

  async executeKnapsack(seasonId: number, actorUserId: string): Promise<void> {
    if (!this.knapsackService) throw new AppError(500, "KNAPSACK_SERVICE_NOT_INJECTED");

    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: {
        id: true,
        planStatus: true,
        reviewDeadline: true,
        totalOperatingBudget: true,
        contingencyReserve: true,
      },
    });
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (report.planStatus !== "AWAITING_REVIEW") {
      throw new AppError(409, "INVALID_PLAN_STATUS_TRANSITION");
    }

    // 조기 실행 검증: reviewDeadline 전이면 모든 팀장·부서장이 신청 완료해야 함
    const now = new Date();
    const deadlinePassed = report.reviewDeadline != null && now >= report.reviewDeadline;
    if (!deadlinePassed) {
      const [expectedTeams, expectedDepts, requests] = await Promise.all([
        this.prisma.team.count({ where: { isActive: true } }),
        this.prisma.department.count({ where: { isActive: true, headId: { not: null } } }),
        this.prisma.budgetPlanRequest.findMany({
          where: { financialReportId: report.id, status: "SUBMITTED" },
          select: { scope: true },
        }),
      ]);
      const teamRequests = requests.filter((r) => r.scope === "TEAM").length;
      const deptRequests = requests.filter((r) => r.scope === "DEPARTMENT").length;
      if (teamRequests < expectedTeams || deptRequests < expectedDepts) {
        throw new AppError(409, "REVIEW_STILL_OPEN");
      }
    }

    // 신청서 + BudgetCategoryPlan + Basic 티어 조회
    const [requests, categoryPlans, basicTiers] = await Promise.all([
      this.prisma.budgetPlanRequest.findMany({
        where: { financialReportId: report.id, status: "SUBMITTED" },
        include: { lines: true },
      }),
      this.prisma.budgetCategoryPlan.findMany({
        where: { financialReportId: report.id },
        select: { id: true, categoryId: true, mandatoryMinimum: true },
      }),
      this.prisma.budgetTier.findMany({
        where: {
          name: "Basic",
          categoryPlan: { financialReportId: report.id },
        },
        select: { id: true, categoryPlanId: true, cost: true },
      }),
    ]);

    // Basic cost map (categoryId → cost)
    const planByCat = new Map(categoryPlans.map((p) => [p.categoryId, p]));
    const basicByPlanId = new Map(basicTiers.map((b) => [b.categoryPlanId, b]));
    const basicByCat = new Map<number, number>();
    for (const plan of categoryPlans) {
      const basic = basicByPlanId.get(plan.id);
      if (basic) basicByCat.set(plan.categoryId, basic.cost);
    }

    // 모든 요청 line 을 단일 리스트로 (같은 카테고리 중복 신청은 스코프 분리로 방지됨)
    const allLines = requests.flatMap((r) => r.lines);
    const promoted = promoteTiers(
      allLines.map((l) => ({
        categoryId: l.categoryId,
        triggers: l.triggers,
        standardDelta: l.standardDelta,
        premiumDelta: l.premiumDelta,
      })),
      basicByCat,
    );

    // 기존 Standard/Premium 티어 제거 후 재생성
    const planIds = categoryPlans.map((p) => p.id);
    await this.prisma.budgetTier.deleteMany({
      where: {
        categoryPlanId: { in: planIds },
        name: { in: ["Standard", "Premium"] },
      },
    });

    const newTiers = promoted
      .filter((t) => t.name !== "Basic")
      .map((t) => {
        const planId = planByCat.get(t.categoryId)!.id;
        return {
          categoryPlanId: planId,
          name: t.name,
          cost: t.cost,
          value: t.value,
          sortOrder: t.sortOrder,
          isSelected: false,
        };
      });
    if (newTiers.length > 0) {
      await this.prisma.budgetTier.createMany({ data: newTiers });
    }

    // Knapsack 입력 구성: Basic 은 제외 (항상 선택), Standard/Premium 만 groups
    // 재조회로 새 tier id 확보
    const allTiersAfter = await this.prisma.budgetTier.findMany({
      where: { categoryPlanId: { in: planIds } },
      select: { id: true, categoryPlanId: true, name: true, cost: true, value: true },
    });
    const groupsByPlan = new Map<string, { basicCost: number; tiers: { id: string; name: string; cost: number; value: number }[] }>();
    for (const t of allTiersAfter) {
      const existing = groupsByPlan.get(t.categoryPlanId) ?? { basicCost: 0, tiers: [] };
      if (t.name === "Basic") existing.basicCost = t.cost;
      else existing.tiers.push({ id: t.id, name: t.name, cost: t.cost, value: t.value });//TODO: tmp 타입 지정
      groupsByPlan.set(t.categoryPlanId, existing);
    }

    const basicSum = Array.from(groupsByPlan.values()).reduce((s, g) => s + g.basicCost, 0);
    const capacity =
      (report.totalOperatingBudget ?? 0) - basicSum - (report.contingencyReserve ?? 0);

    const groups: KnapsackGroup[] = Array.from(groupsByPlan.entries())
      .filter(([, g]) => g.tiers.length > 0)
      .map(([planId, g]) => ({
        categoryPlanId: planId,
        category: planId,
        tiers: g.tiers.map((t) => ({ tierId: t.id, cost: t.cost - g.basicCost, value: t.value })),
      }));

    const result = this.knapsackService.solve({ capacity, groups });

    // 결과 반영: selected tier isSelected=true, BudgetCategoryPlan.knapsackAllocated
    const selectedByPlan = new Map(result.selectedTiers.map((s) => [s.categoryPlanId, s]));
    await Promise.all(
      Array.from(groupsByPlan.entries()).map(async ([planId, g]) => {
        const selected = selectedByPlan.get(planId);
        const allocated = g.basicCost + (selected ? selected.allocated : 0);
        await this.prisma.budgetCategoryPlan.update({
          where: { id: planId},//TODO: 임의 문자열화
          data: { knapsackAllocated: allocated },
        });
        if (selected) {
          await this.prisma.budgetTier.updateMany({
            where: { id: selected.tierId },
            data: { isSelected: true },
          });
        }
      }),
    );

    // 상태 전이
    await this.prisma.financialReport.update({
      where: { id: report.id },
      data: {
        planStatus: "KNAPSACK_EXECUTED",
        planStatusChangedAt: now,
        planStatusChangedById: actorUserId,
        knapsackExecutedAt: now,
      },
    });
    await this.prisma.budgetPlanRequest.updateMany({
      where: { financialReportId: report.id, status: "SUBMITTED" },
      data: { status: "PROCESSED", processedAt: now },
    });

    if (this.notifyHook && this.reviewersFn) {
      const reviewers = await this.reviewersFn();
      await this.notifyHook("KNAPSACK_EXECUTED", { seasonId, reviewers });
    }
  }
}
