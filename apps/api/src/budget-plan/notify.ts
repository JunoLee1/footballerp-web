import type { PrismaClient } from "../generated/client";
import type { NotificationRepository } from "../notification/notification.repo";

// ADR 0021: 편성 워크플로우 알림 채널 매핑
export type BudgetPlanEvent =
  | "DRAFT_READY"
  | "CAPACITY_FAILED"
  | "REVIEW_OPENED"
  | "REMINDER_D7"
  | "REMINDER_D3"
  | "REMINDER_D1"
  | "KNAPSACK_EXECUTED"
  | "FINALIZED";

interface Reviewer {
  userId: string;
  email: string | null;
  language: string | null;
  scope: "TEAM" | "DEPARTMENT";
  ownerId: number;
}

export interface EmailSender {
  sendCapacityFailedEmail(to: string, seasonId: number, reason: string): Promise<void>;
  sendReviewOpenedEmail(to: string, seasonId: number, deadline: Date): Promise<void>;
  sendReviewDeadlineD1Email(to: string, seasonId: number, deadline: Date): Promise<void>;
}

export interface NotifyContext {
  seasonId: number;
  reason?: string;
  deadline?: Date | undefined;
  reviewers?: Reviewer[];
}

export async function notifyBudgetPlanEvent(
  event: BudgetPlanEvent,
  ctx: NotifyContext,
  deps: {
    notificationRepo: Pick<
      NotificationRepository,
      "createForFinanceManager" | "createForGM" | "create"
    >;
    email: EmailSender;
  },
): Promise<void> {
  switch (event) {
    case "DRAFT_READY":
      await deps.notificationRepo.createForFinanceManager(
        "BUDGET_PLAN_DRAFT_READY",
        () => ({
          title: "다음 시즌 편성 Draft 준비 완료",
          body: `시즌 ${ctx.seasonId} Draft 가 자동 생성됐습니다. 검토 후 심사 창을 개방하세요.`,
        }),
        ctx.seasonId,
      );
      break;

    case "CAPACITY_FAILED":
      await deps.notificationRepo.createForGM(
        "BUDGET_PLAN_CAPACITY_FAILED",
        () => ({
          title: "편성 capacity 부족 (GM 개입 필요)",
          body: `시즌 ${ctx.seasonId}: ${ctx.reason ?? "capacity insufficient"}`,
        }),
        ctx.seasonId,
      );
      if (ctx.reviewers) {
        for (const r of ctx.reviewers) {
          if (r.email) {
            await deps.email.sendCapacityFailedEmail(r.email, ctx.seasonId, ctx.reason ?? "");
          }
        }
      }
      break;

    case "REVIEW_OPENED":
      if (!ctx.reviewers || !ctx.deadline) return;
      for (const reviewer of ctx.reviewers) {
        await deps.notificationRepo.create({
          userId: reviewer.userId,
          type: "BUDGET_PLAN_REVIEW_OPENED",
          title: "편성 심사 신청 창 개방",
          body: `시즌 ${ctx.seasonId} 편성 심사 신청 창이 개방됐습니다. 마감: ${ctx.deadline.toISOString().slice(0, 10)}`,
          entityId: ctx.seasonId,
        });
        if (reviewer.email) {
          await deps.email.sendReviewOpenedEmail(reviewer.email, ctx.seasonId, ctx.deadline);
        }
      }
      break;

    case "REMINDER_D7":
    case "REMINDER_D3":
      if (!ctx.reviewers) return;
      for (const reviewer of ctx.reviewers) {
        await deps.notificationRepo.create({
          userId: reviewer.userId,
          type: `BUDGET_PLAN_${event}`,
          title: `편성 심사 신청 마감 리마인더 (${event.replace("REMINDER_", "")})`,
          body: `시즌 ${ctx.seasonId} 편성 심사 신청 창이 곧 마감됩니다.`,
          entityId: ctx.seasonId,
        });
      }
      break;

    case "REMINDER_D1":
      if (!ctx.reviewers || !ctx.deadline) return;
      for (const reviewer of ctx.reviewers) {
        await deps.notificationRepo.create({
          userId: reviewer.userId,
          type: "BUDGET_PLAN_REMINDER_D1",
          title: "편성 심사 신청 마감 D-1",
          body: `시즌 ${ctx.seasonId} 편성 심사 신청 창이 내일 마감됩니다. 미신청 시 자동 Basic 확정.`,
          entityId: ctx.seasonId,
        });
        if (reviewer.email) {
          await deps.email.sendReviewDeadlineD1Email(reviewer.email, ctx.seasonId, ctx.deadline);
        }
      }
      break;

    case "KNAPSACK_EXECUTED":
    case "FINALIZED":
      if (!ctx.reviewers) return;
      for (const reviewer of ctx.reviewers) {
        await deps.notificationRepo.create({
          userId: reviewer.userId,
          type: `BUDGET_PLAN_${event}`,
          title: event === "FINALIZED" ? "편성 최종 확정" : "편성 Knapsack 실행 완료",
          body: `시즌 ${ctx.seasonId} 편성이 ${event === "FINALIZED" ? "확정" : "산정 완료"}됐습니다.`,
          entityId: ctx.seasonId,
        });
      }
      break;
  }
}

export async function resolveBudgetPlanReviewers(
  prisma: Pick<PrismaClient, "coach" | "department">,
): Promise<Reviewer[]> {
  const [teamLeaders, deptHeads] = await Promise.all([
    prisma.coach.findMany({
      where: { coachingRole: "HEAD_COACH", teamId: { not: null }, userId: { not: null } },
      select: { userId: true, teamId: true, user: { select: { email: true, language: true } } },
    }),
    prisma.department.findMany({
      where: { isActive: true, headId: { not: null } },
      select: { id: true, headId: true, head: { select: { email: true, language: true } } },
    }),
  ]);

  const reviewers: Reviewer[] = [];
  for (const t of teamLeaders) {
    if (t.userId != null && t.teamId != null) {
      reviewers.push({
        userId: t.userId,
        email: t.user?.email ?? null,
        language: t.user?.language ?? null,
        scope: "TEAM",
        ownerId: t.teamId,
      });
    }
  }
  for (const d of deptHeads) {
    if (d.headId != null) {
      reviewers.push({
        userId: d.headId,
        email: d.head?.email ?? null,
        language: d.head?.language ?? null,
        scope: "DEPARTMENT",
        ownerId: d.id,
      });
    }
  }
  return reviewers;
}
