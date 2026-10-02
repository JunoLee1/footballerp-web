import { PrismaClient } from "../generated/client";

export class DepartmentReviewerConfigRepository {
  constructor(private prisma: PrismaClient) {}

  findBySubject(subjectDepartmentId: string) {
    return this.prisma.departmentReviewerConfig.findMany({
      where: { subjectDepartmentId },
      include: {
        reviewerDepartment: { select: { id: true, name: true } },
      },
    });
  }

  create(subjectDepartmentId: string, reviewerDepartmentId: string) {
    return this.prisma.departmentReviewerConfig.create({
      data: { subjectDepartmentId, reviewerDepartmentId },
      include: { reviewerDepartment: { select: { id: true, name: true } } },
    });
  }

  delete(id: string) {
    return this.prisma.departmentReviewerConfig.delete({ where: { id } });
  }

  findReviewerDeptIds(subjectDepartmentId: string): Promise<string[]> {
    return this.prisma.departmentReviewerConfig
      .findMany({
        where: { subjectDepartmentId },
        select: { reviewerDepartmentId: true },
      })
      .then((rows) => rows.map((r) => r.reviewerDepartmentId));
  }
}
