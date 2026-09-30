import { AppError } from "../lib/appError";
import { FIELD_TO_CATEGORY } from "./revenue-field.map";
import type { RevenueAdjustmentRepository } from "./revenue-adjustment.repo";
import type { PrismaClient, RevenueField } from "../generated/client";

export class RevenueAdjustmentService {
  constructor(
    private repo: RevenueAdjustmentRepository,
    private prisma: PrismaClient,
  ) {}

  async create(data: {
    financialReportId?: string;
    monthlyReportId?: number;
    field: RevenueField;
    delta: number;
    memo?: string;
    createdById: string;
  }) {
    if (data.delta === 0) throw new AppError(400, "DELTA_ZERO");
    const category = FIELD_TO_CATEGORY[data.field];
    return this.repo.create({
      field: data.field,
      delta: data.delta,
      createdById: data.createdById,
      ...(data.financialReportId !== undefined && { financialReportId: data.financialReportId }),
      ...(data.monthlyReportId !== undefined && { monthlyReportId: data.monthlyReportId }),
      ...(data.memo !== undefined && { memo: data.memo }),
      ...(category !== undefined && { category }),
    });
  }

  async list(params: { financialReportId?: string; monthlyReportId?: number }) {
    if (params.financialReportId !== undefined) {
      return this.repo.findByFinancialReport(params.financialReportId);
    }
    if (params.monthlyReportId !== undefined) {
      return this.repo.findByMonthlyReport(params.monthlyReportId);
    }
    throw new AppError(400, "MISSING_TARGET");
  }

  async drilldown(params: {
    field: RevenueField;
    financialReportId?: string;
    monthlyReportId?: number;
    year: number;
    month?: number;
  }) {
    const category = FIELD_TO_CATEGORY[params.field];
    const adjustments = await this.repo.findByField({
      field: params.field,
      ...(params.financialReportId !== undefined && { financialReportId: params.financialReportId }),
      ...(params.monthlyReportId !== undefined && { monthlyReportId: params.monthlyReportId }),
    });

    if (!category) {
      // External data fields (BROADCAST, SUBSIDY, PARENT_COMPANY) — adjustments only
      return { type: "adjustments" as const, items: adjustments };
    }

    // Has LedgerEntry category — fetch matching entries
    const startDate = new Date(params.year, (params.month ?? 1) - 1, 1);
    const endDate = params.month
      ? new Date(params.year, params.month, 1)
      : new Date(params.year + 1, 0, 1);

    const entries = await this.prisma.ledgerEntry.findMany({
      where: {
        category,
        type: "INCOME",
        createdAt: { gte: startDate, lt: endDate },
        isRefund: false,
        isAdjustment: false,
      },
      orderBy: { createdAt: "desc" },
    });

    return { type: "ledger" as const, items: entries, adjustments };
  }

  sumByField(target: { financialReportId?: string; monthlyReportId?: number }) {
    return this.repo.sumByField(target);
  }
}
