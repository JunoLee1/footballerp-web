import type { PrismaClient } from "../generated/client";
import type { OnboardingTaskStatus } from "../generated/enums";

const TASK_INCLUDE = {
  verifiedBy: { select: { id: true, username: true, nickname: true } },
} as const;

/**
 * Selected onboarding fields needed for authorization checks (owner match,
 * dept.head lookup). Wider than usual because task-level permission needs
 * `Onboarding.userId` and the dispatch's department head.
 */
const ONBOARDING_AUTH_INCLUDE = {
  onboarding: {
    select: {
      id: true,
      userId: true,
      hiringDispatch: {
        select: {
          id: true,
          departmentId: true,
          department: { select: { id: true, headId: true } },
        },
      },
    },
  },
} as const;

export interface UpdateTaskStatusData {
  status: OnboardingTaskStatus;
  selfReportedAt?: Date | null;
  verifiedById?: string | null;
  verifiedAt?: Date | null;
  verifyNotes?: string | null;
  skipReason?: string | null;
}

/**
 * Prisma boundary for OnboardingTask. Task rows are populated by
 * `populateOnboardingTasks()` inside the dispatch $transaction; this
 * repository handles the read + state-transition side.
 */
export class OnboardingTaskRepository {
  constructor(private prisma: PrismaClient) {}

  findById(id: number) {
    return this.prisma.onboardingTask.findUnique({
      where: { id },
      include: { ...TASK_INCLUDE, ...ONBOARDING_AUTH_INCLUDE },
    });
  }

  findByOnboardingId(onboardingId: number) {
    return this.prisma.onboardingTask.findMany({
      where: { onboardingId },
      include: TASK_INCLUDE,
      orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
    });
  }

  /**
   * SELF_REPORTED tasks awaiting verify — HR/dept.head verify queue.
   * Optional dispatch/department filter so a dept.head only sees their team.
   */
  findVerifyQueue(filter?: { departmentId?: number }) {
    const where: {
      status: OnboardingTaskStatus;
      onboarding?: { hiringDispatch?: { departmentId: number } };
    } = { status: "SELF_REPORTED" };
    if (filter?.departmentId != null) {
      where.onboarding = { hiringDispatch: { departmentId: filter.departmentId } };
    }
    return this.prisma.onboardingTask.findMany({
      where,
      include: {
        ...TASK_INCLUDE,
        onboarding: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, username: true, nickname: true } },
            hiringDispatch: {
              select: { id: true, departmentId: true, candidateName: true },
            },
          },
        },
      },
      orderBy: [{ selfReportedAt: "asc" as const }, { id: "asc" as const }],
    });
  }

  updateStatus(id: number, data: UpdateTaskStatusData) {
    return this.prisma.onboardingTask.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.selfReportedAt !== undefined && {
          selfReportedAt: data.selfReportedAt,
        }),
        ...(data.verifiedById !== undefined && { verifiedById: data.verifiedById }),
        ...(data.verifiedAt !== undefined && { verifiedAt: data.verifiedAt }),
        ...(data.verifyNotes !== undefined && { verifyNotes: data.verifyNotes }),
        ...(data.skipReason !== undefined && { skipReason: data.skipReason }),
      },
      include: TASK_INCLUDE,
    });
  }

  /**
   * Count non-terminal (PENDING / SELF_REPORTED) non-optional tasks for the
   * given onboarding. Zero = every required task settled (DONE or SKIPPED)
   * = time to set `Onboarding.contentCompletedAt`.
   */
  countIncompleteRequired(onboardingId: number) {
    return this.prisma.onboardingTask.count({
      where: {
        onboardingId,
        optional: false,
        status: { notIn: ["DONE", "SKIPPED"] },
      },
    });
  }

  /**
   * Idempotent completion set — only writes when `contentCompletedAt` is
   * still null. Returns the updated row, or null if it was already set (a
   * race between two verify calls landing simultaneously).
   */
  async setContentCompletedIfNull(onboardingId: number) {
    // updateMany with the null guard is idempotent — no throw on race.
    const result = await this.prisma.onboarding.updateMany({
      where: { id: onboardingId, contentCompletedAt: null },
      data: { contentCompletedAt: new Date() },
    });
    if (result.count === 0) return null;
    return this.prisma.onboarding.findUnique({
      where: { id: onboardingId },
      select: {
        id: true,
        userId: true,
        contentCompletedAt: true,
        hiringDispatch: {
          select: {
            id: true,
            departmentId: true,
            department: { select: { id: true, headId: true } },
          },
        },
      },
    });
  }
}
