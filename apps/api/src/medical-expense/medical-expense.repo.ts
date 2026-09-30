import { PrismaClient } from "../generated/client";

const userSelect = {
  id: true,
  nickname: true,
  role: true,
  coachingRole: true,
} as const;

const expenseInclude = {
  submittedBy: { select: userSelect },
  leaderReviewer: { select: userSelect },
  adminReviewer: { select: userSelect },
  injury: { select: { id: true, bodyPart: true, playerId: true } },
  player: { select: { id: true, playerName: true, position: true } },
} as const;

export class MedicalExpenseRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(submittedById: string | null) {
    const where = submittedById !== null ? { submittedById } : {};
    return this.prisma.medicalExpense.findMany({
      where,
      include: expenseInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string) {
    return this.prisma.medicalExpense.findUnique({
      where: { id },
      include: expenseInclude,
    });
  }

  findPlayerLevel(playerId: string) {
    return this.prisma.player
      .findUnique({ where: { id: playerId }, select: { level: true } })
      .then((p) => p?.level ?? null);
  }

  create(data: {
    submittedById: string;
    receiptDate: Date;
    costCategory: string;
    totalAmount: number;
    payerType: string;
    injuryId?: number;
    playerId?: string;
    description?: string;
    fileUrl?: string;
    fileName?: string;
  }) {
    return this.prisma.medicalExpense.create({
      data: data as any,
      include: expenseInclude,
    });
  }

  update(id: string, data: {
    receiptDate?: Date;
    costCategory?: string;
    totalAmount?: number;
    payerType?: string;
    injuryId?: number | null;
    playerId?: string | null;
    description?: string;
    fileUrl?: string;
    fileName?: string;
  }) {
    return this.prisma.medicalExpense.update({
      where: { id },
      data: data as any,
      include: expenseInclude,
    });
  }

  submit(id: string) {
    return this.prisma.medicalExpense.update({
      where: { id },
      data: { status: "SUBMITTED", submittedAt: new Date(), rejectionReason: null },
      include: expenseInclude,
    });
  }

  leaderApprove(id: string, leaderReviewerId: string) {
    return this.prisma.medicalExpense.update({
      where: { id },
      data: { status: "LEADER_APPROVED", leaderReviewerId, leaderReviewedAt: new Date() },
      include: expenseInclude,
    });
  }

  leaderReject(id: string, leaderReviewerId: string, rejectionReason: string) {
    return this.prisma.medicalExpense.update({
      where: { id },
      data: { status: "REJECTED", leaderReviewerId, rejectionReason, leaderReviewedAt: new Date() },
      include: expenseInclude,
    });
  }

  approve(id: string, adminReviewerId: string) {
    return this.prisma.medicalExpense.update({
      where: { id },
      data: { status: "APPROVED", adminReviewerId, adminReviewedAt: new Date() },
      include: expenseInclude,
    });
  }

  reject(id: string, adminReviewerId: string, rejectionReason: string) {
    return this.prisma.medicalExpense.update({
      where: { id },
      data: { status: "REJECTED", adminReviewerId, rejectionReason, adminReviewedAt: new Date() },
      include: expenseInclude,
    });
  }
}
