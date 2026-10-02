import { PrismaClient, ExpenseStatus, ExpenseCostType } from "../generated/client";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export class OperatingExpenseRepository {
  constructor(private prisma: PrismaClient) {}

  findBySeasonId(seasonId: number, clubId?: string | null) {
    return this.prisma.operatingExpense.findMany({
      where: { seasonId, deletedAt: null, ...(clubId != null && { clubId }) },
      include: {
        createdBy: { select: { id: true, username: true } },
        budgetLine: { select: { id: true, originalAmount: true, expenseCategory: { select: { code: true } } } },
        expenseCategory: { select: { code: true } },
      },
      orderBy: { date: "desc" },
    });
  }

  findById(id: string, clubId?: string | null) {
    return this.prisma.operatingExpense.findFirst({
      where: { id, ...(clubId != null && { clubId }) },
      include: {
        createdBy: { select: { id: true, username: true } },
        budgetLine: { select: { id: true, originalAmount: true, budgetHeaderId: true, expenseCategory: { select: { code: true } } } },
        expenseCategory: { select: { code: true } },
      },
    });
  }

  findBudgetLine(budgetLineId: string) {
    return this.prisma.budgetLine.findUnique({ where: { id: budgetLineId } });
  }

  async findBudgetLinesForSeasonCategory(seasonId: number, categoryId: number) {
    // ADR 0023 (#474): 편성 확정으로 v2 를 발행하면 v1 은 LOCKED 로 전이되지만,
    // budget-automation.apply 를 별도로 approve 하면 여러 APPROVED 헤더가 공존할
    // 수 있다. 자동 매칭 (auto-lookup) 은 반드시 최신 version 하나의 header 만
    // 참조해야 하므로 latest APPROVED 헤더로 필터한다.
    const latestApproved = await this.prisma.budgetHeader.findFirst({
      where: { seasonId, status: "APPROVED" },
      orderBy: { version: "desc" },
      select: { id: true },
    });
    if (!latestApproved) return [];
    return this.prisma.budgetLine.findMany({
      where: { categoryId, budgetHeaderId: latestApproved.id },
      select: { id: true, departmentId: true, originalAmount: true },
    });
  }

  /**
   * Look up an APPROVED BudgetLine matching (season, category, departmentId).
   * Used by AssetRequest dept-head approval to auto-match a line. Pass
   * `departmentId: null` explicitly to look up club-wide lines. If more than one
   * line exists for the tuple (year vs monthly split), the most specific (monthly
   * for current month, else year-only) wins.
   */
  async findBudgetLineForSeasonCategoryDept(params: {
    seasonId: number;
    categoryId: string;
    departmentId: string | null;
    date?: Date;
  }) {
    const date = params.date ?? new Date();
    const candidates = await this.prisma.budgetLine.findMany({
      where: {
        categoryId: params.categoryId,
        departmentId: params.departmentId,
        year: date.getFullYear(),
        budgetHeader: { seasonId: params.seasonId, status: "APPROVED" },
      },
      select: { id: true, originalAmount: true, month: true, year: true, departmentId: true },
    });
    if (candidates.length === 0) return null;
    const currentMonth = date.getMonth() + 1;
    const monthly = candidates.find((c) => c.month === currentMonth);
    if (monthly) return monthly;
    const yearOnly = candidates.find((c) => c.month === null);
    if (yearOnly) return yearOnly;
    return candidates[0] ?? null;
  }

  async createWithBudgetCheck(
    data: {
      seasonId: number;
      categoryId: string;
      costType?: ExpenseCostType;
      amount: number;
      date: Date;
      note?: string | null;
      createdById: string;
      budgetLineId: string;
      clubId?: string | null;
    },//TODO: 타입파일로 이동
    tx?: Tx,
  ) {
    const run = async (client: Tx) => {
      // ADR 0023 Q4: 최신 APPROVED BudgetHeader 의 category line 을 ceiling 으로
      // 사용한다. 재편성(v1 LOCKED, v2 APPROVED) 이후에도 v2 originalAmount 가
      // 실제 한도이며, 아래 지출 합산은 seasonId+categoryId 로 v1 시절 지출까지
      // 모두 포함해 오버스펜딩을 방지한다.
      const activeLine = await client.budgetLine.findFirst({
        where: {
          categoryId: data.categoryId,
          budgetHeader: { seasonId: data.seasonId, status: "APPROVED" },
        },
        orderBy: [{ budgetHeader: { version: "desc" } }],
      });
      if (!activeLine) throw new Error("BUDGET_LINE_NOT_FOUND");

      // Caller-provided budgetLineId 는 저장/감사용으로 유지하되 (호환), 검증
      // 자체는 최신 APPROVED header 의 line 을 참조한다. 정합 안 맞으면 (예: v1
      // BudgetLine 을 caller 가 넘겼는데 v2 로 재편성됨) categoryId 일치는 강제.
      const legacyLine = await client.budgetLine.findUnique({
        where: { id: data.budgetLineId },
      });
      if (legacyLine && legacyLine.categoryId !== data.categoryId) {
        throw new Error("CATEGORY_MISMATCH");
      }

      const { _sum } = await client.operatingExpense.aggregate({
        where: {
          seasonId: data.seasonId,
          categoryId: data.categoryId,
          deletedAt: null,
          status: { in: ["PENDING", "FIRST_APPROVED", "APPROVED", "PAID"] },
        },
        _sum: { amount: true },
      });
      const used = _sum.amount ?? 0;
      if (used + data.amount > activeLine.originalAmount) throw new Error("BUDGET_EXCEEDED");

      return client.operatingExpense.create({
        data: {
          seasonId: data.seasonId,
          categoryId: data.categoryId,
          ...(data.costType && { costType: data.costType }),
          amount: data.amount,
          date: data.date,
          note: data.note ?? null,
          createdById: data.createdById,
          budgetLineId: data.budgetLineId,
          status: "PENDING",
          ...(data.clubId != null && { clubId: data.clubId }),
        },
        include: {
          createdBy: { select: { id: true, username: true } },
          budgetLine: { select: { id: true, originalAmount: true, expenseCategory: { select: { code: true } } } },
          expenseCategory: { select: { code: true } },
        },
      });
    };
    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }

  updateStatus(
    id: string,
    data: Partial<{
      status: ExpenseStatus;
      firstApprovedById: string;
      firstApprovedAt: Date;
      approvedById: string;
      approvedAt: Date;
      rejectedById: string;
      rejectedAt: Date;
      rejectionReason: string;
      cancelledById: string;
      cancelledAt: Date;
      cancellationReason: string;
      paidAt: Date;
      paidById: string;
    }>//TODO 타입 DTO 파일로 이동
  ) {
    return this.prisma.operatingExpense.update({ where: { id }, data });
  }

  update(id: string, data: { amount?: number; categoryId?: string; note?: string }) {
    return this.prisma.operatingExpense.update({ where: { id }, data });
  }

  async findBudgetPlan(seasonId: number, categoryId: string) {
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      include: {
        budgetCategoryPlans: { where: { categoryId } },
      },
    });
    if (!report) return null;
    return report.budgetCategoryPlans[0] ?? null;
  }

  async sumSpendBySeasonAndCategory(seasonId: number, categoryId: string) {
    const result = await this.prisma.operatingExpense.aggregate({
      where: { seasonId, categoryId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  softDelete(id: string, reason: string) {
    return this.prisma.operatingExpense.update({
      where: { id },
      data: { deletedAt: new Date(), deletionReason: reason },
    });
  }

  purgeExpired() {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 10);
    return this.prisma.operatingExpense.deleteMany({
      where: { deletedAt: { lt: cutoff } },
    });
  }
}
