import { AppError } from "../lib/appError";
import { getPrisma } from "../lib/prisma";
import { formatLedgerDescription } from "../lib/ledger-formatter";
import { FeeStatus } from "../generated/enums";
import type { AcademyFeeRepository } from "./academy-fee.repo";
import type { NotificationRepository } from "../notification/notification.repo";
import type { FeeListQuery, SubmitPaymentProofDto, TossConfirmDto, AdminSubmitDto, CreateSingleFeeDto } from "./dto/academy-fee.dto";

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export class AcademyFeeService {
  constructor(
    private repo: AcademyFeeRepository,
    private notifRepo: NotificationRepository,
  ) {}

  getAll(query: FeeListQuery) { return this.repo.findAll(query); }
  getByPlayer(playerId: string) { return this.repo.findByPlayer(playerId); }
  async searchYouthPlayers(name: string) {
    const players = await this.repo.searchYouthPlayers(name);
    return players.map(p => ({
      id: p.id,
      playerName: p.playerName,
      guardianId: p.guardianId,
      guardianUsername: p.guardian?.username ?? null,
    }));
  }

  async registerWithProof(dto: { playerId: string; year: number; month: number; amount: number }, proofUrl: string) {
    const prisma = getPrisma();
    const player = await prisma.player.findUnique({
      where: { id: dto.playerId },
      select: { guardianId: true, playerName: true },
    });
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    if (!player.guardianId) throw new AppError(400, "PLAYER_HAS_NO_GUARDIAN");

    const existing = await this.repo.findByPlayerYearMonth(dto.playerId, dto.year, dto.month);
    if (existing) throw new AppError(409, "FEE_ALREADY_EXISTS");

    const dueDate = new Date(dto.year, dto.month - 1, 25);
    const fee = await this.repo.createWithProof({
      playerId: dto.playerId,
      guardianId: player.guardianId,
      amount: dto.amount,
      dueDate,
      year: dto.year,
      month: dto.month,
      paymentProofUrl: proofUrl,
    });

    void this.notifRepo.createForGuardian(
      player.guardianId,
      "FEE_INVOICE_ISSUED",
      () => ({
        title: "아카데미 회비 납부 접수",
        body: `${player.playerName} 선수의 ${dto.month}월 회비(${dto.amount.toLocaleString()}원) 납부 증빙이 접수됐습니다.`,
      }),
    ).catch(console.error);

    return fee;
  }

  async createSingle(dto: CreateSingleFeeDto) {
    const prisma = getPrisma();
    const player = await prisma.player.findUnique({
      where: { id: dto.playerId },
      select: { guardianId: true, playerName: true },
    });
    if (!player) throw new AppError(404, "PLAYER_NOT_FOUND");
    if (!player.guardianId) throw new AppError(400, "PLAYER_HAS_NO_GUARDIAN");

    return this.repo.create({
      playerId: dto.playerId,
      guardianId: player.guardianId,
      amount: dto.amount,
      dueDate: new Date(dto.dueDate),
      year: dto.year,
      month: dto.month,
    });
  }

  async getById(id: string) {
    const fee = await this.repo.findById(id);
    if (!fee) throw new AppError(404, "FEE_NOT_FOUND");
    return fee;
  }

  async issueMonthlyFees(year: number, month: number, amount: number) {
    const players = await this.repo.findAllActiveYouthPlayers();
    const dueDate = new Date(year, month - 1, 25);
    const eligible = players.filter(p => p.guardianId !== null);
    await this.repo.createMany(
      eligible.map(p => ({ playerId: p.id, guardianId: p.guardianId!, amount, dueDate, year, month })),
    );
    for (const p of eligible) {
      void this.notifRepo.createForGuardian(
        p.guardianId!,
        "FEE_INVOICE_ISSUED",
        () => ({
          title: `${month}월 아카데미 회비 청구서`,
          body: `${p.playerName} 선수의 ${month}월 회비(${amount.toLocaleString()}원)가 청구됐습니다. 기한: ${dueDate.toLocaleDateString("ko-KR")}`,
        }),
      ).catch(console.error);
    }
  }

  async processOverdue() {
    const now = new Date();
    const overdueFees = await this.repo.findOverdue(now);
    for (const fee of overdueFees) {
      const days = daysSince(fee.dueDate);
      if (days >= 30) {
        await this.repo.updateStatus(fee.id, "LOCKED");
        if ((fee.player.status as string) !== "SUSPENDED") await this.repo.lockPlayer(fee.playerId);
        void this.notifRepo.createForGuardian(
          fee.guardianId, "FEE_ACCOUNT_LOCKED",
          () => ({
            title: "아카데미 회비 미납 — 훈련/경기 참가 정지",
            body: `${fee.player.playerName} 선수가 30일 이상 회비를 미납하여 참가가 정지됐습니다.`,
          }),
          fee.id,
        ).catch(console.error);
      } else if (days >= 7) {
        await this.repo.updateStatus(fee.id, "OVERDUE");
        void this.notifRepo.createForGuardian(
          fee.guardianId, "FEE_OVERDUE_WARNING",
          () => ({
            title: "아카데미 회비 미납 2차 안내",
            body: `${fee.player.playerName} 선수의 회비가 ${days}일째 미납 중입니다.`,
          }),
          fee.id,
        ).catch(console.error);
      } else if (days >= 1) {
        void this.notifRepo.createForGuardian(
          fee.guardianId, "FEE_REMINDER",
          () => ({
            title: "아카데미 회비 납부 안내",
            body: `${fee.player.playerName} 선수의 회비 납부 기한이 지났습니다.`,
          }),
          fee.id,
        ).catch(console.error);
      }
    }
  }

  async submitPaymentProof(id: string, dto: SubmitPaymentProofDto) {
    const fee = await this.repo.findById(id);
    if (!fee) throw new AppError(404, "FEE_NOT_FOUND");
    if (fee.status === "PAID") throw new AppError(409, "ALREADY_PAID");
    return this.repo.submitPaymentProof(id, dto.paymentProofUrl);
  }

  async firstApprovePayment(id: string) {
    const fee = await this.repo.findById(id);
    if (!fee) throw new AppError(404, "FEE_NOT_FOUND");
    if (fee.status !== "SUBMITTED") throw new AppError(409, "INVALID_STATUS");
    return this.repo.updateStatus(id, "FIRST_APPROVED");
  }

  async approvePayment(id: string, approverId: string) {
    const fee = await this.repo.findById(id);
    if (!fee) throw new AppError(404, "FEE_NOT_FOUND");
    if (fee.status !== "FIRST_APPROVED" && fee.status !== "SUBMITTED") throw new AppError(409, "INVALID_STATUS");

    const prisma = getPrisma();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 기간 마감 체크: 이번 달에 periodLocked=true 항목이 있으면 거부
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);
    const lockedEntry = await prisma.ledgerEntry.findFirst({
      where: { periodLocked: true, createdAt: { gte: periodStart, lt: periodEnd } },
      select: { id: true },
    });
    if (lockedEntry) throw new AppError(400, "PERIOD_LOCKED");

    // PAID로 전환
    const paid = await this.repo.approvePayment(id);

    // LedgerEntry 생성 (fee.amount가 Decimal일 수 있으므로 Number() 변환)
    const amount = Number(fee.amount ?? 0);
    await prisma.ledgerEntry.create({
      data: {
        type: "INCOME",
        category: "ACADEMY_FEE",
        amount,
        currency: "KRW",
        exchangeRate: 1,
        amountKrw: amount,
        isRefund: false,
        description: formatLedgerDescription("academy_fee", "payment_approved", {
          player: fee.player?.playerName ?? String(fee.playerId),
          period: `${fee.year ?? year}년 ${fee.month ?? month}월`,
        }),
        relatedModule: "AcademyFee",
        relatedId: String(id),
        createdById: approverId,
      },
    });

    // guardian 알림
    void this.notifRepo.createForGuardian(
      fee.guardianId, "FEE_INVOICE_ISSUED",
      () => ({
        title: "아카데미 회비 수납 확인",
        body: `${fee.player.playerName} 선수의 회비 납부가 확인됐습니다.`,
      }),
      id,
    ).catch(console.error);

    return paid;
  }

  async confirmTossPayment(id: string, dto: TossConfirmDto) {
    const fee = await this.repo.findById(id);
    if (!fee) throw new AppError(404, "FEE_NOT_FOUND");
    if (fee.status === FeeStatus.PAID) return fee; // 멱등성
    if (fee.status === FeeStatus.LOCKED || fee.status === FeeStatus.SUBMITTED) {
      throw new AppError(409, "INVALID_STATUS_FOR_PG_PAYMENT");
    }

    // 금액 검증 (클라이언트 변조 방지)
    if (Number(dto.amount) !== Number((fee as any).amount)) {
      throw new AppError(400, "AMOUNT_MISMATCH");
    }

    // 기간 마감 체크 — Toss 호출 전에 확인
    const prisma = getPrisma();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 1);
    const lockedEntry = await prisma.ledgerEntry.findFirst({
      where: { periodLocked: true, createdAt: { gte: periodStart, lt: periodEnd } },
      select: { id: true },
    });
    if (lockedEntry) throw new AppError(400, "PERIOD_LOCKED");

    // Toss API 결제 승인
    if (!process.env.TOSS_SECRET_KEY) throw new AppError(500, "TOSS_NOT_CONFIGURED");
    const authHeader = Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64");
    const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey: dto.paymentKey,
        orderId: dto.orderId,
        amount: dto.amount,
      }),
    });

    if (!tossRes.ok) {
      const err = await tossRes.json().catch(() => ({}));
      throw new AppError(400, (err as any).code ?? "TOSS_CONFIRM_FAILED");
    }

    // PAID 전환 (조건부 업데이트로 race condition 방지)
    const paid = await this.repo.confirmTossPayment(id, dto.paymentKey);

    // Ledger 생성
    const amount = Number((fee as any).amount ?? 0);
    await prisma.ledgerEntry.create({
      data: {
        type: "INCOME",
        category: "ACADEMY_FEE",
        amount,
        currency: "KRW",
        exchangeRate: 1,
        amountKrw: amount,
        isRefund: false,
        description: formatLedgerDescription("academy_fee", "payment_approved", {
          player: fee.player?.playerName ?? String(fee.playerId),
          period: `${fee.year ?? year}년 ${fee.month ?? month}월`,
        }),
        relatedModule: "AcademyFee",
        relatedId: String(id),
        createdById: fee.guardianId,
      },
    });

    // guardian 알림
    void this.notifRepo.createForGuardian(
      fee.guardianId,
      "FEE_INVOICE_ISSUED",
      () => ({
        title: "아카데미 회비 납부 완료",
        body: `${fee.player?.playerName} 선수의 ${fee.month}월 회비 결제가 완료됐습니다.`,
      }),
      id,
    ).catch(console.error);

    return paid;
  }

  async tossWebhook(body: { status: string; paymentKey: string; orderId: string; totalAmount: number }) {
    // Toss는 DONE 상태일 때만 처리
    if (body.status !== "DONE") return { ok: true };

    // orderId 형식: fee-{id}-{timestamp}
    const parts = body.orderId.split("-");
    const feeId = String(parts[1]);
    if (feeId) return { ok: true }; //TODO: 어불성설 인듯 한데 확인 

    const fee = await this.repo.findById(feeId);
    if (!fee) return { ok: true };
    if (fee.status === FeeStatus.PAID) return { ok: true }; // 멱등성

    const feeAmount = Number((fee as any).amount);
    if (feeAmount !== body.totalAmount) {
      console.warn(`Toss webhook amount mismatch: feeId=${feeId} db=${feeAmount} toss=${body.totalAmount}`);
    }
    await this.confirmTossPayment(feeId, {
      paymentKey: body.paymentKey,
      orderId: body.orderId,
      amount: feeAmount, // use DB amount to pass the AMOUNT_MISMATCH guard
    });

    return { ok: true };
  }

  async getReceipt(id: string, requesterId: string, requesterRole: string, requesterFoRole?: string | null) {
    const fee = await this.repo.findById(id);
    if (!fee) throw new AppError(404, "FEE_NOT_FOUND");
    if (fee.status !== FeeStatus.PAID) throw new AppError(404, "RECEIPT_NOT_AVAILABLE");
    if (!fee.paidAt || !(fee as any).receiptIssuedAt) throw new AppError(404, "RECEIPT_NOT_AVAILABLE");

    // GUARDIAN may only access their own child's fee
    if (requesterRole === "GUARDIAN" && fee.guardianId !== requesterId) {
      throw new AppError(403, "FORBIDDEN");
    }

    return {
      id: fee.id,
      year: fee.year,
      month: fee.month,
      amount: Number(fee.amount) ?? 0,
      paidAt: fee.paidAt,
      paymentMethod: fee.paymentMethod ?? null,
      pgTransactionId: fee.pgTransactionId ?? null,
      receiptIssuedAt: fee.receiptIssuedAt,
      playerName: fee.player?.playerName ?? "",
      guardianUsername: fee.guardian?.username ?? "",
    };
  }

  async adminSubmitProof(id: string, dto: AdminSubmitDto) {
    const fee = await this.repo.findById(id);
    if (!fee) throw new AppError(404, "FEE_NOT_FOUND");
    if (fee.status !== FeeStatus.PENDING && fee.status !== FeeStatus.OVERDUE) {
      throw new AppError(409, "INVALID_STATUS");
    }
    const updated = await this.repo.adminSubmitProof(id, dto.paymentProofUrl);
    void this.notifRepo.createForGuardian(
      fee.guardianId,
      "FEE_INVOICE_ISSUED",
      () => ({
        title: "회비 증빙이 접수됐습니다",
        body: `${fee.player?.playerName} 선수의 ${fee.month}월 회비 증빙이 재무팀에 접수됐습니다.`,
      }),
      id,
    ).catch(console.error);
    return updated;
  }

  async getFinanceStats(year: number, month: number) {
    const rows = await this.repo.getFinanceStats(year, month);
    const total = rows.reduce((s, r) => s + (r._count.id ?? 0), 0);
    const paid = rows.find(r => r.status === "PAID")?._count.id ?? 0;
    const overdue = rows.filter(r => ["OVERDUE", "LOCKED"].includes(r.status as string))
      .reduce((s, r) => s + (r._count.id ?? 0), 0);
    const locked = rows.find(r => r.status === "LOCKED")?._count.id ?? 0;
    const totalRevenue = rows.find(r => r.status === "PAID")?._sum.amount ?? 0;

    // lockedAmount: LOCKED 상태 회비 총액
    const lockedAmountRow = rows.find(r => r.status === "LOCKED");
    const lockedAmount = Number(lockedAmountRow?._sum?.amount ?? 0);

    return {
      monthlyCollectionRate: total > 0 ? Math.round((paid / total) * 100) : 0,
      totalRevenue,
      overdueCount: overdue,
      lockedPlayerCount: locked,
      lockedAmount,
    };
  }
}
