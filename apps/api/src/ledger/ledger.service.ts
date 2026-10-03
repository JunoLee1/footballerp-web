import { AppError } from "../lib/appError";
import { formatLedgerDescription } from "../lib/ledger-formatter";
import { writeAuditLog } from "../lib/auditLog";
import type { LedgerRepository } from "./ledger.repo";
import type { CreateLedgerEntryDto, LedgerListQuery } from "./dto/ledger.dto";

export const ALLOWED_MODULES = ["SalesRecord", "facility", "sponsorship", "equipment", "payroll", "AcademyFee"] as const;
const MAX_EXCHANGE_RATE = 10_000;

export class LedgerService {
  constructor(private repo: LedgerRepository) {}

  findAll(query: LedgerListQuery) { return this.repo.findAll(query); }
  findById(id: string) { return this.repo.findById(id); }

  private validateExchangeRate(provided: number | undefined): void {
    if (provided !== undefined && (provided <= 0 || provided > MAX_EXCHANGE_RATE)) {
      throw new AppError(400, "INVALID_EXCHANGE_RATE");
    }
  }

  private async assertPeriodNotLocked(): Promise<void> {
    const now = new Date();
    const locked = await this.repo.isPeriodLocked(now.getFullYear(), now.getMonth() + 1);
    if (locked) throw new AppError(409, "PERIOD_LOCKED");
  }

  async create(dto: CreateLedgerEntryDto, createdById: string) {
    if (dto.amount <= 0) throw new AppError(400, "INVALID_AMOUNT");
    this.validateExchangeRate(dto.exchangeRate);

    if (dto.relatedModule !== undefined && !ALLOWED_MODULES.includes(dto.relatedModule as any)) {
      throw new AppError(400, "INVALID_RELATED_MODULE");
    }
    if (dto.relatedId !== undefined && (typeof dto.relatedId !== "string" || dto.relatedId.length === 0)) {
      throw new AppError(400, "INVALID_RELATED_ID");
    }

    await this.assertPeriodNotLocked();

    const rate = dto.exchangeRate ?? 1;
    const amountKrw = dto.amountKrw ?? dto.amount * rate;
    const entry = await this.repo.create({ ...dto, exchangeRate: rate, amountKrw, createdById });
    await writeAuditLog({ actorId: createdById, action: "LEDGER_ENTRY_CREATED", targetId: entry.id });
    return entry;
  }

  async createRefund(originalId: string, createdById: string) {
    const original = await this.repo.findById(originalId);
    if (!original) throw new AppError(404, "LEDGER_ENTRY_NOT_FOUND");
    if (original.reversedById != null) throw new AppError(400, "ALREADY_REVERSED");

    await this.assertPeriodNotLocked();

    // JO4: link refund entry back to original via reversalOfId
    const refund = await this.repo.create({
      type: original.type as any,
      category: "REFUND",
      amount: -Number(original.amount),
      currency: original.currency as any,
      exchangeRate: Number(original.exchangeRate),
      amountKrw: -Number(original.amountKrw),
      isRefund: true,
      description: formatLedgerDescription("ledger", "refund", { entryId: original.id }),
      ...(original.relatedModule != null && { relatedModule: original.relatedModule }),
      ...(original.relatedId != null && { relatedId: original.relatedId }),
      reversalOfId: original.id,
      createdById,
    } as any);
    // JO4: mark original as reversed (reversedById already in schema)
    await this.repo.markReversed(originalId, refund.id);

    // BS2: mark the source SalesRecord as refunded
    if (original.relatedModule === "SalesRecord" && original.relatedId) {
      await this.repo.markSalesRecordRefunded(original.relatedId);
    }

    await writeAuditLog({ actorId: createdById, action: "LEDGER_REFUND_CREATED", targetId: refund.id, detail: { originalId } });
    return refund;
  }

  async lockPeriod(year: number, month: number, actorId: string) {
    const already = await this.repo.isPeriodLocked(year, month);
    if (already) throw new AppError(409, "PERIOD_ALREADY_LOCKED");
    try {
      const result = await this.repo.lockPeriod(year, month, actorId);
      await writeAuditLog({ actorId, action: "LEDGER_PERIOD_LOCKED", targetId: result.id, detail: { year, month } });
      return result;
    } catch (e: any) {
      if (e?.code === "P2002") throw new AppError(409, "PERIOD_ALREADY_LOCKED");
      throw e;
    }
  }

  // Auto-entry helper for internal trusted modules (payroll, contracts, etc.)
  // relatedModule/relatedId validation bypassed — callers are trusted internal modules
  async createAutoEntry(dto: CreateLedgerEntryDto, createdById: string) {
    this.validateExchangeRate(dto.exchangeRate);
    await this.assertPeriodNotLocked();
    const rate = dto.exchangeRate ?? 1;
    const amountKrw = dto.amountKrw ?? dto.amount * rate;
    return this.repo.create({ ...dto, exchangeRate: rate, amountKrw, createdById });
  }
}
