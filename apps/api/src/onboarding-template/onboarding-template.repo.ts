import type { Prisma, PrismaClient } from "../generated/client";

/**
 * Includes shared by all read paths so the FE can render `createdBy` /
 * `updatedBy` badges without a follow-up round-trip. Kept narrow
 * (id/username/nickname) to avoid dragging User PII into the JSON.
 */
const TEMPLATE_INCLUDE = {
  createdBy: { select: { id: true, username: true, nickname: true } },
  updatedBy: { select: { id: true, username: true, nickname: true } },
} as const;

export interface UpsertTemplateData {
  name: string;
  tasks: Prisma.InputJsonValue;
  actorId: string;
}

/**
 * Prisma boundary for OnboardingTemplate. Department 1:1 via unique
 * `departmentId`, so `upsert` is the natural write shape — the same body
 * either creates a new row or replaces an existing one.
 */
export class OnboardingTemplateRepository {
  constructor(private prisma: PrismaClient) {}

  findByDepartmentId(departmentId: string) {
    return this.prisma.onboardingTemplate.findUnique({
      where: { departmentId },
      include: TEMPLATE_INCLUDE,
    });
  }

  /**
   * Upsert-by-departmentId. `createdById` only lands on create; on update
   * we record `updatedById` so an audit can distinguish original author
   * from last editor.
   */
  upsert(departmentId: string, data: UpsertTemplateData) {
    return this.prisma.onboardingTemplate.upsert({
      where: { departmentId },
      create: {
        departmentId,
        name: data.name,
        tasks: data.tasks,
        createdById: data.actorId,
      },
      update: {
        name: data.name,
        tasks: data.tasks,
        updatedById: data.actorId,
      },
      include: TEMPLATE_INCLUDE,
    });
  }//TODO 업설트 댜신에 tx 도입 고려

  remove(departmentId: string) {
    return this.prisma.onboardingTemplate.delete({
      where: { departmentId },
    });
  }
}
