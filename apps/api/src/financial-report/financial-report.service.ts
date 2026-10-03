import { AppError } from "../lib/appError";
import { FinancialReportRepository, UpsertBudgetPlanDto, RevenueBreakdownDto, sumBreakdown } from "./financial-report.repo";
import { KnapsackService } from "../budget/knapsack.service";
import { SeasonStatus } from "../generated/client";
import { getPrisma } from "../lib/prisma";
import { getSeasonRevenueActuals } from "../lib/season-actuals";
import { ExpenseCategoryService } from "../expense-category/expense-category.service";
import { cached } from "../lib/cache";

// Wire-format DTO (from controller) — category is a code string.
// `sortOrder` on both categories and tiers preserves the user-controlled
// drag-and-drop order set in the BudgetPlanPage wizard.
export interface UpsertBudgetPlanRequest {
  totalOperatingBudget: number;
  contingencyReserve: number;
  playerSalaryBudget?: number;
  categories: {
    category: string;
    mandatoryMinimum: number;
    sortOrder?: number;
    tiers: { name: string; cost: number; value: number; sortOrder?: number }[];
  }[];
}

export class FinancialReportService {
  constructor(
    private repo: FinancialReportRepository,
    private knapsack: KnapsackService,
    private categoryService: ExpenseCategoryService,
  ) {}

  async set(seasonId: number, totalRevenue: number, note?: string, breakdown?: RevenueBreakdownDto, changedById?: string) {
    if (totalRevenue <= 0) throw new AppError(400, "INVALID_REVENUE");
    if (breakdown) {
      const breakdownSum = sumBreakdown(breakdown);
      if (breakdownSum !== totalRevenue) {
        throw new AppError(400, "REVENUE_BREAKDOWN_SUM_MISMATCH");
      }
    }
    return this.repo.upsert(seasonId, totalRevenue, note, breakdown, changedById);
  }

  async setBreakdown(seasonId: number, breakdown: RevenueBreakdownDto, note?: string, changedById?: string) {
    const total = sumBreakdown(breakdown);
    if (total <= 0) throw new AppError(400, "INVALID_REVENUE");
    return this.repo.upsert(seasonId, total, note, breakdown, changedById);
  }

  async getRevenueLogs(seasonId: number) {
    return this.repo.getRevenueLogs(seasonId);
  }

  async setFromCSV(seasonId: number, csvContent: string, note?: string) {
    const totalRevenue = this.parseCSV(csvContent);
    return this.repo.upsert(seasonId, totalRevenue, note);
  }

  async get(seasonId: number) {
    return cached(`financial-report:season:${seasonId}`, 30, async () => {
      const report = await this.repo.findBySeasonId(seasonId);
      if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
      return report;
    });
  }

  async upsertBudgetPlan(seasonId: number, dto: UpsertBudgetPlanRequest) {
    if (dto.totalOperatingBudget <= 0) throw new AppError(400, "INVALID_BUDGET");
    if (dto.contingencyReserve < 0) throw new AppError(400, "INVALID_CONTINGENCY");
    // Resolve code → id for each category. Fall back to array position for
    // sortOrder when the client omits it (older payloads pre-wizard).
    const resolved: UpsertBudgetPlanDto = {
      totalOperatingBudget: dto.totalOperatingBudget,
      contingencyReserve: dto.contingencyReserve,
      ...(dto.playerSalaryBudget !== undefined ? { playerSalaryBudget: dto.playerSalaryBudget } : {}),
      categories: await Promise.all(
        dto.categories.map(async (c, catIdx) => ({
          categoryId: await this.categoryService.resolveCategoryId(c.category),
          mandatoryMinimum: c.mandatoryMinimum,
          sortOrder: c.sortOrder ?? catIdx,
          tiers: c.tiers.map((t, tierIdx) => ({
            name: t.name,
            cost: t.cost,
            value: t.value,
            sortOrder: t.sortOrder ?? tierIdx,
          })),
        }))
      ),
    };
    return this.repo.upsertBudgetPlan(seasonId, resolved);
  }

  async getBudgetPlan(seasonId: number) {
    const plan = await this.repo.getBudgetPlan(seasonId);
    if (!plan) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    return plan;
  }

  async optimize(seasonId: number) {
    const plan = await this.repo.getBudgetPlan(seasonId);
    if (!plan) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (!plan.totalOperatingBudget) throw new AppError(400, "BUDGET_NOT_SET");

    const mandatoryTotal = plan.budgetCategoryPlans.reduce(
      (s, c) => s + c.mandatoryMinimum, 0
    );
    const capacity = plan.totalOperatingBudget - mandatoryTotal - (plan.contingencyReserve ?? 0);
    if (capacity <= 0) throw new AppError(400, "DISCRETIONARY_POOL_EMPTY");

    const groups = plan.budgetCategoryPlans
      .filter((c) => c.tiers.length > 0)
      .map((c) => ({
        categoryPlanId: c.id,
        category: c.expenseCategory?.code ?? "",
        tiers: c.tiers.map((t) => ({ tierId: t.id, cost: t.cost, value: t.value })),
      }));

    const result = this.knapsack.solve({ capacity, groups });
    await this.repo.saveOptimizeResult(plan.id, result.selectedTiers);

    return { ...result, capacity, mandatoryTotal };
  }

  async addOverride(
    seasonId: number,
    category: string,
    amount: number,
    reason: string,
    createdById: string
  ) {
    const plan = await this.repo.getBudgetPlan(seasonId);
    if (!plan) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    if (amount <= 0) throw new AppError(400, "INVALID_AMOUNT");
    if (!reason.trim()) throw new AppError(400, "REASON_REQUIRED");
    if (!(await this.categoryService.isValidCode(category))) {
      throw new AppError(400, "INVALID_CATEGORY");
    }
    const categoryId = await this.categoryService.resolveCategoryId(category);
    return this.repo.addOverrideLog(plan.id, categoryId, amount, reason, createdById);
  }

  async getPayrollByMonth(seasonId: number) {
    return this.repo.getPayrollByMonth(seasonId);
  }

  async approveOverride(logId: string, reviewerId: string) {
    const log = await this.repo.findOverrideLog(logId);
    if (!log) throw new AppError(404, "OVERRIDE_LOG_NOT_FOUND");
    if (log.status !== "PENDING") throw new AppError(409, "ALREADY_REVIEWED");
    if (log.createdById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");
    return this.repo.approveOverrideLog(logId, reviewerId);
  }

  async rejectOverride(logId: string, reviewerId: string, reviewNote: string) {
    if (!reviewNote?.trim()) throw new AppError(400, "REVIEW_NOTE_REQUIRED");
    const log = await this.repo.findOverrideLog(logId);
    if (!log) throw new AppError(404, "OVERRIDE_LOG_NOT_FOUND");
    if (log.status !== "PENDING") throw new AppError(409, "ALREADY_REVIEWED");
    return this.repo.rejectOverrideLog(logId, reviewerId, reviewNote.trim());
  }

  async getActuals(seasonId: number) {
    return this.repo.getActuals(seasonId);
  }

  async autoGenerateBudgetPlan(
    seasonId: number,
    opts: { growthRate?: number; contingencyRate?: number }
  ) {
    const { growthRate = 0.1, contingencyRate = 0 } = opts;
    const prisma = getPrisma();

    // 현재 시즌의 endDate 조회
    const currentSeason = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { endDate: true },
    });
    if (!currentSeason) throw new AppError(404, "SEASON_NOT_FOUND");

    // 직전 시즌 탐색 (endDate 기준 현재보다 이전, 가장 최근)
    const prevSeason = await prisma.season.findFirst({
      where: { endDate: { lt: currentSeason.endDate } },
      orderBy: { endDate: "desc" },
      select: { id: true },
    });
    if (!prevSeason) throw new AppError(404, "PREV_SEASON_NOT_FOUND");

    const prevActuals = await this.repo.getActuals(prevSeason.id);
    if (!prevActuals) throw new AppError(404, "PREV_SEASON_NOT_FOUND");

    const activeCategories = await this.categoryService.listActive();
    const zeroCategories: string[] = [];

    const categories = activeCategories.map((c, idx) => {
      const actual = prevActuals[c.code] ?? 0;
      if (actual === 0) zeroCategories.push(c.code);
      return {
        categoryId: c.id,
        mandatoryMinimum: Math.round(actual * (1 + growthRate)),
        sortOrder: idx,
        tiers: [] as { name: string; cost: number; value: number; sortOrder: number }[],
      };
    });

    const mandatoryTotal = categories.reduce((s, c) => s + c.mandatoryMinimum, 0);
    const contingencyReserve = Math.round(mandatoryTotal * contingencyRate);
    const totalOperatingBudget = mandatoryTotal + contingencyReserve;

    await this.repo.upsertBudgetPlan(seasonId, {
      totalOperatingBudget,
      contingencyReserve,
      categories,
    });

    // Callers rely on `category` code strings in the response; enrich in-memory.
    const responseCategories = activeCategories.map((c, idx) => ({
      category: c.code,
      mandatoryMinimum: categories[idx]!.mandatoryMinimum,
    }));

    return { totalOperatingBudget, contingencyReserve, categories: responseCategories, zeroCategories };
  }

  /**
   * 타깃 시즌 startDate 이전에 종료된 CLOSED 시즌 중 최근 N개를 골라
   * getSeasonRevenueActuals 로 필드별 평균을 계산 → repo.upsert 로 저장.
   *
   * @param seasonId 타깃 시즌
   * @param lookback 조회할 최대 CLOSED 시즌 개수 (default 3)
   * @throws AppError(400, "INVALID_LOOKBACK")   lookback < 1 또는 정수 아님
   * @throws AppError(404, "SEASON_NOT_FOUND")   타깃 시즌 없음
   * @throws AppError(404, "NO_PREV_SEASON")     CLOSED 시즌 0개
   */
  async autoFillRevenueFromPrevSeasons(seasonId: number, lookback = 3) {
    if (!Number.isInteger(lookback) || lookback < 1) {
      throw new AppError(400, "INVALID_LOOKBACK");
    }

    const prisma = getPrisma();

    const target = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { startDate: true },
    });
    if (!target) throw new AppError(404, "SEASON_NOT_FOUND");

    // CLOSED 시즌 중 endDate < target.startDate, endDate 내림차순 최대 N개
    const prevSeasons = await prisma.season.findMany({
      where: {
        status: SeasonStatus.CLOSED,
        endDate: { lt: target.startDate },
      },
      orderBy: { endDate: "desc" },
      take: lookback,
      select: { id: true },
    });
    if (prevSeasons.length === 0) throw new AppError(404, "NO_PREV_SEASON");

    // 각 시즌 actuals 를 병렬 조회
    const actualsList = await Promise.all(
      prevSeasons.map((s) => getSeasonRevenueActuals(s.id))
    );
    const n = actualsList.length;

    // 8개 필드별 평균 (반올림)
    const avg = (pick: (a: (typeof actualsList)[number]) => number) =>
      Math.round(actualsList.reduce((sum, a) => sum + pick(a), 0) / n);

    const breakdown: RevenueBreakdownDto = {
      plannedRevenueTicket:        avg((a) => a.plannedRevenueTicket),
      plannedRevenueSponsorship:   avg((a) => a.plannedRevenueSponsorship),
      // Expected 는 총액(sumBreakdown)에는 미포함 (별도 metric, ADR 0024).
      // Breakdown 에는 field 로 담아서 repo.upsert 가 persist 하도록.
      expectedRevenueSponsorship:  avg((a) => a.expectedRevenueSponsorship),
      plannedRevenueMerchandise:   avg((a) => a.plannedRevenueMerchandise),
      plannedRevenueOther:         avg((a) => a.plannedRevenueOther),
      plannedRevenueAcademyFee:    avg((a) => a.plannedRevenueAcademyFee),
      plannedRevenueBroadcast:     0,
      plannedRevenueSubsidy:       0,
      plannedRevenueParentCompany: 0,
    };

    const total = sumBreakdown(breakdown);
    const note = `최근 ${n}개 CLOSED 시즌 실적 평균 (요청 lookback=${lookback}, 시즌 ID=${prevSeasons.map((s) => s.id).join(",")})`;
    return this.repo.upsert(seasonId, total, note, breakdown);
  }

  /**
   * 지정한 단일 시즌(prevSeasonId)의 실적을 그대로 새 시즌으로 복사.
   * `POST /:seasonId/from-prev-season` 에서 사용 (수동 override).
   * N-시즌 평균은 autoFillRevenueFromPrevSeasons 사용.
   *
   * 하위 호환: 헬퍼는 SEASON_NOT_FOUND 를 던지지만 이 메서드는
   * PREV_SEASON_NOT_FOUND 로 remap 해서 이전 컨트랙트 유지.
   */
  async setFromPrevSeasonActuals(prevSeasonId: number, newSeasonId: number) {
    let actuals;
    try {
      actuals = await getSeasonRevenueActuals(prevSeasonId);
    } catch (e: any) {
      if (e?.code === "SEASON_NOT_FOUND") throw new AppError(404, "PREV_SEASON_NOT_FOUND");
      throw e;
    }
    const breakdown: RevenueBreakdownDto = { ...actuals };
    const total = sumBreakdown(breakdown);
    const note = `전년도(시즌 ${prevSeasonId}) 실적 기반 자동 생성`;
    return this.repo.upsert(newSeasonId, total, note, breakdown);
  }

  async getPnL(seasonId: number) {
    const prisma = getPrisma();

    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!season) throw new AppError(404, "SEASON_NOT_FOUND");

    const { startDate, endDate } = season;
    const financialReport = await this.repo.findBySeasonId(seasonId);

    const [
      ticketAgg, uniformAgg, otherSalesAgg,
      sponsorshipAgg, academyFeeAgg,
      payrollAgg,
      operatingGroups,
      medicalAgg,
      playerContracts,
    ] = await Promise.all([
      // 티켓 수입 (TICKET + VIP_TICKET)
      prisma.salesRecord.aggregate({
        where: { type: { in: ["TICKET", "VIP_TICKET"] as any[] }, match: { seasonId }, deletedAt: null } as any,
        _sum: { totalAmount: true },
      }),
      // 유니폼/MD 수입
      prisma.salesRecord.aggregate({
        where: { type: "UNIFORM", saleDate: { gte: startDate, lte: endDate }, deletedAt: null } as any,
        _sum: { totalAmount: true },
      }),
      // 기타 판매 수입
      prisma.salesRecord.aggregate({
        where: { type: "OTHER", saleDate: { gte: startDate, lte: endDate }, deletedAt: null } as any,
        _sum: { totalAmount: true },
      }),
      // 스폰서십 수납
      prisma.sponsorshipPayment.aggregate({
        where: { status: "PAID", paidAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
      }),
      // 아카데미 회비
      prisma.ledgerEntry.aggregate({
        where: { category: "ACADEMY_FEE", type: "INCOME", isRefund: false, createdAt: { gte: startDate, lte: endDate } },
        _sum: { amountKrw: true },
      }),
      // 스태프 급여 (PayrollRun CONFIRMED, 시즌 기간)
      prisma.payrollRun.aggregate({
        where: { status: "CONFIRMED", month: { gte: startDate, lte: endDate } },
        _sum: { grossPay: true },
      }),
      // 운영비 카테고리별 — group by categoryId (NOT NULL post-cutover); translate to code below.
      prisma.operatingExpense.groupBy({
        by: ["categoryId"],
        where: { seasonId },
        _sum: { amount: true },
      }),
      // 의무비
      prisma.medicalExpense.aggregate({
        where: { status: "APPROVED", receiptDate: { gte: startDate, lte: endDate } },
        _sum: { totalAmount: true },
      }),
      // 선수 계약 — 시즌 기간 겹치는 ACTIVE 계약
      prisma.contract.findMany({
        where: { status: "ACTIVE", startDate: { lte: endDate }, endDate: { gte: startDate } },
        select: { salary: true, startDate: true, endDate: true },
      }),
    ]);

    // 선수 연봉 시즌 비례 합산 (연봉 / 12 × 겹치는 개월 수)
    const seasonMs = endDate.getTime() - startDate.getTime();
    const seasonMonths = seasonMs / (1000 * 60 * 60 * 24 * 30.44);
    const playerSalaryTotal = playerContracts.reduce((sum, c) => {
      const overlapStart = c.startDate > startDate ? c.startDate : startDate;
      const overlapEnd = c.endDate < endDate ? c.endDate : endDate;
      if (overlapEnd <= overlapStart) return sum;
      const months = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      return sum + (c.salary / 12) * months;
    }, 0);

    const operatingByCategory: Record<string, number> = {};
    let totalOperating = 0;
    const activeCats = await this.categoryService.listAll();
    const codeById = new Map(activeCats.map((c) => [c.id, c.code]));
    for (const row of operatingGroups) {
      const amt = row._sum.amount ?? 0;
      const code = codeById.get(row.categoryId);
      if (!code) continue;
      operatingByCategory[code] = (operatingByCategory[code] ?? 0) + amt;
      totalOperating += amt;
    }

    // --- Revenue ---
    const revenueActual = {
      ticket: Number((ticketAgg._sum as any).totalAmount ?? 0),
      merchandise: Number((uniformAgg._sum as any).totalAmount ?? 0),
      other: Number((otherSalesAgg._sum as any).totalAmount ?? 0),
      sponsorship: Number(sponsorshipAgg._sum.amount ?? 0),
      academyFee: Number(academyFeeAgg._sum.amountKrw ?? 0),
      // 수동 기입 항목 — FinancialReport에서 읽음
      broadcast: financialReport?.plannedRevenueBroadcast ?? 0,
      subsidy: financialReport?.plannedRevenueSubsidy ?? 0,
      parentCompany: financialReport?.plannedRevenueParentCompany ?? 0,
    };
    const totalRevenueActual = Object.values(revenueActual).reduce((a, b) => a + b, 0);

    // --- Expenses ---
    const expenseActual = {
      playerSalary: Math.round(playerSalaryTotal),
      staffPayroll: Number(payrollAgg._sum.grossPay ?? 0),
      operating: totalOperating,
      operatingByCategory,
      medical: medicalAgg._sum.totalAmount ?? 0,
    };
    const totalExpenseActual =
      expenseActual.playerSalary +
      expenseActual.staffPayroll +
      expenseActual.operating +
      expenseActual.medical;

    const grossProfit = totalRevenueActual - totalExpenseActual;
    const profitMargin = totalRevenueActual === 0 ? 0 : Math.round((grossProfit / totalRevenueActual) * 1000) / 10;

    return {
      season: { id: season.id, name: season.name, startDate, endDate },
      plannedRevenue: financialReport?.totalRevenue ?? null,
      revenue: { ...revenueActual, total: totalRevenueActual },
      expenses: { ...expenseActual, total: totalExpenseActual },
      summary: {
        grossProfit,
        profitMargin,
        revenueVsPlan: financialReport?.totalRevenue
          ? Math.round((totalRevenueActual / financialReport.totalRevenue) * 1000) / 10
          : null,
      },
    };
  }

  /**
   * Manually override the carryOverFromPrev value on a season's
   * FinancialReport. The write always sets `carryOverOverriddenById`/
   * `-At`/`-Reason` so `applyCarryOverToNextSeason` will subsequently
   * skip this row and not clobber the user's number.
   */
  async overrideCarryOver(
    seasonId: number,
    dto: { amount: number; reason: string },
    userId: string,
  ) {
    if (!dto.reason?.trim()) throw new AppError(400, "REASON_REQUIRED");
    if (typeof dto.amount !== "number" || !Number.isFinite(dto.amount)) {
      throw new AppError(400, "INVALID_AMOUNT");
    }
    return this.repo.upsertFinancialReportCarryOver(seasonId, {
      amount: dto.amount,
      overriddenById: userId,
      reason: dto.reason.trim(),
    });
  }

  async getReportWithLedger(seasonId: number) {
    const report = await this.repo.findBySeasonId(seasonId);
    if (!report) throw new AppError(404, "FINANCIAL_REPORT_NOT_FOUND");
    const prisma = getPrisma();
    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { relatedModule: "FINANCIAL_REPORT", relatedId: report.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { ...report, ledgerEntries };
  }

  async getComparison(seasonId: number) {
    const [plan, actuals] = await Promise.all([
      this.getBudgetPlan(seasonId),
      this.repo.getActuals(seasonId),
    ]);
    // Category code comes from the ExpenseCategory FK (relation always present post-cutover).
    const comparison = plan.budgetCategoryPlans.map((c) => {
      const code = c.expenseCategory?.code ?? "";
      return {
        category: code,
        mandatoryMinimum: c.mandatoryMinimum,
        knapsackAllocated: c.knapsackAllocated,
        actual: actuals?.[code] ?? 0,
        variance: (c.knapsackAllocated ?? c.mandatoryMinimum) - (actuals?.[code] ?? 0),
      };
    });
    if (plan.playerSalaryBudget != null) {
      comparison.push({
        category: "PLAYER_SALARY",
        mandatoryMinimum: plan.playerSalaryBudget,
        knapsackAllocated: null,
        actual: actuals?.["PLAYER_SALARY"] ?? 0,
        variance: plan.playerSalaryBudget - (actuals?.["PLAYER_SALARY"] ?? 0),
      });
    }
    // Rewrite budgetCategoryPlans to expose `category` as the code string too.
    const remappedBudgetCategoryPlans = plan.budgetCategoryPlans.map((c) => ({
      ...c,
      category: c.expenseCategory?.code ?? "",
    }));
    return { ...plan, budgetCategoryPlans: remappedBudgetCategoryPlans, actuals, comparison };
  }

  private parseCSV(content: string): number {
    const lines = content.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let total = 0;
    for (const line of lines) {
      const cols = line.split(",");
      const lastCol = cols[cols.length - 1];
      if (!lastCol) continue;
      const raw = lastCol.trim().replace(/[^0-9.]/g, "");
      const amount = parseFloat(raw);
      if (!isNaN(amount) && amount > 0) total += Math.round(amount);
    }
    if (total === 0) throw new AppError(400, "CSV_NO_VALID_AMOUNTS");
    return total;
  }
}
