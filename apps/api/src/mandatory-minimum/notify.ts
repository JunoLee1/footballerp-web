import type { PrismaClient } from "../generated/client";
import type { NotificationRepository } from "../notification/notification.repo";
import type { ViolationDetection } from "./violation";

// #449 B3: 위반 감지 결과에 따른 GM 알림 (ADR 0021 채널).
//
// 발송 조건:
//   - detection.violated === true
//   - FinancialReport.planStatus === "FINALIZED"
//     (편성 중이면 다음 knapsack 사이클에서 자연 정합 → 알림 생략)
// GM 조회: NotificationRepository.createForGM (role="GM" fallback).
// fire-and-forget: 알림 실패는 console.error 만 하고 throw 하지 않는다.

export interface NotifyMinimumViolationDeps {
  prisma: Pick<PrismaClient, "budgetCategoryPlan" | "financialReport">;
  notificationRepo: Pick<NotificationRepository, "createForGM">;
}

export async function notifyMinimumViolation(
  seasonId: number,
  categoryPlanId: string,
  detection: ViolationDetection,
  deps: NotifyMinimumViolationDeps,
): Promise<void> {
  if (!detection.violated) return;

  try {
    const report = await deps.prisma.financialReport.findUnique({
      where: { seasonId },
      select: { id: true, planStatus: true },
    });
    // planStatus 가 FINALIZED 가 아닐 때는 편성 사이클이 다시 돌면서 자연 정합됨.
    // (spec: DRAFT / AWAITING_REVIEW / KNAPSACK_EXECUTED / AWAITING_GM_APPROVAL /
    //  CAPACITY_FAILED / RE_PLANNING 은 알림 대상 아님)
    if (!report || report.planStatus !== "FINALIZED") return;

    const plan = await deps.prisma.budgetCategoryPlan.findUnique({
      where: { id: categoryPlanId },
      select: {
        expenseCategory: { select: { label: true, code: true } },
      },
    });
    const categoryLabel = plan?.expenseCategory?.label
      ?? plan?.expenseCategory?.code
      ?? `카테고리 #${categoryPlanId}`;

    const previousBasic = detection.basicCost;
    const newMinimum = detection.newMinimum;
    const delta = detection.violationDelta;

    const prevBasicText = previousBasic === null ? "미편성" : previousBasic.toLocaleString();
    const title = `필수 최소예산 위반 — 재편성 필요 (${categoryLabel})`;
    const body =
      `${categoryLabel} 카테고리의 새로운 필수 최소예산 (${newMinimum.toLocaleString()}) 이` +
      ` Basic 티어 (${prevBasicText}) 를 초과합니다. 초과분 ${delta.toLocaleString()}.` +
      ` 편성 재검토가 필요합니다.`;

    // entityId 는 Notification schema 상 Int? — financialReportId 를 채워
    // 클라이언트가 해당 시즌 편성 화면으로 딥링크할 수 있게 한다.
    await deps.notificationRepo.createForGM(
      "MANDATORY_MINIMUM_VIOLATION_REQUIRES_REPLAN",
      () => ({ title, body }),
      report.id,
    );
  } catch (err) {
    console.error("[mm] notifyMinimumViolation failed", err);
  }
}
