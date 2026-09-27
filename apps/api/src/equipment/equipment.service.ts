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

  async getAllItems() {
    return cached("equipment:list-items", 30, () => this.repo.findAllItems());
  }

  async getItemById(id: number) {
    const item = await this.repo.findItemById(id);
    if (!item) throw new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND");
    return {
      ...item,
      units: (item as any).units?.map(({ assignments, ...unit }: any) => ({
        ...unit,
        assignedTo: assignments[0]?.player ? { playerName: assignments[0].player.name } : null,
      })),
    };
  }

  createItem(dto: CreateEquipmentItemDto) {
    return this.repo.createItem(dto);
  }

  async adjustQuantity(id: number, dto: UpdateQuantityDto) {
    const item = await this.repo.findItemById(id);
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

  async addUnit(itemId: number, dto: CreateEquipmentUnitDto = {}) {
    const item = await this.repo.findItemById(itemId);
    if (!item) throw new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND");
    if (!item.trackedIndividually) throw new AppError(400, "ITEM_NOT_TRACKED_INDIVIDUALLY");
    const isHighValue = dto.isHighValue ?? (dto.purchaseValue !== undefined && dto.purchaseValue >= 500000);
    const unitDto: CreateEquipmentUnitDto = {
      ...dto,
      isHighValue,
      ...(dto.purchasedAt ? { purchasedAt: new Date(dto.purchasedAt) } : {}),
    };
    return this.repo.createUnit(itemId, unitDto);
  }

  async calculateAndSaveDepreciation(unitId: number) {
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

  async transitionUnitStatus(unitId: number, dto: UpdateUnitStatusDto, userId?: number) {
    const unit = await this.repo.findUnitById(unitId);
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
        actorId: userId ?? 0,
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
          relatedId: unitId,
        }, userId ?? 0).catch(err => console.error("[LedgerAutoEntry:equipment]", err));
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

  async returnAssignment(assignmentId: number) {
    const assignment = await this.repo.findAssignmentById(assignmentId);
    if (!assignment) throw new AppError(404, "ASSIGNMENT_NOT_FOUND");
    if (assignment.returnedAt) throw new AppError(409, "ALREADY_RETURNED");
    return this.repo.markReturned(assignmentId);
  }

  async requestLoan(requestedById: number, dto: CreateEquipmentLoanDto) {
    const item = await this.repo.findItemById(dto.equipmentItemId);
    if (!item) throw new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND");
    const loan = await this.repo.createLoan(requestedById, dto);
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

  async approveLoan(loanId: number, approvedById: number) {
    const loan = await this.repo.findLoanById(loanId);
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

  async rejectLoan(loanId: number, approvedById: number) {
    const loan = await this.repo.findLoanById(loanId);
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

  async issueLoan(loanId: number, equipmentUnitId?: number) {
    const loan = await this.repo.findLoanById(loanId);
    if (!loan) throw new AppError(404, "LOAN_NOT_FOUND");
    if (loan.status !== "APPROVED") throw new AppError(409, "INVALID_LOAN_STATUS_TRANSITION");
    return this.repo.updateLoan(loanId, {
      status: "ISSUED",
      issuedAt: new Date(),
      ...(equipmentUnitId !== undefined && { equipmentUnitId }),
    });
  }

  async returnLoan(loanId: number, returnedById: number, returnNote?: string) {
    const loan = await this.repo.findLoanById(loanId);
    if (!loan) throw new AppError(404, "LOAN_NOT_FOUND");
    if (loan.status !== "ISSUED") throw new AppError(409, "INVALID_LOAN_STATUS_TRANSITION");
    const result = await this.repo.returnLoan(loanId, returnedById, returnNote);
    if (loan.equipmentUnitId) {
      await this.repo.updateUnitStatus(loan.equipmentUnitId, "AVAILABLE");
    }
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
      detail: { ...(returnNote && { returnNote }) },
    }).catch(console.error);
    return result;
  }

  async updateUnitSanitation(unitId: number, dto: UpdateUnitSanitationDto) {
    const unit = await this.repo.findUnitById(unitId);
    if (!unit) throw new AppError(404, "EQUIPMENT_UNIT_NOT_FOUND");
    return this.repo.updateUnit(unitId, {
      ...(dto.lastSanitizedAt && { lastSanitizedAt: new Date(dto.lastSanitizedAt) }),
      ...(dto.sanitationStatus !== undefined && { sanitationStatus: dto.sanitationStatus }),
      ...(dto.lastInspectedAt && { lastInspectedAt: new Date(dto.lastInspectedAt) }),
      ...(dto.inspectionIntervalDays !== undefined && { inspectionIntervalDays: dto.inspectionIntervalDays }),
      ...(dto.nextInspectionDue && { nextInspectionDue: new Date(dto.nextInspectionDue) }),
    });
  }

  listLoans(status?: EquipmentLoanStatus) {
    const key = `equipment:list-loans:${status ?? "all"}`;
    return cached(key, 30, () => this.repo.findAllLoans(status));
  }

  listMyLoans(userId: number) {
    return this.repo.findMyLoans(userId);
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
