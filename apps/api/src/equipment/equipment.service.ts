import { EquipmentRepository } from "./equipment.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { formatLedgerDescription } from "../lib/ledger-formatter";
import { cached } from "../lib/cache";
import { CreateEquipmentItemDto, UpdateQuantityDto, UpdateUnitStatusDto, UpdateUnitSanitationDto, CreateAssignmentDto, CreateEquipmentLoanDto, CreateEquipmentUnitDto } from "./dto/equipment.dto";
import { EquipmentUnitStatus, EquipmentLoanStatus } from "../generated/enums";
import type { LedgerService } from "../ledger/ledger.service";

const VALID_UNIT_TRANSITIONS: Record<EquipmentUnitStatus, EquipmentUnitStatus[]> = {
  AVAILABLE: ["IN_USE", "MAINTENANCE"],
  IN_USE: ["AVAILABLE", "MAINTENANCE"],
  MAINTENANCE: ["AVAILABLE", "RETIRED"],
  RETIRED: [],
};

export class EquipmentService {
  constructor(
    private repo: EquipmentRepository,
    private notificationRepo: NotificationRepository,
    private ledgerService: LedgerService,
  ) {}

  async getAllItems(actorClubId?: number) {
    const key = `equipment:list-items:${actorClubId ?? "all"}`;
    return cached(key, 30, () => this.repo.findAllItems(actorClubId));
  }

  async getItemById(id: string, actorClubId?: number) {
    const item = await this.repo.findItemById(id, actorClubId);
    if (!item) throw new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND");
    return {
      ...item,
      units: (item as any).units?.map(({ assignments, ...unit }: any) => ({
        ...unit,
        assignedTo: assignments[0]?.player ? { playerName: assignments[0].player.playerName } : null,
      })),
    };
  }

  createItem(dto: CreateEquipmentItemDto, actorClubId?: number) {
    return this.repo.createItem(dto, actorClubId);
  }

  async adjustQuantity(id: string, dto: UpdateQuantityDto, actorClubId?: number) {
    const item = await this.repo.findItemById(id, actorClubId);
    if (!item) throw new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND");
    if (item.trackedIndividually) throw new AppError(400, "ITEM_IS_TRACKED_INDIVIDUALLY");
    const newQty = (item.quantity ?? 0) + dto.delta;
    if (newQty < 0) throw new AppError(400, "QUANTITY_BELOW_ZERO");
    const updated = await this.repo.adjustQuantity(id, dto.delta);
    if (item.lowStockThreshold !== null && newQty <= item.lowStockThreshold) {
      await this.#sendLowStockNotifications(item.name, newQty);
    }
    return updated;
  }

  async addUnit(itemId: string, dto: CreateEquipmentUnitDto = {}, actorClubId?: number) {
    const item = await this.repo.findItemById(itemId, actorClubId);
    if (!item) throw new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND");
    if (!item.trackedIndividually) throw new AppError(400, "ITEM_NOT_TRACKED_INDIVIDUALLY");
    const isHighValue = dto.isHighValue ?? (dto.purchaseValue !== undefined && dto.purchaseValue >= 500000);
    const unitDto: CreateEquipmentUnitDto = {
      ...dto,
      isHighValue,
      ...(dto.purchasedAt ? { purchasedAt: new Date(dto.purchasedAt) } : {}),
    };
    return this.repo.createUnit(itemId, unitDto, actorClubId);
  }

  async calculateAndSaveDepreciation(unitId: string) {
    const unit = await this.repo.findUnitWithDepreciation(unitId);
    if (!unit) throw new AppError(404, "EQUIPMENT_UNIT_NOT_FOUND");
    if (!unit.depreciationMethod || unit.depreciationRate === null || unit.bookValue === null || unit.purchaseValue === null) {
      throw new AppError(400, "DEPRECIATION_FIELDS_MISSING");
    }

    const currentBook = Number(unit.bookValue);
    const purchase = Number(unit.purchaseValue);
    const rate = Number(unit.depreciationRate);
    let newBookValue: number;

    if (unit.depreciationMethod === "DECLINING_BALANCE") {
      newBookValue = currentBook * (1 - rate);
    } else {
      // STRAIGHT_LINE
      const purchasedAt = unit.purchasedAt ?? new Date();
      const elapsedMs = Date.now() - new Date(purchasedAt).getTime();
      const elapsedMonths = Math.max(1, Math.floor(elapsedMs / (1000 * 60 * 60 * 24 * 30)));
      newBookValue = purchase - (purchase * rate) * elapsedMonths;
    }

    if (newBookValue < 0) throw new AppError(400, "NEGATIVE_BOOK_VALUE");
    return this.repo.updateUnitDepreciation(unitId, newBookValue);
  }

  async transitionUnitStatus(unitId: string, dto: UpdateUnitStatusDto, userId?: string, actorClubId?: number) {
    const unit = await this.repo.findUnitById(unitId, actorClubId);
    if (!unit) throw new AppError(404, "EQUIPMENT_UNIT_NOT_FOUND");
    const allowed = VALID_UNIT_TRANSITIONS[unit.status as unknown as EquipmentUnitStatus];
    if (!allowed.includes(dto.status)) throw new AppError(409, "INVALID_STATUS_TRANSITION");
    if (dto.status === "RETIRED") {
      if (!dto.disposedById) throw new AppError(400, "DISPOSAL_ACTOR_REQUIRED");
      dto.disposedAt = new Date();
    }
    const updated = await this.repo.updateUnitStatus(unitId, dto.status, {
      ...(dto.disposedById !== undefined && { disposedById: dto.disposedById }),
      ...(dto.disposedAt !== undefined && { disposedAt: dto.disposedAt }),
      ...(dto.disposalNote !== undefined && { disposalNote: dto.disposalNote }),
    });
    if (dto.status === "RETIRED") {
      void writeAuditLog({
        actorId: userId ?? "",
        action: "EQUIPMENT_UNIT_RETIRED",
        targetId: unitId,
        detail: { previousStatus: unit.status, disposedById: dto.disposedById },
      }).catch(console.error);
      const unitWithBook = await this.repo.findUnitWithDepreciation(unitId);
      if (unitWithBook?.bookValue) {
        void this.ledgerService.createAutoEntry({
          type: "EXPENSE",
          category: "EQUIPMENT_PURCHASE",
          amount: Number(unitWithBook.bookValue),
          currency: "KRW",
          exchangeRate: 1,
          amountKrw: Number(unitWithBook.bookValue),
          isRefund: true,
          description: formatLedgerDescription("equipment", "retired", { unitId }),
          relatedModule: "equipment",
          // relatedId 는 Int 컬럼이라 cuid unitId 저장 불가 (#593 PR C1)
        }, userId ?? "").catch(err => console.error("[LedgerAutoEntry:equipment]", err));
      }
    }
    return updated;
  }

  async createAssignment(dto: CreateAssignmentDto) {
    if (!dto.equipmentItemId && !dto.equipmentUnitId) {
      throw new AppError(400, "ASSIGNMENT_REQUIRES_ITEM_OR_UNIT");
    }
    return this.repo.createAssignment(dto);
  }

  async getUnreturnedByPlayer(playerId: string) {
    return this.repo.findUnreturnedByPlayer(playerId);
  }

  async returnAssignment(assignmentId: string) {
    const assignment = await this.repo.findAssignmentById(assignmentId);
    if (!assignment) throw new AppError(404, "ASSIGNMENT_NOT_FOUND");
    if (assignment.returnedAt) throw new AppError(409, "ALREADY_RETURNED");
    return this.repo.markReturned(assignmentId);
  }

  async requestLoan(requestedById: string, dto: CreateEquipmentLoanDto, actorClubId?: number) {
    const item = await this.repo.findItemById(dto.equipmentItemId, actorClubId);
    if (!item) throw new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND");
    if (!dto.dueDate) throw new AppError(400, "DUE_DATE_REQUIRED");
    const dueDate = new Date(dto.dueDate);
    if (Number.isNaN(dueDate.getTime())) throw new AppError(400, "INVALID_DUE_DATE");
    if (dueDate.getTime() <= Date.now()) throw new AppError(400, "DUE_DATE_MUST_BE_FUTURE");
    const overdue = await this.repo.hasActiveOverdueLoan(requestedById);
    if (overdue) throw new AppError(403, "HAS_ACTIVE_OVERDUE_LOAN");
    const loan = await this.repo.createLoan(requestedById, dto, actorClubId);
    const managers = await this.repo.findEquipmentManagers();
    await Promise.all(managers.map((m) =>
      this.notificationRepo.create({
        userId: m.id,
        type: "EQUIPMENT_LOAN_REQUESTED",
        title: "장비 대여 신청",
        body: `${item.name} 대여 신청이 접수됐습니다.`,
      }),
    ));
    return loan;
  }

  async approveLoan(loanId: string, approvedById: string, actorClubId?: number) {
    const loan = await this.repo.findLoanById(loanId, actorClubId);
    if (!loan) throw new AppError(404, "LOAN_NOT_FOUND");
    if (loan.status !== "REQUESTED") throw new AppError(409, "INVALID_LOAN_STATUS_TRANSITION");
    const updated = await this.repo.updateLoan(loanId, { status: "APPROVED", approvedById });
    await this.notificationRepo.create({
      userId: loan.requestedBy.id,
      type: "EQUIPMENT_LOAN_APPROVED",
      title: "장비 대여 승인",
      body: `${loan.equipmentItem.name} 대여 신청이 승인됐습니다. 직접 수령해주세요.`,
    });
    return updated;
  }

  async rejectLoan(loanId: string, approvedById: string, actorClubId?: number) {
    const loan = await this.repo.findLoanById(loanId, actorClubId);
    if (!loan) throw new AppError(404, "LOAN_NOT_FOUND");
    if (loan.status !== "REQUESTED") throw new AppError(409, "INVALID_LOAN_STATUS_TRANSITION");
    const updated = await this.repo.updateLoan(loanId, { status: "REJECTED", approvedById });
    await this.notificationRepo.create({
      userId: loan.requestedBy.id,
      type: "EQUIPMENT_LOAN_REJECTED",
      title: "장비 대여 거절",
      body: `${loan.equipmentItem.name} 대여 신청이 거절됐습니다.`,
    });
    return updated;
  }

  async issueLoan(loanId: string, equipmentUnitId?: string, actorClubId?: number) {
    const loan = await this.repo.findLoanById(loanId, actorClubId);
    if (!loan) throw new AppError(404, "LOAN_NOT_FOUND");
    if (loan.status !== "APPROVED") throw new AppError(409, "INVALID_LOAN_STATUS_TRANSITION");
    return this.repo.updateLoan(loanId, {
      status: "ISSUED",
      issuedAt: new Date(),
      ...(equipmentUnitId !== undefined && { equipmentUnitId }),
    });
  }

  async returnLoan(loanId: string, returnedById: string, returnNote?: string, actorClubId?: number) {
    const loan = await this.repo.findLoanById(loanId, actorClubId);
    if (!loan) throw new AppError(404, "LOAN_NOT_FOUND");
    if (loan.status !== "ISSUED") throw new AppError(409, "INVALID_LOAN_STATUS_TRANSITION");
    const returnedAt = new Date();
    const result = await this.repo.returnLoan(loanId, returnedById, returnNote);
    if (loan.equipmentUnitId) {
      await this.repo.updateUnitStatus(loan.equipmentUnitId, "AVAILABLE");
    }
    const latencyDays = loan.dueDate
      ? Math.max(0, Math.floor((returnedAt.getTime() - new Date(loan.dueDate).getTime()) / 86_400_000))
      : 0;
    void this.notificationRepo.create({
      userId: loan.requestedBy.id,
      type: "EQUIPMENT_LOAN_RETURNED",
      title: "장비 반납 확인",
      body: `${loan.equipmentItem.name} 반납이 확인됐습니다.`,
    }).catch(console.error);
    void writeAuditLog({
      actorId: returnedById,
      action: "EQUIPMENT_LOAN_RETURNED",
      targetId: loanId,
      detail: {
        dueDate: loan.dueDate,
        returnedAt: returnedAt.toISOString(),
        latencyDays,
        ...(returnNote && { returnNote }),
      },
    }).catch(console.error);
    return result;
  }

  async updateUnitSanitation(unitId: string, dto: UpdateUnitSanitationDto, actorClubId?: number) {
    const unit = await this.repo.findUnitById(unitId, actorClubId);
    if (!unit) throw new AppError(404, "EQUIPMENT_UNIT_NOT_FOUND");
    return this.repo.updateUnit(unitId, {
      ...(dto.lastSanitizedAt && { lastSanitizedAt: new Date(dto.lastSanitizedAt) }),
      ...(dto.sanitationStatus !== undefined && { sanitationStatus: dto.sanitationStatus }),
      ...(dto.lastInspectedAt && { lastInspectedAt: new Date(dto.lastInspectedAt) }),
      ...(dto.inspectionIntervalDays !== undefined && { inspectionIntervalDays: dto.inspectionIntervalDays }),
      ...(dto.nextInspectionDue && { nextInspectionDue: new Date(dto.nextInspectionDue) }),
    });
  }

  listLoans(status?: EquipmentLoanStatus, actorClubId?: number) {
    const key = `equipment:list-loans:${status ?? "all"}:${actorClubId ?? "all"}`;
    return cached(key, 30, () => this.repo.findAllLoans(status, actorClubId));
  }

  listMyLoans(userId: string, actorClubId?: number) {
    return this.repo.findMyLoans(userId, actorClubId);
  }

  async #sendLowStockNotifications(itemName: string, quantity: number) {
    const managers = await this.repo.findEquipmentManagers();
    await Promise.all(
      managers.map((m) =>
        this.notificationRepo.create({
          userId: m.id,
          type: "EQUIPMENT_LOW_STOCK",
          title: "재고 부족",
          body: `${itemName} 재고가 ${quantity}개로 임계값 이하입니다.`,
        }),
      ),
    );
  }
}
