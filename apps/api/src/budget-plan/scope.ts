import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";

export type CategoryScope = "TEAM" | "DEPARTMENT";

export interface RequesterScope {
  scope: CategoryScope;
  ownerId: string;
}

export async function resolveRequesterScope(
  userId: string,
  prisma: Pick<PrismaClient, "coach" | "department">,
): Promise<RequesterScope> {
  const [headCoach, headOfDepartment] = await Promise.all([
    prisma.coach.findFirst({
      where: { userId, coachingRole: "HEAD_COACH", teamId: { not: null } },
      select: { teamId: true },
    }),
    prisma.department.findFirst({
      where: { headId: userId },
      select: { id: true },
    }),
  ]);

  const isTeamLeader = headCoach !== null && headCoach.teamId !== null;
  const isDepartmentHead = headOfDepartment !== null;

  if (isTeamLeader && isDepartmentHead) {
    throw new AppError(409, "AMBIGUOUS_BUDGET_PLAN_SCOPE");
  }
  if (isTeamLeader) {
    return { scope: "TEAM", ownerId: headCoach!.teamId! };
  }
  if (isDepartmentHead) {
    return { scope: "DEPARTMENT", ownerId: headOfDepartment!.id };
  }
  throw new AppError(403, "NOT_BUDGET_PLAN_REQUESTER");
}

export function assertCategoryScopeMatch(
  requester: RequesterScope,
  category: { scope: CategoryScope },
): void {
  if (requester.scope !== category.scope) {
    throw new AppError(403, "CATEGORY_SCOPE_MISMATCH");
  }
}
