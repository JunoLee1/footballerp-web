import type { PrismaClient, RevenueField } from "../generated/client";

export class RevenueAdjustmentRepository {
  constructor(private prisma: PrismaClient) {}

  findByFinancialReport(financialReportId: string) {
    return this.prisma.revenueAdjustment.findMany({
      where: { financialReportId },
      include: { createdBy: { select: { username: true } }, ledgerEntry: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findByMonthlyReport(monthlyReportId: number) {
    return this.prisma.revenueAdjustment.findMany({
      where: { monthlyReportId },
      include: { createdBy: { select: { username: true } }, ledgerEntry: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findByField(params: {
    financialReportId?: string;
    monthlyReportId?: number;
    field: RevenueField;
  }) {
    return this.prisma.revenueAdjustment.findMany({
      where: {
        field: params.field,
        ...(params.financialReportId !== undefined && { financialReportId: params.financialReportId }),
        ...(params.monthlyReportId !== undefined && { monthlyReportId: params.monthlyReportId }),
      },
      include: { createdBy: { select: { username: true } }, ledgerEntry: true },
      orderBy: { createdAt: "desc" },
    });
  }

  sumByField(target: { financialReportId?: string; monthlyReportId?: number }) {
    return this.prisma.revenueAdjustment.groupBy({
      by: ["field"],
      where: {
        ...(target.financialReportId !== undefined && { financialReportId: target.financialReportId }),
        ...(target.monthlyReportId !== undefined && { monthlyReportId: target.monthlyReportId }),
      },
      _sum: { delta: true },
    });
  }

  async create(data: {
    financialReportId?: string;
    monthlyReportId?: number;
    field: RevenueField;
    delta: number;
    memo?: string;
    createdById: string;
    category?: import("../generated/client").LedgerEntryCategory;
  }) {
    return this.prisma.$transaction(async (tx) => {
      let ledgerEntryId: number | undefined;
      if (data.category) {
        const le = await tx.ledgerEntry.create({
          data: {
            type: data.delta > 0 ? "INCOME" : "EXPENSE",
            category: data.category,
            amount: Math.abs(data.delta),
            amountKrw: Math.abs(data.delta),
            description: `수익보정[${data.field}]${data.memo ? ` ${data.memo}` : ""}`,
            createdById: data.createdById,
            isAdjustment: true,
          },
        });
        ledgerEntryId = le.id;
      }
      return tx.revenueAdjustment.create({
        data: {
          ...(data.financialReportId !== undefined && { financialReportId: data.financialReportId }),
          ...(data.monthlyReportId !== undefined && { monthlyReportId: data.monthlyReportId }),
          field: data.field,
          delta: data.delta,
          ...(data.memo !== undefined && { memo: data.memo }),
          createdById: data.createdById,
          ...(ledgerEntryId !== undefined && { ledgerEntryId }),
        },
        include: { createdBy: { select: { username: true } }, ledgerEntry: true },
      });
    });
  }
}
