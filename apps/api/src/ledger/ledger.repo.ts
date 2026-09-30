import type { PrismaClient } from "../generated/client";
import type { CreateLedgerEntryDto, LedgerListQuery } from "./dto/ledger.dto";

export class LedgerRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: LedgerListQuery) {
    return this.prisma.ledgerEntry.findMany({
      where: {
        ...(query.type && { type: query.type }),
        ...(query.category && { category: query.category as any }),
        ...(query.from || query.to
          ? { createdAt: { ...(query.from && { gte: new Date(query.from) }), ...(query.to && { lte: new Date(query.to) }) } }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string) {
    return this.prisma.ledgerEntry.findUnique({ where: { id } });
  }

  markReversed(originalId: string, refundId: string) {
    return this.prisma.ledgerEntry.update({
      where: { id: originalId },
      data: { reversedById: refundId },
    });
  }

  // BS2: mark a SalesRecord as refunded when its linked ledger entry is reversed
  markSalesRecordRefunded(salesRecordId: number) {
    return this.prisma.salesRecord.update({
      where: { id: salesRecordId },
      data: { isRefunded: true, refundedAt: new Date() } as any,
    });
  }

  isPeriodLocked(year: number, month: number): Promise<boolean> {
    return this.prisma.ledgerPeriodLock
      .findUnique({ where: { year_month: { year, month } } })
      .then((r) => r !== null);
  }

  lockPeriod(year: number, month: number, lockedById: string) {
    return this.prisma.ledgerPeriodLock.create({
      data: { year, month, lockedById },
    });
  }

  create(data: CreateLedgerEntryDto & { createdById: string; amountKrw: number }) {
    return this.prisma.ledgerEntry.create({
      data: {
        type: data.type,
        category: data.category as any,
        amount: data.amount,
        currency: data.currency ?? "KRW",
        exchangeRate: data.exchangeRate ?? 1,
        amountKrw: data.amountKrw,
        isRefund: data.isRefund ?? false,
        ...(data.description && { description: data.description }),
        ...(data.relatedModule && { relatedModule: data.relatedModule }),
        ...(data.relatedId !== undefined && { relatedId: data.relatedId }),
        createdById: data.createdById,
      },
    });
  }
}
