import { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { formatLedgerDescription } from "../lib/ledger-formatter";
import type { SalesRepository } from "./sales.repo";
import type { CreateSalesRecordDto } from "./dto/sales.dto";

const FC_SEOUL = "FC Seoul";

export class SalesService {
  constructor(
    private repo: SalesRepository,
    private prisma: PrismaClient,
  ) {}

  findAll() { return this.repo.findAll({ deletedAt: null } as any); }

  findTicketsBySeason(seasonId: number) { return this.repo.findTicketsBySeason(seasonId); }

  async findByMatch(matchId: number) {
    return this.repo.findByMatch(matchId);
  }

  async create(dto: CreateSalesRecordDto, createdById: string) {
    if (dto.quantity <= 0) throw new AppError(400, "NEGATIVE_SALES_VALUE");
    if (dto.unitPrice < 0 || (dto.unitPrice === 0 && (dto.type as string) !== "COMPLIMENTARY")) {
      throw new AppError(400, "NEGATIVE_SALES_VALUE");
    }

    // JO6: COMPLIMENTARY tickets require a description explaining the reason
    if ((dto.type as string) === "COMPLIMENTARY" && !dto.description) {
      throw new AppError(400, "COMPLIMENTARY_TICKET_REASON_REQUIRED");
    }

    let matchHomeTeamName: string | undefined;
    let matchAwayTeamName: string | undefined;

    const totalAmount = dto.quantity * dto.unitPrice;

    const record = await this.prisma.$transaction(async (tx) => {
      // BUG-2: capacity 체크를 트랜잭션 안으로 이동 — race condition 방지
      // JO3: COMPLIMENTARY/VIP_TICKET도 좌석 점유 → 전체 티켓 타입 포함
      const isTicketType = (t: string) =>
        t === "TICKET" || t === "VIP_TICKET" || t === "COMPLIMENTARY";

      if (isTicketType(dto.type as string)) {
        if (!dto.matchId) throw new AppError(400, "MATCH_ID_REQUIRED_FOR_TICKET");
        const match = await tx.match.findUnique({
          where: { id: dto.matchId },
          select: { homeTeamName: true, awayTeamName: true, capacity: true },
        });
        if (!match) throw new AppError(404, "MATCH_NOT_FOUND");
        if (match.homeTeamName !== FC_SEOUL) throw new AppError(400, "AWAY_MATCH_TICKET_NOT_ALLOWED");
        matchHomeTeamName = match.homeTeamName;
        matchAwayTeamName = match.awayTeamName;

        if (match.capacity) {
          const sold = await tx.salesRecord.aggregate({
            where: { matchId: dto.matchId, type: { in: ["TICKET", "VIP_TICKET", "COMPLIMENTARY"] as any[] }, deletedAt: null } as any,
            _sum: { quantity: true },
          });
          const soldQty = Number((sold._sum as any).quantity ?? 0);
          if (soldQty + dto.quantity > match.capacity) {
            throw new AppError(400, "MATCH_CAPACITY_EXCEEDED");
          }
        }
      }

      // BS6: per-match complimentary ticket limit from ClubSettings
      if (dto.type === "COMPLIMENTARY" && dto.matchId) {
        const settings = await tx.clubSettings.findUnique({
          where: { id: 1 },
          select: { complimentaryTicketLimit: true },
        });
        const limit = settings?.complimentaryTicketLimit ?? 10;

        const compsSold = await tx.salesRecord.aggregate({
          where: { matchId: dto.matchId, type: "COMPLIMENTARY" as any, deletedAt: null } as any,
          _sum: { quantity: true },
        });
        const totalComps = Number((compsSold._sum as any).quantity ?? 0);

        if (totalComps + dto.quantity > limit) {
          throw new AppError(400, "COMPLIMENTARY_LIMIT_EXCEEDED");
        }
      }

      const record = await tx.salesRecord.create({
        data: {
          type: dto.type,
          quantity: dto.quantity,
          unitPrice: dto.unitPrice,
          totalAmount,
          currency: dto.currency ?? "KRW",
          saleDate: new Date(dto.saleDate),
          ...(dto.description && { description: dto.description }),
          ...(dto.matchId && { matchId: dto.matchId }),
          ...(dto.seatZoneId && { seatZoneId: dto.seatZoneId }),
          ...(dto.status && { status: dto.status }),
          ...(dto.channel && { channel: dto.channel }),
          createdById,
        } as any,
      });

      if (dto.type === "TICKET" || (dto.type as string) === "VIP_TICKET") {
        await tx.ledgerEntry.create({
          data: {
            type: "INCOME",
            category: "TICKET_SALES",
            amount: totalAmount,
            currency: dto.currency ?? "KRW",
            exchangeRate: 1,
            amountKrw: totalAmount,
            isRefund: false,
            description: formatLedgerDescription("sales", "ticket_sale", { home: matchHomeTeamName!, away: matchAwayTeamName! }),
            relatedModule: "SalesRecord",
            relatedId: String(record.id),
            createdById,
          },
        });
      } else if ((dto.type as string) === "COMPLIMENTARY") {
        // JO6: COMPLIMENTARY tickets count for tracking but generate no revenue
        // Create a zero-amount ledger entry so the entry is auditable without inflating revenue
        await tx.ledgerEntry.create({
          data: {
            type: "INCOME",
            category: "TICKET_SALES" as any,
            amount: 0,
            currency: dto.currency ?? "KRW",
            exchangeRate: 1,
            amountKrw: 0,
            isRefund: false,
            description: `무상 티켓 (사유: ${dto.description}) — ${matchHomeTeamName} vs ${matchAwayTeamName}`,
            relatedModule: "SalesRecord",
            relatedId: String(record.id),
            createdById,
          } as any,
        });
      } else if ((dto.type as string) === "UNIFORM" || (dto.type as string) === "OTHER") {
        // JO7: Auto LedgerEntry for non-ticket merchandise sales
        await tx.ledgerEntry.create({
          data: {
            type: "INCOME",
            category: ((dto.type as string) === "UNIFORM" ? "UNIFORM_SALES" : "OTHER") as any,
            amount: totalAmount,
            currency: dto.currency ?? "KRW",
            exchangeRate: 1,
            amountKrw: totalAmount,
            isRefund: false,
            description: dto.description ?? ((dto.type as string) === "UNIFORM" ? "유니폼 판매" : "기타 판매"),
            relatedModule: "SalesRecord",
            relatedId: String(record.id),
            createdById,
          },
        });
      }

      // BS10: increment SeatZone.soldCount when seatZoneId is set
      if (dto.seatZoneId) {
        await tx.seatZone.update({
          where: { id: dto.seatZoneId },
          data: { soldCount: { increment: dto.quantity } },
        });
      }

      return record;
    });

    await writeAuditLog({
      actorId: createdById,
      action: "SALES_RECORD_CREATED",
      targetId: record.id,
      detail: { type: dto.type, quantity: dto.quantity, totalAmount, matchId: dto.matchId ?? null },
    });
    return record;
  }

  async createBatch(dtos: CreateSalesRecordDto[], createdById: string) {
    if (dtos.length === 0) throw new AppError(400, "EMPTY_BATCH");
    if (dtos.length > 50) throw new AppError(400, "BATCH_TOO_LARGE");

    return this.prisma.$transaction(async (tx) => {
      // capacity 사전 체크 (배치 전체에 대해 matchId별로 합산 후 한 번만 체크)
      // BUG-1: 홈경기 체크 추가 + match 정보 캐시
      const matchQtyMap = new Map<number, number>();
      for (const dto of dtos) {
        if ((dto.type === "TICKET" || dto.type === "VIP_TICKET") && dto.matchId) {
          matchQtyMap.set(dto.matchId, (matchQtyMap.get(dto.matchId) ?? 0) + dto.quantity);
        }
      }
      const matchInfoMap = new Map<number, { homeTeamName: string; awayTeamName: string; capacity: number | null }>();
      for (const [matchId, batchQty] of matchQtyMap) {
        const match = await tx.match.findUnique({
          where: { id: matchId },
          select: { homeTeamName: true, awayTeamName: true, capacity: true },
        });
        if (!match) throw new AppError(404, "MATCH_NOT_FOUND");
        if (match.homeTeamName !== FC_SEOUL) throw new AppError(400, "AWAY_MATCH_TICKET_NOT_ALLOWED");
        if (match.capacity) {
          const existing = await tx.salesRecord.aggregate({
            where: { matchId, type: { in: ["TICKET", "VIP_TICKET"] }, deletedAt: null } as any,
            _sum: { quantity: true },
          });
          const existingQty = Number((existing._sum as any).quantity ?? 0);
          if (existingQty + batchQty > match.capacity) {
            throw new AppError(400, "MATCH_CAPACITY_EXCEEDED");
          }
        }
        matchInfoMap.set(matchId, match);
      }

      const results = [];
      for (const dto of dtos) {
        if (dto.quantity <= 0) throw new AppError(400, "NEGATIVE_SALES_VALUE");
        if (dto.unitPrice < 0) throw new AppError(400, "NEGATIVE_SALES_VALUE");

        if (dto.type === "TICKET" || dto.type === "VIP_TICKET") {
          if (!dto.matchId) throw new AppError(400, "MATCH_ID_REQUIRED_FOR_TICKET");
        }

        const totalAmount = dto.quantity * dto.unitPrice;
        const record = await tx.salesRecord.create({
          data: {
            type: dto.type,
            quantity: dto.quantity,
            unitPrice: dto.unitPrice,
            totalAmount,
            currency: dto.currency ?? "KRW",
            saleDate: new Date(dto.saleDate),
            ...(dto.description && { description: dto.description }),
            ...(dto.matchId && { matchId: dto.matchId }),
            ...(dto.seatZoneId && { seatZoneId: dto.seatZoneId }),
            createdById,
          } as any,
        });

        if (dto.type === "TICKET" || dto.type === "VIP_TICKET") {
          const matchInfo = dto.matchId ? matchInfoMap.get(dto.matchId) : undefined;
          await tx.ledgerEntry.create({
            data: {
              type: "INCOME",
              category: "TICKET_SALES",
              amount: totalAmount,
              currency: dto.currency ?? "KRW",
              exchangeRate: 1,
              amountKrw: totalAmount,
              isRefund: false,
              description: formatLedgerDescription("sales", "ticket_sale", { home: matchInfo?.homeTeamName ?? "", away: matchInfo?.awayTeamName ?? "" }),
              relatedModule: "SalesRecord",
              relatedId: String(record.id),
              createdById,
            },
          });
        }
        results.push(record);
      }
      return results;
    });
  }

  async update(
    id: number,
    dto: { quantity?: number; unitPrice?: number; saleDate?: string; description?: string | null },
    updatedById: string,
  ) {
    const existing = await this.prisma.salesRecord.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new AppError(404, "SALES_RECORD_NOT_FOUND");

    const quantity = dto.quantity ?? existing.quantity;
    const unitPrice = dto.unitPrice !== undefined ? dto.unitPrice : Number(existing.unitPrice);
    const totalAmount = quantity * unitPrice;

    await this.prisma.$transaction(async (tx) => {
      await tx.salesRecord.update({
        where: { id },
        data: {
          ...(dto.quantity !== undefined && { quantity: dto.quantity }),
          ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
          ...(dto.saleDate !== undefined && { saleDate: new Date(dto.saleDate) }),
          ...(dto.description !== undefined && { description: dto.description }),
          totalAmount,
          updatedById,
          updatedAt: new Date(),
        } as any,
      });

      await tx.ledgerEntry.updateMany({
        where: { relatedModule: "SalesRecord", relatedId: String(id) },
        data: { amount: totalAmount, amountKrw: totalAmount },
      });
    });

    await writeAuditLog({
      actorId: updatedById,
      action: "SALES_RECORD_UPDATED",
      targetId: id,
      detail: { quantity, unitPrice, totalAmount },
    });

    return this.prisma.salesRecord.findUnique({
      where: { id },
      include: { match: { select: { id: true, homeTeamName: true, awayTeamName: true, date: true } } },
    });
  }

  async delete(id: number, deletedById: string) {
    await this.prisma.$transaction(async (tx) => {
      // Fetch existing record for seatZoneId/quantity needed for BS10 decrement
      const existing = await tx.salesRecord.findUnique({
        where: { id },
        select: { seatZoneId: true, quantity: true, deletedAt: true },
      });

      if (!existing) throw new AppError(404, "SALES_RECORD_NOT_FOUND");
      if (existing.deletedAt !== null) throw new AppError(400, "ALREADY_CANCELLED");

      // BS1: reverse the ledger entry linked to this sales record (preserves audit trail)
      const originalEntry = await tx.ledgerEntry.findFirst({
        where: { relatedModule: "SalesRecord", relatedId: String(id), reversedById: null },
      });
      if (originalEntry) {
        const reversal = await tx.ledgerEntry.create({
          data: {
            type: originalEntry.type,
            category: "REFUND",
            amount: -Number(originalEntry.amount),
            currency: originalEntry.currency,
            exchangeRate: Number(originalEntry.exchangeRate),
            amountKrw: -Number(originalEntry.amountKrw),
            isRefund: true,
            description: formatLedgerDescription("ledger", "refund", { entryId: originalEntry.id }),
            relatedModule: "SalesRecord",
            relatedId: String(id),
            createdById: deletedById,
          },
        });
        await tx.ledgerEntry.update({
          where: { id: originalEntry.id },
          data: { reversedById: reversal.id },
        });
      }

      // JO1: soft-delete instead of hard delete; BS8: mark REFUNDED for duplicate-refund prevention
      await tx.salesRecord.update({
        where: { id },
        data: { deletedAt: new Date(), updatedById: deletedById, updatedAt: new Date(), status: "REFUNDED" } as any,
      });

      // BS10: decrement SeatZone.soldCount on cancel
      if (existing?.seatZoneId) {
        await tx.seatZone.update({
          where: { id: existing.seatZoneId },
          data: { soldCount: { decrement: existing.quantity } },
        });
      }
    });

    // JO8: audit trail for deletion
    await writeAuditLog({
      actorId: deletedById,
      action: "SALES_RECORD_DELETED",
      targetId: id,
    });
  }

  async getSummary() {
    return this.repo.groupByType();
  }

  async ticketSummaryByMatch(seasonId: number) {
    return this.repo.ticketSummaryByMatch(seasonId, FC_SEOUL);
  }

  async seasonTicketTotal(seasonId: number) {
    return this.repo.seasonTicketTotal(seasonId);
  }

  searchSales(filters: { type?: string; matchId?: number; fromDate?: string; toDate?: string; minAmount?: number; maxAmount?: number }) {
    return this.repo.findWithFilters(filters);
  }

  async createCancellation(
    originalId: number,
    dto: { quantity: number; saleDate: string; description?: string },
    createdById: string,
  ) {
    const original = await this.prisma.salesRecord.findUnique({ where: { id: originalId } });
    if (!original || original.deletedAt) throw new AppError(404, "SALES_RECORD_NOT_FOUND");
    if (dto.quantity <= 0 || dto.quantity > original.quantity)
      throw new AppError(400, "INVALID_CANCEL_QUANTITY");

    const totalAmount = dto.quantity * Number(original.unitPrice);
    const record = await this.prisma.salesRecord.create({
      data: {
        type: original.type,
        quantity: dto.quantity,
        unitPrice: original.unitPrice,
        totalAmount,
        currency: original.currency,
        saleDate: new Date(dto.saleDate),
        status: "CANCELLED" as any,
        matchId: original.matchId,
        ...(dto.description && { description: dto.description }),
        createdById,
      } as any,
    });

    await writeAuditLog({
      actorId: createdById,
      action: "SALES_RECORD_CREATED",
      targetId: record.id,
      detail: { type: "CANCELLATION", originalId, quantity: dto.quantity, totalAmount },
    });
    return record;
  }
}
