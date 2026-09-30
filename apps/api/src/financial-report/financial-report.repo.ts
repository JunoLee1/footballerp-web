import { PrismaClient } from "../generated/client";

export interface RevenueBreakdownDto {
  plannedRevenueTicket?: number;
  plannedRevenueSponsorship?: number;      // Actual (cash)
  expectedRevenueSponsorship?: number;     // Expected (accrual, ADR 0024) — NOT summed into total
  plannedRevenueBroadcast?: number;
  plannedRevenueMerchandise?: number;
  plannedRevenueSubsidy?: number;
  plannedRevenueParentCompany?: number;
  plannedRevenueAcademyFee?: number;
  plannedRevenueOther?: number;
}

// Category descriptor shared with services — code from wire, id from cache lookup.
export interface CategoryRef {
  code: string;
  id: number;
}

export function sumBreakdown(b: RevenueBreakdownDto): number {
  return (
    (b.plannedRevenueTicket ?? 0) +
    (b.plannedRevenueSponsorship ?? 0) +
    (b.plannedRevenueBroadcast ?? 0) +
    (b.plannedRevenueMerchandise ?? 0) +
    (b.plannedRevenueSubsidy ?? 0) +
    (b.plannedRevenueParentCompany ?? 0) +
    (b.plannedRevenueAcademyFee ?? 0) +
    (b.plannedRevenueOther ?? 0)
  );
}

export interface UpsertBudgetPlanDto {
  totalOperatingBudget: number;
  contingencyReserve: number;
  playerSalaryBudget?: number;
  categories: {
    categoryId: number;
    mandatoryMinimum: number;
    sortOrder: number;
    tiers: { name: string; cost: number; value: number; sortOrder: number }[];
  }[];
}

export class FinancialReportRepository {
  constructor(private prisma: PrismaClient) {}

  async upsert(seasonId: number, totalRevenue: number, note?: string, breakdown?: RevenueBreakdownDto, changedById?: string) {
    const noteVal = note ?? null;
    const breakdownData = breakdown
      ? {
          plannedRevenueTicket: breakdown.plannedRevenueTicket ?? 0,
          plannedRevenueSponsorship: breakdown.plannedRevenueSponsorship ?? 0,
          // Expected 는 nullable 이므로 undefined 그대로 두면 Prisma 가 SET 안 함.
          // (breakdown 에 undefined 로 오면 field 를 건드리지 않고, 명시 값이면 설정)
          ...(breakdown.expectedRevenueSponsorship !== undefined
            ? { expectedRevenueSponsorship: breakdown.expectedRevenueSponsorship }
            : {}),
          plannedRevenueBroadcast: breakdown.plannedRevenueBroadcast ?? 0,
          plannedRevenueMerchandise: breakdown.plannedRevenueMerchandise ?? 0,
          plannedRevenueSubsidy: breakdown.plannedRevenueSubsidy ?? 0,
          plannedRevenueParentCompany: breakdown.plannedRevenueParentCompany ?? 0,
          plannedRevenueAcademyFee: breakdown.plannedRevenueAcademyFee ?? 0,
          plannedRevenueOther: breakdown.plannedRevenueOther ?? 0,
        }
      : {};

    // 수동 입력 3개 필드의 기존 값 조회 (변경 이력 기록용)
    const before = changedById
      ? await this.prisma.financialReport.findUnique({
          where: { seasonId },
          select: { id: true, plannedRevenueBroadcast: true, plannedRevenueSubsidy: true, plannedRevenueParentCompany: true },
        })
      : null;

    const result = await (this.prisma.financialReport as any).upsert({
      where: { seasonId },
      create: { seasonId, totalRevenue, note: noteVal, ...breakdownData },
      update: { totalRevenue, note: noteVal, ...breakdownData },
    });

    // 변경된 필드만 로그 생성
    if (changedById && before && breakdown) {
      const TRACKED = ["plannedRevenueBroadcast", "plannedRevenueSubsidy", "plannedRevenueParentCompany"] as const;
      const logs = TRACKED.flatMap((field) => {
        const oldVal = Number((before as any)[field] ?? 0);
        const newVal = Number((breakdownData as any)[field] ?? 0);
        if (oldVal === newVal) return [];
        return [{ financialReportId: before.id, field, oldValue: oldVal, newValue: newVal, changedById }];
      });
      if (logs.length > 0) {
        await this.prisma.financialReportRevenueLog.createMany({ data: logs as any });
      }
    }

    return result;
  }

  async findBySeasonId(seasonId: number) {
    return this.prisma.financialReport.findUnique({ where: { seasonId } });
  }

  async upsertFinancialReportCarryOver(
    seasonId: number,
    data: { amount: number; overriddenById: string; reason: string },
  ) {
    return this.prisma.financialReport.upsert({
      where: { seasonId },
      create: {
        seasonId,
        totalRevenue: 0,
        carryOverFromPrev: data.amount,
        carryOverOverriddenById: data.overriddenById,
        carryOverOverriddenAt: new Date(),
        carryOverOverrideReason: data.reason,
      },
      update: {
        carryOverFromPrev: data.amount,
        carryOverOverriddenById: data.overriddenById,
        carryOverOverriddenAt: new Date(),
        carryOverOverrideReason: data.reason,
      },
      select: {
        seasonId: true,
        carryOverFromPrev: true,
        carryOverOverriddenById: true,
        carryOverOverriddenAt: true,
        carryOverOverrideReason: true,
      },
    });
  }

  async upsertBudgetPlan(seasonId: number, dto: UpsertBudgetPlanDto) {
    const report = await this.prisma.financialReport.upsert({
      where: { seasonId },
      create: { seasonId, totalRevenue: 0, totalOperatingBudget: dto.totalOperatingBudget, contingencyReserve: dto.contingencyReserve, playerSalaryBudget: dto.playerSalaryBudget ?? null },
      update: { totalOperatingBudget: dto.totalOperatingBudget, contingencyReserve: dto.contingencyReserve, playerSalaryBudget: dto.playerSalaryBudget ?? null },
      select: { id: true },
    });

    for (const cat of dto.categories) {
      const plan = await this.prisma.budgetCategoryPlan.upsert({
        where: { financialReportId_categoryId: { financialReportId: report.id, categoryId: cat.categoryId } },
        create: {
          financialReportId: report.id,
          categoryId: cat.categoryId,
          mandatoryMinimum: cat.mandatoryMinimum,
          sortOrder: cat.sortOrder,
        },
        update: {
          mandatoryMinimum: cat.mandatoryMinimum,
          sortOrder: cat.sortOrder,
        },
        select: { id: true },
      });

      await this.prisma.budgetTier.deleteMany({ where: { categoryPlanId: plan.id } });
      if (cat.tiers.length > 0) {
        await this.prisma.budgetTier.createMany({
          data: cat.tiers.map((t) => ({
            categoryPlanId: plan.id,
            name: t.name,
            cost: t.cost,
            value: t.value,
            sortOrder: t.sortOrder,
          })),
        });
      }
    }

    return this.getBudgetPlan(seasonId);
  }

  async getBudgetPlan(seasonId: number) {
    return this.prisma.financialReport.findUnique({
      where: { seasonId },
      include: {
        budgetCategoryPlans: {
          include: {
            tiers: { orderBy: { sortOrder: "asc" } },
            expenseCategory: { select: { code: true, label: true, sortOrder: true } },
          },
          orderBy: { sortOrder: "asc" },
        },
        overrideLogs: {
          include: { expenseCategory: { select: { code: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });
  }

  async saveOptimizeResult(
    reportId: string,
    selections: { tierId: number; categoryPlanId: string; allocated: number }[]
  ) {
    await this.prisma.budgetTier.updateMany({
      where: { categoryPlan: { financialReportId: reportId } },
      data: { isSelected: false },
    });
    for (const sel of selections) {
      await this.prisma.budgetTier.update({
        where: { id: sel.tierId },
        data: { isSelected: true },
      });
      await this.prisma.budgetCategoryPlan.update({
        where: { id: sel.categoryPlanId },
        data: { knapsackAllocated: sel.allocated },
      });
    }
  }

  async addOverrideLog(
    reportId: string,
    categoryId: number,
    amount: number,
    reason: string,
    createdById: string
  ) {
    return this.prisma.budgetOverrideLog.create({
      data: { financialReportId: reportId, categoryId, amount, reason, createdById },
    });
  }

  async getRevenueLogs(seasonId: number) {
    const report = await this.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true },
    });
    if (!report) return [];
    return this.prisma.financialReportRevenueLog.findMany({
      where: { financialReportId: report.id },
      include: { changedBy: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async getPayrollByMonth(seasonId: number) {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { startDate: true, endDate: true },
    });
    if (!season) return [];

    const rows = await this.prisma.payrollRun.groupBy({
      by: ["month"],
      where: { status: "CONFIRMED", month: { gte: season.startDate, lte: season.endDate } },
      _sum: { grossPay: true },
      _count: { id: true },
      orderBy: { month: "asc" },
    });

    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      grossPay: Number(r._sum.grossPay ?? 0),
      count: r._count.id,
    }));
  }

  async findOverrideLog(id: number) {
    return this.prisma.budgetOverrideLog.findUnique({ where: { id } });
  }

  async approveOverrideLog(id: number, reviewerId: string) {
    return this.prisma.budgetOverrideLog.update({
      where: { id },
      data: { status: "APPROVED", reviewedById: reviewerId, reviewedAt: new Date() },
    });
  }

  async rejectOverrideLog(id: number, reviewerId: string, reviewNote: string) {
    return this.prisma.budgetOverrideLog.update({
      where: { id },
      data: { status: "REJECTED", reviewedById: reviewerId, reviewedAt: new Date(), reviewNote },
    });
  }

  async getActuals(seasonId: number) {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { startDate: true, endDate: true },
    });
    if (!season) return null;

    const [medical, operating, playerContracts] = await Promise.all([
      this.prisma.medicalExpense.aggregate({
        where: { status: "APPROVED", receiptDate: { gte: season.startDate, lte: season.endDate } },
        _sum: { totalAmount: true },
      }),
      // Group by categoryId (NOT NULL post-cutover); translate to code below.
      this.prisma.operatingExpense.groupBy({
        by: ["categoryId"],
        where: { seasonId },
        _sum: { amount: true },
      }),
      this.prisma.contract.findMany({
        where: { status: "ACTIVE", startDate: { lte: season.endDate }, endDate: { gte: season.startDate } },
        select: { salary: true, startDate: true, endDate: true },
      }),
    ]);

    // Preload category code lookup for translating categoryId → code
    const catRows = await this.prisma.expenseCategory.findMany({ select: { id: true, code: true } });
    const codeById = new Map(catRows.map((r) => [r.id, r.code]));

    const playerSalaryActual = playerContracts.reduce((sum, c) => {
      const overlapStart = c.startDate > season.startDate ? c.startDate : season.startDate;
      const overlapEnd = c.endDate < season.endDate ? c.endDate : season.endDate;
      if (overlapEnd <= overlapStart) return sum;
      const months = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
      return sum + (c.salary / 12) * months;
    }, 0);

    const result: Record<string, number> = {
      MEDICAL: medical._sum?.totalAmount ?? 0,
      PLAYER_SALARY: Math.round(playerSalaryActual),
    };
    for (const row of operating) {
      const code = codeById.get(row.categoryId);
      if (!code) continue;
      result[code] = (result[code] ?? 0) + (row._sum?.amount ?? 0);
    }
    return result;
  }
}
