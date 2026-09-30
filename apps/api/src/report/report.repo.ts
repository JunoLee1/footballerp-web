import { PrismaClient } from "../generated/client";

const authorSelect = {
  id: true,
  nickname: true,
  role: true,
  coachingRole: true,
  frontOfficeRole: true,
} as const;

const reviewInclude = {
  reviews: {
    include: {
      reviewerDept: { select: { id: true, name: true, category: true } },
      confirmedBy: { select: authorSelect },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

const reportInclude = {
  author: { select: authorSelect },
  reviewer: { select: authorSelect },
  firstReviewer: { select: authorSelect },
  secondReviewer: { select: authorSelect },
  department: { select: { id: true, name: true, category: true } },
  ...reviewInclude,
} as const;

export class ReportRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(
    userId: string,
    isGM: boolean,
    isHeadCoach: boolean = false,
    filters: { type?: string; status?: string } = {},
    deptCategories: string[] = [],
    isHrStaff: boolean = false,
    isAssetStaff: boolean = false,
    isFinanceStaff: boolean = false,
  ) {
    const roleWhere = isGM
      ? {}
      : isHeadCoach
        ? { OR: [{ authorId: userId }, { type: "TRAINING" as const }] }
        : isHrStaff
          ? { OR: [{ authorId: userId }, { type: "HR" as const }] }
          : isAssetStaff
            ? { OR: [{ authorId: userId }, { type: "ASSET" as const }] }
            : isFinanceStaff
              ? { OR: [{ authorId: userId }, { type: "FINANCIAL" as const }] }
              : deptCategories.length > 0
                ? {
                    OR: [
                      { authorId: userId },
                      ...(deptCategories.includes("HR") ? [{ type: "HR" as const }] : []),
                      ...(deptCategories.includes("FINANCE") ? [{ type: "FINANCIAL" as const }] : []),
                      ...(deptCategories.includes("COMPLIANCE") ? [{ type: "ASSET" as const }] : []),
                    ],
                  }
                : { authorId: userId };

    const filterWhere = {
      ...(filters.type && { type: filters.type as any }),
      ...(filters.status && { status: filters.status as any }),
    };

    return this.prisma.report.findMany({
      where: { ...roleWhere, ...filterWhere },
      include: reportInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.report.findUnique({
      where: { id },
      include: reportInclude,
    });
  }

  create(data: { authorId: string; type: string; title: string; content: string; fileUrl?: string; fileName?: string; departmentId?: number }) {
    return this.prisma.report.create({
      data: data as any,
      include: reportInclude,
    });
  }

  update(id: number, data: { title?: string; content?: string; fileUrl?: string; fileName?: string }) {
    return this.prisma.report.update({
      where: { id },
      data,
      include: reportInclude,
    });
  }

  async submitWithReviews(id: number, reviewerDeptIds: number[]) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.report.update({
        where: { id },
        data: {
          status: reviewerDeptIds.length > 0 ? "REVIEWING" : "SUBMITTED",
          submittedAt: new Date(),
          rejectionReason: null,
        },
        include: reportInclude,
      });

      if (reviewerDeptIds.length > 0) {
        await tx.reportReview.createMany({
          data: reviewerDeptIds.map((deptId) => ({ reportId: id, reviewerDeptId: deptId })),
          skipDuplicates: true,
        });
      }

      return report;
    });
  }

  findReview(reportId: number, reviewerDeptId: number) {
    return this.prisma.reportReview.findUnique({
      where: { reportId_reviewerDeptId: { reportId, reviewerDeptId } },
    });
  }

  async confirmReview(reportId: number, reviewerDeptId: number, userId: string, comment?: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.reportReview.update({
        where: { reportId_reviewerDeptId: { reportId, reviewerDeptId } },
        data: { status: "CONFIRMED", confirmedById: userId, confirmedAt: new Date(), comment: comment ?? null },
      });

      const pending = await tx.reportReview.count({ where: { reportId, status: "PENDING" } });

      if (pending === 0) {
        return tx.report.update({
          where: { id: reportId },
          data: { status: "APPROVED", reviewedAt: new Date() },
          include: reportInclude,
        });
      }

      return tx.report.findUnique({ where: { id: reportId }, include: reportInclude });
    });
  }

  async rejectReview(reportId: number, reviewerDeptId: number, userId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.reportReview.update({
        where: { reportId_reviewerDeptId: { reportId, reviewerDeptId } },
        data: { status: "REJECTED", confirmedById: userId, confirmedAt: new Date(), comment: reason },
      });

      return tx.report.update({
        where: { id: reportId },
        data: { status: "REJECTED", rejectionReason: reason, reviewedAt: new Date() },
        include: reportInclude,
      });
    });
  }

  approve(id: number, reviewerId: string, nextStatus: "FIRST_APPROVED" | "SECOND_APPROVED" | "APPROVED") {
    const now = new Date();
    const data =
      nextStatus === "FIRST_APPROVED"
        ? { status: nextStatus, firstReviewerId: reviewerId, firstReviewedAt: now }
        : nextStatus === "SECOND_APPROVED"
          ? { status: nextStatus, secondReviewerId: reviewerId, secondReviewedAt: now }
          : { status: nextStatus as "APPROVED", reviewerId, reviewedAt: now };

    return this.prisma.report.update({
      where: { id },
      data,
      include: reportInclude,
    });
  }

  rejectDirect(id: number, reviewerId: string, reason: string) {
    return this.prisma.report.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: reason, reviewerId, reviewedAt: new Date() },
      include: reportInclude,
    });
  }

  findRulesByType(reportType: string) {
    return this.prisma.reviewRuleSet.findMany({
      where: { reportType: reportType as any },
    });
  }

  listRuleSets() {
    return this.prisma.reviewRuleSet.findMany({ orderBy: [{ reportType: "asc" }, { reviewerCategory: "asc" }] });
  }

  createRuleSet(reportType: string, reviewerCategory: string) {
    return this.prisma.reviewRuleSet.create({ data: { reportType: reportType as any, reviewerCategory: reviewerCategory as any } });
  }

  deleteRuleSet(id: number) {
    return this.prisma.reviewRuleSet.delete({ where: { id } });
  }

  findDeptsByCategory(categories: string[]) {
    return this.prisma.department.findMany({
      where: { category: { in: categories as any }, isActive: true, headId: { not: null } },
      select: { id: true, name: true, category: true, headId: true },
    });
  }
}
