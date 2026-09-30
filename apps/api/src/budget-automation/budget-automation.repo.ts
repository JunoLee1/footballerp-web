import { PrismaClient } from "../generated/client";

export class BudgetAutomationRepository {
  constructor(private prisma: PrismaClient) {}

  getTargetSeason(seasonId: number) {
    return this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { id: true, name: true, startDate: true },
    });
  }

  getPastSeasons(beforeDate: Date, limit: number) {
    return this.prisma.season.findMany({
      where: { startDate: { lt: beforeDate } },
      orderBy: { startDate: "desc" },
      take: limit,
      select: { id: true, name: true, startDate: true },
    });
  }

  getExpenseActualsByCategory(seasonIds: number[]) {
    // Aggregate by categoryId (post-cutover); callers translate id → code.
    return this.prisma.operatingExpense.groupBy({
      by: ["seasonId", "categoryId"],
      where: {
        seasonId: { in: seasonIds },
        status: { in: ["APPROVED", "PAID"] },
        deletedAt: null,
      },
      _sum: { amount: true },
    });
  }

  async getLatestApprovedBudgetLines(seasonId: number) {
    const header = await this.prisma.budgetHeader.findFirst({
      where: { seasonId, status: { in: ["APPROVED", "LOCKED"] } },
      include: { lines: { select: { categoryId: true, originalAmount: true } } },
      orderBy: { createdAt: "desc" },
    });
    return header?.lines ?? [];
  }

  createHeaderWithLines(
    data: {
      seasonId: number;
      name: string;
      totalBudget: number;
      note?: string;
      createdById: string;
    },
    lines: Array<{ categoryId: number; originalAmount: number; year: number }>
  ) {
    return this.prisma.$transaction(async (tx) => {
      // BudgetHeader @@unique([seasonId, version]) — 같은 시즌 재실행 시 version 자동 증가
      const latest = await tx.budgetHeader.findFirst({
        where: { seasonId: data.seasonId },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      const header = await tx.budgetHeader.create({
        data: {
          seasonId: data.seasonId,
          version: nextVersion,
          name: data.name,
          totalBudget: data.totalBudget,
          note: data.note ?? null,
          createdById: data.createdById,
        },
      });
      await tx.budgetLine.createMany({
        data: lines.map((l) => ({
          budgetHeaderId: header.id,
          categoryId: l.categoryId,
          originalAmount: l.originalAmount,
          year: l.year,
        })),
      });
      return tx.budgetHeader.findUniqueOrThrow({
        where: { id: header.id },
        include: { lines: true },
      });
    });
  }
}
