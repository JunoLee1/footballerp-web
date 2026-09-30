import { AppError } from "../lib/appError";
import { fetchKrwRate } from "../lib/exchangeRate";
import { writeAuditLog } from "../lib/auditLog";
import { divideEvenly } from "../lib/money";
import { formatLedgerDescription } from "../lib/ledger-formatter";
import type { SponsorshipRepository } from "./sponsorship.repo";
import type { CreateSponsorshipDto, UpdateSponsorshipDto, SponsorshipListQuery, MarkPaidDto } from "./dto/sponsorship.dto";
import type { PaymentSchedule } from "../generated/enums";
import type { LedgerService } from "../ledger/ledger.service";

export function generatePaymentDates(start: Date, end: Date, schedule: PaymentSchedule): Date[] {
  // Advance by preserving the original day-of-month and clamping to the last
  // day of the target month when it doesn't exist. Naive setMonth() rolls
  // Jan 31 → Mar 3 (Feb has no 31st) and then drifts forward every iteration.
  const anchorDay = start.getUTCDate();
  const dates: Date[] = [];
  let step = 0;
  const monthsPerStep = schedule === "MONTHLY" ? 1 : schedule === "QUARTERLY" ? 3 : 12;
  while (true) {
    const targetYear = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + monthsPerStep * step) / 12);
    const targetMonth = (start.getUTCMonth() + monthsPerStep * step) % 12;
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    const day = Math.min(anchorDay, lastDayOfTargetMonth);
    const candidate = new Date(Date.UTC(targetYear, targetMonth, day));
    if (candidate > end) break;
    dates.push(candidate);
    step++;
  }
  return dates;
}

export class SponsorshipService {
  constructor(
    private repo: SponsorshipRepository,
    private ledgerService: LedgerService,
  ) {}

  list(query: SponsorshipListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    return this.repo.findAll(query, page);
  }

  async get(id: number) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "SPONSORSHIP_NOT_FOUND");
    return { ...record, payments: this.applyOverdue(record.payments) };
  }

  async create(dto: CreateSponsorshipDto, createdById: string) {
    if (await this.repo.findBySponsorName(dto.sponsorName)) throw new AppError(409, "SPONSORSHIP_NAME_DUPLICATE");
    const sponsorship = await this.repo.create({ ...dto, createdById });
    const dates = generatePaymentDates(
      new Date(dto.contractStart),
      new Date(dto.contractEnd),
      dto.paymentSchedule,
    );
    if (dates.length > 0) {
      const count = dates.length;
      const { baseAmount, lastAmount } = divideEvenly(dto.totalFee, count);
      // PB10: the final installment absorbs any remainder from integer/decimal division
      // (e.g. 10,000 ÷ 3 → 3,333 / 3,333 / 3,334). lastAmount differs from baseAmount
      // when totalFee is not evenly divisible by count.
      // TODO: add `note String?` to SponsorshipPayment schema to surface this label via API.
      //       Once added, spread `...(isLast && count > 1 && { note: `최종 회차 (잔액 조정: ...)` })`.
      await this.repo.createPayments(
        dates.map((dueDate, i) => ({
          sponsorshipId: sponsorship.id,
          dueDate,
          amount: i === count - 1 ? lastAmount : baseAmount,
        })),
      );
    }
    return this.get(sponsorship.id);
  }

  async update(id: number, dto: UpdateSponsorshipDto, updatedById: string) {
    const current = await this.get(id);
    if (dto.sponsorName && await this.repo.findBySponsorName(dto.sponsorName, id)) {
      throw new AppError(409, "SPONSORSHIP_NAME_DUPLICATE");
    }
    const result = await this.repo.update(id, dto);
    void writeAuditLog({
      actorId: updatedById,
      action: "SPONSORSHIP_UPDATED",
      targetId: id,
      detail: { fields: Object.keys(dto) },
    }).catch(console.error);

    // PA1: recalculate payment schedule if contract terms changed
    const paymentTermsChanged = dto.contractStart || dto.contractEnd || dto.paymentSchedule || dto.totalFee !== undefined;
    if (paymentTermsChanged) {
      const contractStart = new Date(dto.contractStart ?? current.contractStart);
      const contractEnd = new Date(dto.contractEnd ?? current.contractEnd);
      const paymentSchedule = (dto.paymentSchedule ?? current.paymentSchedule) as PaymentSchedule;
      const totalFee = dto.totalFee ?? Number(current.totalFee);

      await this.repo.deletePayments(id);
      const dates = generatePaymentDates(contractStart, contractEnd, paymentSchedule);
      if (dates.length > 0) {
        const count = dates.length;
        const { baseAmount, lastAmount } = divideEvenly(totalFee, count);
        // PB10: final installment absorbs remainder (see create() for details)
        await this.repo.createPayments(
          dates.map((dueDate, i) => ({
            sponsorshipId: id,
            dueDate,
            amount: i === count - 1 ? lastAmount : baseAmount,
          })),
        );
      }
      void writeAuditLog({
        actorId: updatedById,
        action: "SPONSORSHIP_PAYMENT_SCHEDULE_RECALCULATED",
        targetId: id,
        detail: { contractStart: contractStart.toISOString(), contractEnd: contractEnd.toISOString(), paymentSchedule, totalFee },
      }).catch(console.error);
    }

    return result;
  }

  async getPayments(id: number) {
    await this.get(id);
    const payments = await this.repo.findPayments(id);
    return this.applyOverdue(payments);
  }

  async markPaid(sponsorshipId: number, paymentId: number, userId: string, dto: MarkPaidDto = {}) {
    const sponsorship = await this.get(sponsorshipId);
    const payment = await this.repo.findPaymentById(paymentId);
    if (!payment || payment.sponsorshipId !== sponsorshipId) {
      throw new AppError(404, "SPONSORSHIP_PAYMENT_NOT_FOUND");
    }
    if (payment.status === "PAID") throw new AppError(409, "ALREADY_PAID");
    const payAmount = dto.adjustedAmount ?? Number(payment.amount);
    if (payAmount <= 0) throw new AppError(400, "INVALID_PAYMENT_AMOUNT");

    // Resolve exchange rate before any DB write to avoid partial state
    const sponsorshipCurrency = sponsorship.currency ?? "KRW";
    let rate = 1;
    let amountKrw = payAmount;

    if (sponsorshipCurrency !== "KRW") {
      if (dto.exchangeRate !== undefined) {
        if (dto.exchangeRate <= 0) throw new AppError(400, "INVALID_EXCHANGE_RATE");
        rate = dto.exchangeRate;
      } else {
        const fetched = await fetchKrwRate(sponsorshipCurrency as "USD" | "EUR" | "GBP");
        if (fetched === null) throw new AppError(502, "EXCHANGE_RATE_UNAVAILABLE");
        rate = fetched;
      }
      amountKrw = parseFloat((payAmount * rate).toFixed(2));
    }

    // Only mark PAID after exchange rate is confirmed valid
    const updated = await this.repo.updatePayment(paymentId, {
      status: "PAID",
      paidAt: new Date(),
      ...(dto.adjustedAmount !== undefined && { adjustedAmount: dto.adjustedAmount }),
      ...(dto.adjustmentReason !== undefined && { adjustmentReason: dto.adjustmentReason }),
      ...(dto.appliedClauseId !== undefined && { appliedClauseId: dto.appliedClauseId }),
    });
    await this.ledgerService.createAutoEntry({
      type: "INCOME",
      category: "SPONSORSHIP",
      amount: payAmount,
      currency: sponsorshipCurrency,
      exchangeRate: rate,
      amountKrw,
      description: formatLedgerDescription("sponsorship", "payment_received", { sponsorName: sponsorship.sponsorName, paymentId }),
      relatedModule: "sponsorship",
      relatedId: sponsorshipId,
    }, userId);
    return updated;
  }

  getRoiSummary() {
    return this.repo.getRoiSummary();
  }

  async findExpiringContracts(daysAhead: number = 30) {
    const now = new Date();
    const threshold = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    return this.repo.findExpiring(now, threshold);
  }

  // PB6: soft-delete a sponsorship contract
  async delete(id: number, deletedById: string) {
    await this.get(id);
    await this.repo.softDelete(id);
    void writeAuditLog({
      actorId: deletedById,
      action: "SPONSORSHIP_DELETED",
      targetId: id,
    }).catch(console.error);
  }

  private applyOverdue(payments: any[]) {
    const now = new Date();
    return payments.map((p) => ({
      ...p,
      status: p.status === "PENDING" && p.dueDate < now ? "OVERDUE" : p.status,
    }));
  }
}
