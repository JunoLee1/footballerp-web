import type { PrismaClient } from "../generated/client";

export class MonthlySettlementRepository {
  constructor(private prisma: PrismaClient) {}

  findByYearMonth(seasonId: number, year: number, month: number) {
    return this.prisma.monthlySettlementReport.findUnique({
      where: { seasonId_year_month: { seasonId, year, month } },
      include: {
        createdBy: { select: { id: true, username: true } },
        firstApprover: { select: { id: true, username: true } },
        approver: { select: { id: true, username: true } },
      },
    });
  }

  findById(id: string) {
    return this.prisma.monthlySettlementReport.findUnique({
      where: { id },
      include: {
        season: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true } },
        firstSubmittedBy: { select: { id: true, username: true } },
        firstApprover: { select: { id: true, username: true } },
        approver: { select: { id: true, username: true } },
      },
    });
  }

  findAll(seasonId?: number) {
    return this.prisma.monthlySettlementReport.findMany({
      ...(seasonId !== undefined && { where: { seasonId } }),
      include: {
        season: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true } },
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });
  }

  upsertDraft(data: {
    seasonId: number; year: number; month: number;
    totalRevenue: number; totalExpense: number; netIncome: number;
    snapshotJson: object; createdById: string;
  }) {
    return this.prisma.monthlySettlementReport.upsert({
      where: { seasonId_year_month: { seasonId: data.seasonId, year: data.year, month: data.month } },
      create: { ...data, status: "DRAFT" },
      update: {
        totalRevenue: data.totalRevenue,
        totalExpense: data.totalExpense,
        netIncome: data.netIncome,
        snapshotJson: data.snapshotJson,
        status: "DRAFT",
        rejectionReason: null,
      },
    });
  }

  updateNote(id: string, note: string) {
    return this.prisma.monthlySettlementReport.update({ where: { id }, data: { note } });
  }

  updateStatus(id: string, data: {
    status: "PENDING_FIRST" | "FIRST_APPROVED" | "APPROVED" | "REJECTED" | "DRAFT";
    firstSubmittedById?: string | null;
    firstSubmittedAt?: Date | null;
    firstApproverId?: string | null;
    firstApprovedAt?: Date | null;
    approverId?: string | null;
    approvedAt?: Date | null;
    rejectionReason?: string | null;
  }) {
    return this.prisma.monthlySettlementReport.update({ where: { id }, data });
  }

  lockAcademyFees(year: number, month: number) {
    return this.prisma.academyFee.updateMany({
      where: { year, month, status: "PAID" },
      data: { status: "LOCKED" },
    });
  }

  createPeriodLock(year: number, month: number, lockedById: string) {
    return this.prisma.ledgerPeriodLock.upsert({
      where: { year_month: { year, month } },
      create: { year, month, lockedById },
      update: {},
    });
  }
}
