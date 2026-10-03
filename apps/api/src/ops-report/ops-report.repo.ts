import { PrismaClient } from "../generated/client";

export interface OpsSnapshotData {
  feeCollectionRate: number;
  feeDelinquencyRate: number;
  monthlySettlementRate: number;
  budgetExecutionRate: number;
  overrideCount: number;
  registrationRate: number;
  attendanceRate: number;
  noticeReadRate: number;
  ticketRevenue?: number;
  ticketSalesCount?: number;
}

export class OpsReportRepository {
  constructor(private prisma: PrismaClient) {}

  async upsertOpsSnapshot(seasonId: number, year: number, month: number, data: OpsSnapshotData) {
    return this.prisma.monthlyOperationsSnapshot.upsert({
      where: { seasonId_year_month: { seasonId, year, month } },
      update: { snapshotData: data as object, updatedAt: new Date() },
      create: { seasonId, year, month, snapshotData: data as object },
    });
  }

  async findOpsSnapshot(seasonId: number, year: number, month: number) {
    return this.prisma.monthlyOperationsSnapshot.findUnique({
      where: { seasonId_year_month: { seasonId, year, month } },
    });
  }

  async findOpsSnapshotsBySeason(seasonId: number) {
    return this.prisma.monthlyOperationsSnapshot.findMany({
      where: { seasonId },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
  }

  async upsertBudgetSnapshot(
    seasonId: number, year: number, month: number,
    snapshotData: object, totalBudget: number, totalActual: number//TODO: DTO 파일로 이동
  ) {
    return this.prisma.monthlyBudgetSnapshot.upsert({ //TODO: upsert 보단 tx rhals
      where: { seasonId_year_month: { seasonId, year, month } },
      update: { snapshotData, totalBudget, totalActual, updatedAt: new Date() },
      create: { seasonId, year, month, snapshotData, totalBudget, totalActual },
    });
  }

  async findBudgetSnapshot(seasonId: number, year: number, month: number) {
    return this.prisma.monthlyBudgetSnapshot.findUnique({
      where: { seasonId_year_month: { seasonId, year, month } },
    });
  }

  async findBudgetSnapshotsBySeason(seasonId: number) {
    return this.prisma.monthlyBudgetSnapshot.findMany({
      where: { seasonId },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
  }
}
