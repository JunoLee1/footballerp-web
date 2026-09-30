import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import type { MonthlySettlementRepository } from "./monthly-settlement.repo";

export class MonthlySettlementService {
  constructor(
    private repo: MonthlySettlementRepository,
    private prisma: PrismaClient,
  ) {}

  async generate(seasonId: number, year: number, month: number, createdById: string) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const [revenueRows, expenseRows, budgetPlans, expenseCategories] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ["category"],
        where: {
          type: "INCOME",
          createdAt: { gte: startDate, lt: endDate },
          isRefund: false,
        },
        _sum: { amountKrw: true },
      }),
      this.prisma.operatingExpense.groupBy({
        by: ["categoryId"],
        where: {
          date: { gte: startDate, lt: endDate },
          deletedAt: null,
        },
        _sum: { amount: true },
      }),
      this.prisma.budgetCategoryPlan.findMany({
        where: { financialReport: { seasonId } },
      }),
      this.prisma.expenseCategory.findMany({ select: { id: true, code: true } }),
    ]);

    const categoryCode = new Map(expenseCategories.map((c) => [c.id, c.code]));

    const revenue: Record<string, number> = {};
    for (const row of revenueRows) {
      revenue[row.category] = row._sum?.amountKrw ? Number(row._sum.amountKrw.toString()) : 0;
    }

    const expenses: Record<string, number> = {};
    for (const row of expenseRows) {
      const code = categoryCode.get(row.categoryId);
      if (!code) continue;
      expenses[code] = row._sum?.amount ?? 0;
    }

    const budgetComparison: Record<string, { budget: number; actual: number; variance: number }> = {};
    for (const plan of budgetPlans) {
      const code = categoryCode.get(plan.categoryId);
      if (!code) continue;
      const actual = expenses[code] ?? 0;
      const budget = plan.mandatoryMinimum;
      budgetComparison[code] = {
        budget,
        actual,
        variance: actual - budget,
      };
    }

    const totalRevenue = Object.values(revenue).reduce((acc, v) => acc + v, 0);
    const totalExpense = Object.values(expenses).reduce((acc, v) => acc + v, 0);
    const netIncome = totalRevenue - totalExpense;

    const snapshotJson = {
      revenue,
      expenses,
      budgetComparison,
      pnl: { totalRevenue, totalExpense, netIncome },
    };

    // Upsert the draft first so we have a report.id for adjustment lookup
    const report = await this.repo.upsertDraft({
      seasonId,
      year,
      month,
      totalRevenue,
      totalExpense,
      netIncome,
      snapshotJson,
      createdById,
    });

    // Apply any existing RevenueAdjustments for this report
    const adjustmentSum = await this.prisma.revenueAdjustment.aggregate({
      where: { monthlyReportId: report.id },
      _sum: { delta: true },
    });
    const adjTotal = adjustmentSum._sum.delta ? Number(adjustmentSum._sum.delta.toString()) : 0;

    if (adjTotal !== 0) {
      const adjustedRevenue = totalRevenue + adjTotal;
      const adjustedNetIncome = adjustedRevenue - totalExpense;
      return this.prisma.monthlySettlementReport.update({
        where: { id: report.id },
        data: {
          totalRevenue: adjustedRevenue,
          netIncome: adjustedNetIncome,
        },
      });
    }

    return report;
  }

  async submitFirst(id: string, userId: string) {
    const report = await this.repo.findById(id);
    if (!report) throw new AppError(404, "SETTLEMENT_NOT_FOUND");
    if (report.status !== "DRAFT") throw new AppError(400, "SETTLEMENT_NOT_DRAFT");

    return this.repo.updateStatus(id, {
      status: "PENDING_FIRST",
      firstSubmittedById: userId,
      firstSubmittedAt: new Date(),
    });
  }

  async approveFirst(id: string, userId: string) {
    const report = await this.repo.findById(id);
    if (!report) throw new AppError(404, "SETTLEMENT_NOT_FOUND");
    if (report.status !== "PENDING_FIRST") throw new AppError(400, "SETTLEMENT_NOT_PENDING_FIRST");

    return this.repo.updateStatus(id, {
      status: "FIRST_APPROVED",
      firstApproverId: userId,
      firstApprovedAt: new Date(),
    });
  }

  async approve(id: string, userId: string) {
    const report = await this.repo.findById(id);
    if (!report) throw new AppError(404, "SETTLEMENT_NOT_FOUND");
    if (report.status !== "FIRST_APPROVED") throw new AppError(400, "SETTLEMENT_NOT_FIRST_APPROVED");

    const updated = await this.repo.updateStatus(id, {
      status: "APPROVED",
      approverId: userId,
      approvedAt: new Date(),
    });

    await Promise.all([
      this.repo.lockAcademyFees(report.year, report.month),
      this.repo.createPeriodLock(report.year, report.month, userId),
    ]);

    return updated;
  }

  async reject(id: string, reason: string) {
    const report = await this.repo.findById(id);
    if (!report) throw new AppError(404, "SETTLEMENT_NOT_FOUND");
    if (report.status !== "PENDING_FIRST" && report.status !== "FIRST_APPROVED") {
      throw new AppError(400, "SETTLEMENT_NOT_REJECTABLE");
    }

    return this.repo.updateStatus(id, {
      status: "DRAFT",
      rejectionReason: reason,
      firstSubmittedById: null,
      firstSubmittedAt: null,
      firstApproverId: null,
      firstApprovedAt: null,
      approverId: null,
      approvedAt: null,
    });
  }

  async updateNote(id: string, note: string) {
    const report = await this.repo.findById(id);
    if (!report) throw new AppError(404, "SETTLEMENT_NOT_FOUND");
    if (report.status !== "DRAFT" && report.status !== "PENDING_FIRST") {
      throw new AppError(400, "SETTLEMENT_NOT_EDITABLE");
    }
    return this.repo.updateNote(id, note);
  }

  getById(id: string) {
    return this.repo.findById(id);
  }

  getAll(seasonId?: number) {
    return this.repo.findAll(seasonId);
  }

  getForExport(id: string) {
    return this.repo.findById(id);
  }
}
