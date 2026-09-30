import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";

// #449 B3: mandatoryMinimum 위반 감지 (Basic 티어 cost < mandatoryMinimum).
//
// review() 가 APPROVED 되어 categoryPlan.mandatoryMinimum 이 새 값으로 반영된
// 뒤 tx 밖에서 호출한다. 순수 조회 + 계산만 담당 (알림 발송은 notify.ts 몫).
//
// 사용 규칙:
//   1) categoryPlan 이 존재하지 않으면 예외 (호출자 로직 오류 시그널)
//   2) Basic 티어(name === "Basic") 가 없으면 basicCost=null + violated=false
//      (아직 티어 편성 전 카테고리 → 위반 계산 대상 아님)
//   3) Basic 티어가 있으면 basicCost < mandatoryMinimum 인 경우 violated=true

export interface ViolationDetection {
  violated: boolean;
  basicCost: number | null; // Basic 티어 없으면 null
  newMinimum: number;
  violationDelta: number; // newMinimum - basicCost (양수만 위반; basicCost=null 이면 0)
}

// tx 콜백 안에서도 재사용할 수 있도록 tx client 시그니처 허용.
export type ViolationPrisma = Pick<PrismaClient, "budgetCategoryPlan">;

export async function detectMinimumViolation(
  prisma: ViolationPrisma,
  categoryPlanId: string,
): Promise<ViolationDetection> {
  const plan = await prisma.budgetCategoryPlan.findUnique({
    where: { id: categoryPlanId },
    select: {
      id: true,
      mandatoryMinimum: true,
      tiers: {
        select: { id: true, name: true, cost: true },
      },
    },
  });
  if (!plan) throw new AppError(404, "CATEGORY_PLAN_NOT_FOUND");

  const basic = plan.tiers.find((t) => t.name === "Basic") ?? null;
  const newMinimum = plan.mandatoryMinimum;

  if (!basic) {
    return { violated: false, basicCost: null, newMinimum, violationDelta: 0 };
  }

  const violated = basic.cost < newMinimum;
  const violationDelta = violated ? newMinimum - basic.cost : 0;
  return { violated, basicCost: basic.cost, newMinimum, violationDelta };
}
