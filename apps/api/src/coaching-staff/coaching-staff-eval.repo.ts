import { PrismaClient } from "../generated/client";

export class CoachingStaffEvalRepository {
  constructor(private prisma: PrismaClient) {}

  listForStaff(staffUserId: string) {
    return this.prisma.coachingStaffEvaluation.findMany({
      where: { staffUserId },
      include: {
        evaluator: { select: { id: true, nickname: true, coachingRole: true } },
      },
      orderBy: { evaluatedAt: "desc" },
    });
  }

  create(staffUserId: string, evaluatorId: string, score: number, comment?: string) {
    return this.prisma.coachingStaffEvaluation.create({
      data: { staffUserId, evaluatorId, score, comment: comment ?? null },
    });
  }
}
