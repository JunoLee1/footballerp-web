import { PrismaClient } from "../generated/client";
import { EquipmentUnitStatus, EquipmentLoanStatus } from "../generated/enums";
import { CreateEquipmentItemDto, CreateAssignmentDto, CreateEquipmentLoanDto, CreateEquipmentUnitDto } from "./dto/equipment.dto";

const ITEM_SELECT = {
  id: true,
  name: true,
  category: true,
  trackedIndividually: true,
  quantity: true,
  lowStockThreshold: true,
} as const;

const UNIT_SELECT = {
  id: true,
  status: true,
  equipmentItemId: true,
  serialNumber: true,
  lastInspectedAt: true,
  inspectionIntervalDays: true,
  nextInspectionDue: true,
  lastSanitizedAt: true,
  sanitationStatus: true,
  assignments: {
    where: { returnedAt: null },
    take: 1,
    select: { player: { select: { playerName: true } } },
  },
} as any;

const ASSIGNMENT_SELECT = {
  id: true,
  issuedAt: true,
  returnedAt: true,
  playerId: true,
  equipmentItemId: true,
  equipmentUnitId: true,
} as const;

const LOAN_SELECT = {
  id: true, status: true, requestedAt: true, dueDate: true, issuedAt: true, returnedAt: true,
  overdueNotifiedAt: true,
  notes: true, equipmentItemId: true, equipmentUnitId: true,
  requestedBy: { select: { id: true, nickname: true } },
  approvedBy: { select: { id: true, nickname: true } },
  equipmentItem: { select: { id: true, name: true, category: true } },
  equipmentUnit: { select: { id: true } },
} as const;

export class EquipmentRepository {
  constructor(private prisma: PrismaClient) {}

  findAllItems(actorClubId?: number) {
    return this.prisma.equipmentItem.findMany({
      ...(actorClubId !== undefined && { where: { clubId: actorClubId } }),
      select: ITEM_SELECT,
    });
  }

  findItemById(id: string, actorClubId?: number) {
    return this.prisma.equipmentItem.findFirst({
      where: { id, ...(actorClubId !== undefined ? { clubId: actorClubId } : {}) },
      select: {
        ...ITEM_SELECT,
        units: { select: UNIT_SELECT },
        assignments: { select: ASSIGNMENT_SELECT, where: { returnedAt: null } },
      },
    });
  }

  createItem(dto: CreateEquipmentItemDto, actorClubId?: number) {
    return this.prisma.equipmentItem.create({
      data: {
        name: dto.name,
        category: dto.category,
        trackedIndividually: dto.trackedIndividually,
        quantity: dto.quantity ?? null,
        lowStockThreshold: dto.lowStockThreshold ?? null,
        clubId: actorClubId ?? null,
      },
      select: ITEM_SELECT,
    });
  }

  adjustQuantity(id: string, delta: number) {
    return this.prisma.equipmentItem.update({
      where: { id },
      data: { quantity: { increment: delta } },
      select: ITEM_SELECT,
    });
  }

  createUnit(equipmentItemId: string, dto?: CreateEquipmentUnitDto, actorClubId?: number) {
    return this.prisma.equipmentUnit.create({
      data: {
        equipmentItemId,
        clubId: actorClubId ?? null,
        ...(dto?.serialNumber && { serialNumber: dto.serialNumber }),
        ...(dto?.purchasedAt && { purchasedAt: dto.purchasedAt }),
        ...(dto?.purchaseValue !== undefined && { purchaseValue: dto.purchaseValue, bookValue: dto.purchaseValue }),
        ...(dto?.depreciationRate !== undefined && { depreciationRate: dto.depreciationRate }),
        ...(dto?.depreciationMethod && { depreciationMethod: dto.depreciationMethod }),
        ...(dto?.isHighValue !== undefined && { isHighValue: dto.isHighValue }),
      },
      select: UNIT_SELECT,
    });
  }

  updateUnitDepreciation(unitId: string, bookValue: number) {
    return this.prisma.equipmentUnit.update({
      where: { id: unitId },
      data: { bookValue },
    });
  }

  findUnitWithDepreciation(unitId: string) {
    return this.prisma.equipmentUnit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        purchaseValue: true,
        bookValue: true,
        depreciationRate: true,
        depreciationMethod: true,
        purchasedAt: true,
      },
    });
  }

  findUnitById(id: string, actorClubId?: number) {
    return this.prisma.equipmentUnit.findFirst({
      where: { id, ...(actorClubId !== undefined ? { clubId: actorClubId } : {}) },
      select: UNIT_SELECT,
    });
  }

  updateUnitStatus(id: string, status: EquipmentUnitStatus, disposalData?: { disposedById?: string; disposedAt?: Date; disposalNote?: string }) {
    return this.prisma.equipmentUnit.update({
      where: { id },
      data: {
        status,
        ...(disposalData?.disposedById !== undefined && { disposedById: disposalData.disposedById }),
        ...(disposalData?.disposedAt !== undefined && { disposedAt: disposalData.disposedAt }),
        ...(disposalData?.disposalNote !== undefined && { disposalNote: disposalData.disposalNote }),
      },
      select: UNIT_SELECT,
    });
  }

  updateUnit(id: string, data: {
    lastSanitizedAt?: Date;
    sanitationStatus?: string;
    lastInspectedAt?: Date;
    inspectionIntervalDays?: number;
    nextInspectionDue?: Date;
  }) {
    return this.prisma.equipmentUnit.update({
      where: { id },
      data,
      select: UNIT_SELECT,
    });
  }

  createAssignment(dto: CreateAssignmentDto) {
    return this.prisma.equipmentAssignment.create({
      data: {
        playerId: dto.playerId,
        equipmentItemId: dto.equipmentItemId ?? null,
        equipmentUnitId: dto.equipmentUnitId ?? null,
      },
      select: ASSIGNMENT_SELECT,
    });
  }

  findUnreturnedByPlayer(playerId: string) {
    return this.prisma.equipmentAssignment.findMany({
      where: { playerId, returnedAt: null },
      select: ASSIGNMENT_SELECT,
    });
  }

  findAssignmentById(id: string) {
    return this.prisma.equipmentAssignment.findUnique({ where: { id }, select: ASSIGNMENT_SELECT });
  }

  markReturned(id: string) {
    return this.prisma.equipmentAssignment.update({
      where: { id },
      data: { returnedAt: new Date() },
      select: ASSIGNMENT_SELECT,
    });
  }

  findEquipmentManagers() {
    return this.prisma.user.findMany({
      where: { frontOfficeRole: "EQUIPMENT_MANAGER", isDeleted: false },
      select: { id: true },
    });
  }

  findLoanById(id: string, actorClubId?: number) {
    return this.prisma.equipmentLoan.findFirst({
      where: { id, ...(actorClubId !== undefined ? { clubId: actorClubId } : {}) },
      select: LOAN_SELECT,
    });
  }

  findAllLoans(status?: EquipmentLoanStatus, actorClubId?: number) {
    const where: any = {};
    if (status !== undefined) where.status = status;
    if (actorClubId !== undefined) where.clubId = actorClubId;
    return this.prisma.equipmentLoan.findMany({
      ...(Object.keys(where).length > 0 && { where }),
      select: LOAN_SELECT,
      orderBy: { requestedAt: "desc" },
    });
  }

  findMyLoans(userId: string, actorClubId?: number) {
    return this.prisma.equipmentLoan.findMany({
      where: { requestedById: userId, ...(actorClubId !== undefined ? { clubId: actorClubId } : {}) },
      select: LOAN_SELECT,
      orderBy: { requestedAt: "desc" },
    });
  }

  createLoan(requestedById: string, dto: CreateEquipmentLoanDto, actorClubId?: number) {
    return this.prisma.equipmentLoan.create({
      data: {
        requestedById,
        equipmentItemId: dto.equipmentItemId,
        clubId: actorClubId ?? null,
        dueDate: new Date(dto.dueDate),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      select: LOAN_SELECT,
    });
  }

  hasActiveOverdueLoan(requestedById: string, now: Date = new Date()) {
    return this.prisma.equipmentLoan.findFirst({
      where: {
        requestedById,
        status: "ISSUED",
        returnedAt: null,
        dueDate: { lt: now },
      },
      select: { id: true },
    });
  }

  findLoansToNotifyOverdue(now: Date = new Date()) {
    // 의무장비 대여는 자체 ledger escalation 으로 알림 처리 → 여기서 제외.
    return this.prisma.equipmentLoan.findMany({
      where: {
        status: "ISSUED",
        returnedAt: null,
        dueDate: { lt: now },
        overdueNotifiedAt: null,
        medicalLedger: { is: null },
      },
      select: {
        id: true,
        dueDate: true,
        requestedById: true,
        approvedById: true,
        equipmentItem: { select: { name: true } },
      },
    });
  }

  markOverdueNotified(loanIds: string[], now: Date = new Date()) {
    return this.prisma.equipmentLoan.updateMany({
      where: { id: { in: loanIds } },
      data: { overdueNotifiedAt: now },
    });
  }

  updateLoan(id: string, data: {
    status: EquipmentLoanStatus;
    approvedById?: string;
    equipmentUnitId?: string;
    issuedAt?: Date;
    returnedAt?: Date;
  }) {
    return this.prisma.equipmentLoan.update({
      where: { id },
      data,
      select: LOAN_SELECT,
    });
  }

  returnLoan(id: string, _returnedById: string, returnNote?: string) {
    // NOTE: returnedById 파라미터는 audit log 에서만 사용됨 (schema 에 필드 없음).
    return this.prisma.equipmentLoan.update({
      where: { id },
      data: {
        status: "RETURNED" as EquipmentLoanStatus,
        returnedAt: new Date(),
        ...(returnNote !== undefined && { returnNote }),
      },
      select: LOAN_SELECT,
    });
  }
}
