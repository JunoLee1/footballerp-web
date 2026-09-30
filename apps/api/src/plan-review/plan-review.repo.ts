import { PrismaClient } from "../generated/client";

export class PlanReviewRepository {
  constructor(private prisma: PrismaClient) {}

  // 계획서의 모든 검토 레코드 조회
  findByPlan(planId: number) {
    return this.prisma.planReview.findMany({
      where: { planId },
      include: {
        reviewerDept: { select: { id: true, name: true } },
        confirmedBy: { select: { id: true, username: true } },
      },
    });
  }

  // submit 시 자동 생성
  createMany(planId: number, reviewerDeptIds: number[]) {
    return this.prisma.planReview.createMany({
      data: reviewerDeptIds.map((reviewerDeptId) => ({ planId, reviewerDeptId })),
      skipDuplicates: true,
    });
  }

  // 확인 완료
  confirm(planId: number, reviewerDeptId: number, confirmedById: string, comment?: string) {
    return this.prisma.planReview.update({
      where: { planId_reviewerDeptId: { planId, reviewerDeptId } },
      data: {
        status: "CONFIRMED",
        comment: comment ?? null,
        confirmedById,
        confirmedAt: new Date(),
      },
    });
  }

  // 모든 검토 완료 여부
  async allConfirmed(planId: number): Promise<boolean> {
    const total = await this.prisma.planReview.count({ where: { planId } });
    if (total === 0) return false; // FIX(Y4): 검토자 없으면 검토 단계 통과 불가
    const confirmed = await this.prisma.planReview.count({
      where: { planId, status: "CONFIRMED" },
    });
    return total === confirmed;
  }

  reject(planId: number, reviewerDeptId: number, rejectedById: string, reason: string) {
    return this.prisma.planReview.update({
      where: { planId_reviewerDeptId: { planId, reviewerDeptId } },
      data: {
        status: "REJECTED",
        comment: reason,
        confirmedById: rejectedById,
        confirmedAt: new Date(),
      },
    });
  }
}
