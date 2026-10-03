import type { PrismaClient } from "../generated/client";
import type { SalesType } from "../generated/enums";
import type { CreateSalesRecordDto } from "./dto/sales.dto";

export class SalesRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(extraWhere?: Record<string, unknown>) {
    return this.prisma.salesRecord.findMany({
      where: { deletedAt: null, ...extraWhere },
      orderBy: { saleDate: "desc" },
      include: { match: { select: { id: true, homeTeamName: true, awayTeamName: true, date: true } } },
    });
  }

  findByMatch(matchId: string) {
    return this.prisma.salesRecord.findMany({
      where: { matchId, type: "TICKET" },
      orderBy: { saleDate: "desc" },
    });
  }

  create(data: CreateSalesRecordDto & { totalAmount: number; createdById: string }) {
    return this.prisma.salesRecord.create({
      data: {
        type: data.type,
        quantity: data.quantity,
        unitPrice: data.unitPrice,
        totalAmount: data.totalAmount,
        currency: data.currency ?? "KRW",
        saleDate: new Date(data.saleDate),
        ...(data.description && { description: data.description }),
        ...(data.matchId && { matchId: data.matchId }),
        createdById: data.createdById,
      },
    });
  }

  update(id: string, data: { quantity?: number; unitPrice?: number; totalAmount?: number; saleDate?: Date; description?: string | null; updatedById: string }) {
    return this.prisma.salesRecord.update({
      where: { id },
      data: {
        updatedById: data.updatedById,
        ...(data.quantity !== undefined && { quantity: data.quantity }),
        ...(data.unitPrice !== undefined && { unitPrice: data.unitPrice }),
        ...(data.totalAmount !== undefined && { totalAmount: data.totalAmount }),
        ...(data.saleDate !== undefined && { saleDate: data.saleDate }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  }

  delete(id: string) {
    return this.prisma.salesRecord.delete({ where: { id } });
  }

  groupByType() {
    return this.prisma.salesRecord.groupBy({
      by: ["type"],
      _sum: { totalAmount: true },
    });
  }

  async ticketSummaryByMatch(seasonId: number, homeTeamName?: string) {
    const matches = await this.prisma.match.findMany({
      where: { seasonId, ...(homeTeamName && { homeTeamName }) },
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        homeTeamName: true,
        awayTeamName: true,
        capacity: true,
        salesRecords: {
          where: {
            type: { in: ["TICKET", "VIP_TICKET", "COMPLIMENTARY"] },
            deletedAt: null,
          },
          select: { quantity: true, totalAmount: true, status: true, type: true },
        },
      },
    });

    return matches.map((m) => {
      const completed = m.salesRecords.filter((r) => r.status === "COMPLETED" || !r.status);
      const cancelled = m.salesRecords.filter((r) => r.status === "CANCELLED");
      const refunded = m.salesRecords.filter((r) => r.status === "REFUNDED");
      const complimentary = m.salesRecords.filter((r) => r.type === "COMPLIMENTARY");

      const totalSold = completed.reduce((s: number, r) => s + r.quantity, 0);
      const cancelledQty = cancelled.reduce((s: number, r) => s + r.quantity, 0);
      const refundedQty = refunded.reduce((s: number, r) => s + r.quantity, 0);
      const complimentaryQty = complimentary.reduce((s: number, r) => s + r.quantity, 0);
      const netSold = totalSold - cancelledQty - refundedQty;
      const totalAmount = completed.reduce((s: number, r) => s + Number(r.totalAmount), 0);
      const capacity = m.capacity ?? null;
      const sellRate = capacity && capacity > 0 ? Math.round((netSold / capacity) * 1000) / 10 : null;

      return {
        matchId: m.id,
        date: m.date.toISOString(),
        homeTeamName: m.homeTeamName,
        awayTeamName: m.awayTeamName,
        totalSold,
        netSold,
        cancelled: cancelledQty,
        refunded: refundedQty,
        complimentary: complimentaryQty,
        totalAmount,
        capacity,
        sellRate,
        // keep for backward compat
        totalQuantity: totalSold,
      };
    });
  }

  async seasonTicketTotal(seasonId: number): Promise<number> {
    const result = await this.prisma.salesRecord.aggregate({
      where: { type: { in: ["TICKET", "VIP_TICKET", "COMPLIMENTARY"] }, match: { seasonId }, deletedAt: null },
      _sum: { totalAmount: true },
    });
    return Number((result._sum).totalAmount ?? 0);
  }

  findTicketsBySeason(seasonId: number) {
    return this.prisma.salesRecord.findMany({
      where: {
        type: { in: ["TICKET", "VIP_TICKET", "COMPLIMENTARY"] },
        match: { seasonId },
        deletedAt: null,
      },
      orderBy: { saleDate: "desc" },
      include: { match: { select: { id: true, homeTeamName: true, awayTeamName: true, date: true } } },
    });
  }

  findWithFilters(filters: {
    type?: string;
    matchId?: string;
    fromDate?: string;
    toDate?: string;
    minAmount?: number;
    maxAmount?: number;
  }) {
    return this.prisma.salesRecord.findMany({
      where: {
        ...(filters.type && { type: filters.type as SalesType }),
        ...(filters.matchId && { matchId: filters.matchId }),
        ...(filters.fromDate && { saleDate: { gte: new Date(filters.fromDate) } }),
        ...(filters.toDate && { saleDate: { lte: new Date(filters.toDate) } }),
        ...(filters.minAmount !== undefined && { totalAmount: { gte: filters.minAmount } }),
        ...(filters.maxAmount !== undefined && { totalAmount: { lte: filters.maxAmount } }),
      },
      include: { match: { select: { id: true, homeTeamName: true, awayTeamName: true, date: true } } },
      orderBy: { saleDate: "desc" },
    });
  }
}
