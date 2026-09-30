import { getPrisma } from "../lib/prisma";

const prisma = getPrisma();

export const medicalEquipmentLoanRepo = {
  async findLedgerById(id: string) {
    return prisma.medicalEquipmentLoanLedger.findUnique({
      where: { id },
      include: { equipmentLoan: true, partner: true, budgetLine: true },
    });
  },

  async findLedgerByLoanId(equipmentLoanId: string) {
    return prisma.medicalEquipmentLoanLedger.findUnique({
      where: { equipmentLoanId },
      include: { equipmentLoan: true },
    });
  },

  async findAll(filter?: { status?: string; requestedById?: string }) {
    return prisma.medicalEquipmentLoanLedger.findMany({
      where: {
        ...(filter?.status ? { status: filter.status as any } : {}),
        ...(filter?.requestedById ? { requestedById: filter.requestedById } : {}),
      },
      include: {
        equipmentLoan: { include: { equipmentItem: true } },
        requestedBy: { select: { id: true, nickname: true } },
        approvedBy: { select: { id: true, nickname: true } },
        partner: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async findOverdueEmergency(cutoffDate: Date) {
    return prisma.medicalEquipmentLoanLedger.findMany({
      where: {
        status: "EMERGENCY_PENDING_POST_APPROVAL",
        escalatedAt: null,
        equipmentLoan: { issuedAt: { lt: cutoffDate } },
      },
      include: {
        equipmentLoan: { select: { issuedAt: true } },
        requestedBy: { select: { id: true, nickname: true } },
      },
    });
  },
};
