import { getPrisma } from "../lib/prisma";
import { AppError } from "../lib/appError";
import { Prisma } from "../generated/client";
import {
  canRequestMedicalEquipmentLoan,
  canApproveMedicalEquipmentLoan,
  isAdminLike,
} from "../lib/permissions";
import { resolvePartnerDiscount } from "./helpers/resolvePartnerDiscount";
import { checkAndReserveBudget } from "./helpers/checkAndReserveBudget";
import { NotificationRepository } from "../notification/notification.repo";
import type {
  RequestNormalMedicalLoanDto,
  RequestEmergencyMedicalLoanDto,
  ApproveMedicalLoanDto,
  RejectMedicalLoanDto,
} from "./dto/medical-equipment-loan.dto";

const prisma = getPrisma();
const notifRepo = new NotificationRepository(prisma);

async function getUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, coachingRole: true, nickname: true },
  });
  if (!user) throw new AppError(404, "USER_NOT_FOUND");
  return user;
}

function computeFinalCost(originalCost: number, discountRate: number): number {
  return Math.round(originalCost * (1 - discountRate / 100));
}

// #551: EquipmentLoan.dueDate 필수 필드 → 의무장비 대여는 자체 ledger 로 escalation 관리하므로
// 기본 30일 dueDate 를 부여하고, 일반 EquipmentLoan overdue cron 은 medicalLedger 있으면 제외한다.
const MEDICAL_LOAN_DEFAULT_DUE_DAYS = 30;
function defaultMedicalLoanDueDate(): Date {
  return new Date(Date.now() + MEDICAL_LOAN_DEFAULT_DUE_DAYS * 86_400_000);
}

async function getMedicalDeptId(
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  const dept = await tx.department.findFirst({
    where: { name: { contains: "의무" } },
    select: { id: true },
  });
  if (!dept) throw new AppError(500, "MEDICAL_DEPT_NOT_FOUND");
  return dept.id;
}

function notifyDirector(type: string, entityId: number, title: string, body: string) {
  return notifRepo.createForMedicalDirector(type, () => ({ title, body }), entityId);
}

// ─── 일반 대여 요청 ─────────────────────────────────────────────────────────

export async function requestNormalLoan(
  requestedById: string,
  dto: RequestNormalMedicalLoanDto
) {
  const user = await getUser(requestedById);
  if (!canRequestMedicalEquipmentLoan(user)) {
    throw new AppError(403, "MEDICAL_ROLE_REQUIRED");
  }

  const discount = await resolvePartnerDiscount(dto.equipmentItemId);

  let appliedDiscountRate = discount.discountRate;
  if (dto.overrideDiscountRate !== undefined) {
    if (!dto.overrideReason) throw new AppError(400, "OVERRIDE_REASON_REQUIRED");
    appliedDiscountRate = dto.overrideDiscountRate;
  }

  const finalCost = computeFinalCost(dto.originalCost, appliedDiscountRate);

  return prisma.$transaction(async (tx) => {
    const departmentId = await getMedicalDeptId(tx);

    const { operatingExpenseId } = await checkAndReserveBudget(tx, {
      budgetLineId: dto.budgetLineId,
      amount: finalCost,
      seasonId: dto.seasonId,
      categoryId: dto.categoryId,
      departmentId,
      createdById: requestedById,
      note: "의무기기 대여 (일반)",
    });

    const loan = await tx.equipmentLoan.create({
      data: {
        requestedById,
        equipmentItemId: dto.equipmentItemId,
        ...(dto.equipmentUnitId !== undefined && { equipmentUnitId: dto.equipmentUnitId }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        status: "REQUESTED",
        dueDate: defaultMedicalLoanDueDate(),
      },
    });

    const ledger = await tx.medicalEquipmentLoanLedger.create({
      data: {
        equipmentLoanId: loan.id,
        status: "DRAFT",
        requestedById,
        isEmergency: false,
        partnerId: discount.partnerId,
        partnerContractId: discount.partnerContractId,
        sponsorshipId: discount.sponsorshipId,
        discountRate: appliedDiscountRate,
        originalCost: dto.originalCost,
        finalCost,
        ...(dto.overrideReason !== undefined && { overrideReason: dto.overrideReason }),
        budgetLineId: dto.budgetLineId,
        operatingExpenseId,
      },
    });

    void notifyDirector(
      "MEDICAL_EQUIPMENT_LOAN_REQUESTED",
      loan.id,
      "의무기기 대여 신청",
      `${user.nickname} 님의 의무기기 대여 신청이 접수됐습니다.`
    ).catch(console.error);

    return { loan, ledger };
  });
}

// ─── 응급 대여 요청 ─────────────────────────────────────────────────────────

export async function requestEmergencyLoan(
  requestedById: string,
  dto: RequestEmergencyMedicalLoanDto
) {
  const user = await getUser(requestedById);
  if (!canRequestMedicalEquipmentLoan(user)) {
    throw new AppError(403, "MEDICAL_ROLE_REQUIRED");
  }
  if (!dto.emergencyReason?.trim()) {
    throw new AppError(400, "EMERGENCY_REASON_REQUIRED");
  }

  const discount = await resolvePartnerDiscount(dto.equipmentItemId);
  let appliedDiscountRate = discount.discountRate;
  if (dto.overrideDiscountRate !== undefined) {
    if (!dto.overrideReason) throw new AppError(400, "OVERRIDE_REASON_REQUIRED");
    appliedDiscountRate = dto.overrideDiscountRate;
  }
  const finalCost = computeFinalCost(dto.originalCost, appliedDiscountRate);

  return prisma.$transaction(async (tx) => {
    const loan = await tx.equipmentLoan.create({
      data: {
        requestedById,
        equipmentItemId: dto.equipmentItemId,
        ...(dto.equipmentUnitId !== undefined && { equipmentUnitId: dto.equipmentUnitId }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        status: "ISSUED",
        issuedAt: new Date(),
        dueDate: defaultMedicalLoanDueDate(),
      },
    });

    const ledger = await tx.medicalEquipmentLoanLedger.create({
      data: {
        equipmentLoanId: loan.id,
        status: "EMERGENCY_PENDING_POST_APPROVAL",
        requestedById,
        isEmergency: true,
        emergencyReason: dto.emergencyReason,
        partnerId: discount.partnerId,
        partnerContractId: discount.partnerContractId,
        sponsorshipId: discount.sponsorshipId,
        discountRate: appliedDiscountRate,
        originalCost: dto.originalCost,
        finalCost,
        ...(dto.overrideReason !== undefined && { overrideReason: dto.overrideReason }),
      },
    });

    void notifyDirector(
      "MEDICAL_EQUIPMENT_LOAN_EMERGENCY_ISSUED",
      loan.id,
      "응급 대여 사후 승인 요청",
      `${user.nickname} 님의 응급 대여가 지급됐습니다. D+1 09:00 까지 사후 승인 필요.`
    ).catch(console.error);

    return { loan, ledger };
  });
}

// ─── 승인 (일반 + 응급 사후) ─────────────────────────────────────────────────

export async function approveLoan(
  ledgerId: number,
  approverId: string,
  dto: ApproveMedicalLoanDto = {}
) {
  const approver = await getUser(approverId);
  if (!canApproveMedicalEquipmentLoan(approver)) {
    throw new AppError(403, "MEDICAL_DIRECTOR_REQUIRED");
  }

  const ledger = await prisma.medicalEquipmentLoanLedger.findUnique({
    where: { id: ledgerId },
    include: { equipmentLoan: { include: { equipmentItem: true } } },
  });
  if (!ledger) throw new AppError(404, "LEDGER_NOT_FOUND");

  if (ledger.requestedById === approverId && !isAdminLike(approver.role)) {
    throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");
  }

  const isDraft = ledger.status === "DRAFT";
  const isEmergencyPending = ledger.status === "EMERGENCY_PENDING_POST_APPROVAL";

  if (!isDraft && !isEmergencyPending) {
    throw new AppError(400, "INVALID_STATUS_FOR_APPROVAL");
  }

  return prisma.$transaction(async (tx) => {
    let operatingExpenseId = ledger.operatingExpenseId;
    let budgetLineIdToSet = ledger.budgetLineId;

    if (isEmergencyPending) {
      if (!dto.budgetLineId || !dto.seasonId || !dto.categoryId) {
        throw new AppError(400, "BUDGET_LINE_REQUIRED_FOR_EMERGENCY_BACKFILL");
      }
      const departmentId = await getMedicalDeptId(tx);
      const { operatingExpenseId: expId } = await checkAndReserveBudget(tx, {
        budgetLineId: dto.budgetLineId,
        amount: ledger.finalCost,
        seasonId: dto.seasonId,
        categoryId: dto.categoryId,
        departmentId,
        createdById: approverId,
        note: "의무기기 대여 (응급 사후)",
      });
      operatingExpenseId = expId;
      budgetLineIdToSet = dto.budgetLineId;
    } else {
      await tx.equipmentLoan.update({
        where: { id: ledger.equipmentLoanId },
        data: { status: "APPROVED", approvedById: approverId },
      });
    }

    const newStatus = isEmergencyPending ? "EMERGENCY_RESOLVED" : "APPROVED";

    const updated = await tx.medicalEquipmentLoanLedger.update({
      where: { id: ledgerId },
      data: {
        status: newStatus as any,
        approvedById: approverId,
        approvedAt: new Date(),
        operatingExpenseId,
        budgetLineId: budgetLineIdToSet,
      },
    });

    const notifType = isEmergencyPending
      ? "MEDICAL_EQUIPMENT_LOAN_EMERGENCY_RESOLVED"
      : "MEDICAL_EQUIPMENT_LOAN_APPROVED";
    const itemName = ledger.equipmentLoan.equipmentItem?.name ?? "장비";
    void notifRepo
      .create({
        userId: ledger.requestedById,
        type: notifType,
        title: isEmergencyPending ? "응급 사후 승인 완료" : "대여 승인",
        body: `${itemName} 대여가 승인됐습니다.`,
        entityId: ledger.equipmentLoanId,
      })
      .catch(console.error);

    return updated;
  });
}

// ─── 반려 ────────────────────────────────────────────────────────────────────

export async function rejectLoan(
  ledgerId: number,
  approverId: string,
  dto: RejectMedicalLoanDto
) {
  const approver = await getUser(approverId);
  if (!canApproveMedicalEquipmentLoan(approver)) {
    throw new AppError(403, "MEDICAL_DIRECTOR_REQUIRED");
  }
  if (!dto.rejectionReason?.trim()) {
    throw new AppError(400, "REJECTION_REASON_REQUIRED");
  }

  const ledger = await prisma.medicalEquipmentLoanLedger.findUnique({
    where: { id: ledgerId },
    include: { equipmentLoan: { include: { equipmentItem: true } } },
  });
  if (!ledger) throw new AppError(404, "LEDGER_NOT_FOUND");

  if (ledger.requestedById === approverId && !isAdminLike(approver.role)) {
    throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");
  }

  const isDraft = ledger.status === "DRAFT";
  const isEmergencyPending = ledger.status === "EMERGENCY_PENDING_POST_APPROVAL";

  if (!isDraft && !isEmergencyPending) {
    throw new AppError(400, "INVALID_STATUS_FOR_REJECTION");
  }

  return prisma.$transaction(async (tx) => {
    if (isDraft) {
      await tx.equipmentLoan.update({
        where: { id: ledger.equipmentLoanId },
        data: { status: "REJECTED" },
      });
      if (ledger.operatingExpenseId) {
        await tx.operatingExpense.update({
          where: { id: ledger.operatingExpenseId },
          data: { status: "CANCELLED" },
        });
      }
    }

    const newStatus = isEmergencyPending ? "EMERGENCY_REJECTED" : "REJECTED";

    const updated = await tx.medicalEquipmentLoanLedger.update({
      where: { id: ledgerId },
      data: {
        status: newStatus as any,
        rejectedById: approverId,
        rejectedAt: new Date(),
        rejectionReason: dto.rejectionReason,
      },
    });

    const itemName = ledger.equipmentLoan.equipmentItem?.name ?? "장비";
    const notifType = isEmergencyPending
      ? "MEDICAL_EQUIPMENT_LOAN_EMERGENCY_REJECTED"
      : "MEDICAL_EQUIPMENT_LOAN_REJECTED";

    void notifRepo
      .create({
        userId: ledger.requestedById,
        type: notifType,
        title: isEmergencyPending ? "응급 사후 반려 — 즉시 반납" : "대여 반려",
        body: isEmergencyPending
          ? `${itemName} 반려 사유: ${dto.rejectionReason}. 기기를 즉시 반납해주세요.`
          : `${itemName} 반려 사유: ${dto.rejectionReason}`,
        entityId: ledger.equipmentLoanId,
      })
      .catch(console.error);

    if (isEmergencyPending) {
      void notifRepo
        .create({
          userId: ledger.requestedById,
          type: "MEDICAL_EQUIPMENT_LOAN_RETURN_REQUIRED",
          title: "반납 요구",
          body: `${itemName} 을 즉시 반납해주세요.`,
          entityId: ledger.equipmentLoanId,
        })
        .catch(console.error);
    }

    return updated;
  });
}
