import { BudgetPlanRequestService } from "../../src/budget-plan/plan-request.service";
import type { PrismaClient } from "../../src/generated/client";

/**
 * ADR 0023 (#474): finalize / gmApprove 는 이제 $transaction 안에서
 * FinancialReport 전이 + BudgetHeader/Line auto-gen 을 함께 수행한다.
 * 아래 mock 은 tx 도 prisma 와 동일한 객체를 재사용해 update 호출을 관찰한다.
 */
const makePrisma = (opts: {
  planStatus?: string;
  fmSelfRequest?: boolean;
}) => {
  const reportUpdates: any[] = [];
  const headerCreates: any[] = [];
  const lineCreates: any[] = [];
  const headerLocks: any[] = [];

  const shared: any = {
    financialReport: {
      findUnique: jest.fn().mockImplementation(({ where, include }: any) => {
        // 두 곳에서 호출됨:
        //  (a) finalize/gmApprove 첫 조회: seasonId + { id, planStatus }
        //  (b) autoGenBudgetHeaderFromPlan: seasonId + include budgetCategoryPlans
        if (include?.budgetCategoryPlans) {
          return Promise.resolve({
            id: 100,
            seasonId: where.seasonId,
            budgetCategoryPlans: [
              { categoryId: 1, mandatoryMinimum: 100, knapsackAllocated: 200 },
            ],
          });
        }
        return Promise.resolve({
          id: 100,
          planStatus: opts.planStatus ?? "KNAPSACK_EXECUTED",
        });
      }),
      update: jest.fn().mockImplementation((args: any) => {
        reportUpdates.push(args);
        return Promise.resolve({ id: args.where.id, ...args.data });
      }),
    },
    budgetPlanRequest: {
      findFirst: jest.fn().mockResolvedValue(
        opts.fmSelfRequest ? { id: 500, requestedById: "00000000-0000-4000-8000-000000000999" } : null,
      ),
    },
    season: {
      findUnique: jest.fn().mockResolvedValue({
        startDate: new Date("2026-03-01T00:00:00Z"),
      }),
    },
    budgetHeader: {
      updateMany: jest.fn().mockImplementation((args: any) => {
        headerLocks.push(args);
        return Promise.resolve({ count: 0 });
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args: any) => {
        headerCreates.push(args);
        return Promise.resolve({ id: 900, ...args.data });
      }),
    },
    budgetLine: {
      createMany: jest.fn().mockImplementation((args: any) => {
        lineCreates.push(args);
        return Promise.resolve({ count: args.data.length });
      }),
    },
  };
  shared.$transaction = jest
    .fn()
    .mockImplementation((fn: (tx: any) => Promise<unknown>) => fn(shared));
  shared.__reportUpdates = reportUpdates;
  shared.__headerCreates = headerCreates;
  shared.__lineCreates = lineCreates;
  shared.__headerLocks = headerLocks;
  return shared;
};

describe("BudgetPlanRequestService.finalize (#406, extended #474)", () => {
  test("FM 자체 신청 없음 → FINALIZED 직접 전이 + BudgetHeader auto-gen", async () => {
    const prisma = makePrisma({ fmSelfRequest: false });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await service.finalize(1, 999);

    const update = prisma.__reportUpdates.at(-1);
    expect(update.data.planStatus).toBe("FINALIZED");
    expect(update.data.finalizedAt).toBeInstanceOf(Date);
    expect(update.data.planStatusChangedById).toBe(999);

    // #474: transaction 안에서 BudgetHeader/Line 자동 생성
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.__headerCreates).toHaveLength(1);
    expect(prisma.__headerCreates[0].data.status).toBe("APPROVED");
    expect(prisma.__headerCreates[0].data.version).toBe(1);
    expect(prisma.__headerCreates[0].data.approvedById).toBe(999);
    expect(prisma.__lineCreates).toHaveLength(1);
    expect(prisma.__lineCreates[0].data[0].originalAmount).toBe(300);
  });

  test("FM 자체 신청 있음 → AWAITING_GM_APPROVAL 로 escalate (BudgetHeader 미생성)", async () => {
    const prisma = makePrisma({ fmSelfRequest: true });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await service.finalize(1, 999);

    const update = prisma.__reportUpdates.at(-1);
    expect(update.data.planStatus).toBe("AWAITING_GM_APPROVAL");
    expect(update.data.finalizedAt).toBeUndefined();

    // Escalate 경로에서는 편성이 확정 안 됐으므로 BudgetHeader 미생성
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.__headerCreates).toHaveLength(0);
  });

  test("planStatus !== KNAPSACK_EXECUTED → 409", async () => {
    const prisma = makePrisma({ planStatus: "DRAFT" });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await expect(service.finalize(1, 999)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_PLAN_STATUS_TRANSITION",
    });
    expect(prisma.__headerCreates).toHaveLength(0);
  });
});

describe("BudgetPlanRequestService.gmApprove (#406, extended #474)", () => {
  test("AWAITING_GM_APPROVAL → FINALIZED + BudgetHeader auto-gen", async () => {
    const prisma = makePrisma({ planStatus: "AWAITING_GM_APPROVAL" });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await service.gmApprove(1, 777);

    const update = prisma.__reportUpdates.at(-1);
    expect(update.data.planStatus).toBe("FINALIZED");
    expect(update.data.finalizedAt).toBeInstanceOf(Date);
    expect(update.data.planStatusChangedById).toBe(777);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.__headerCreates).toHaveLength(1);
    expect(prisma.__headerCreates[0].data.approvedById).toBe(777);
    expect(prisma.__lineCreates).toHaveLength(1);
  });

  test("planStatus !== AWAITING_GM_APPROVAL → 409", async () => {
    const prisma = makePrisma({ planStatus: "KNAPSACK_EXECUTED" });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await expect(service.gmApprove(1, 777)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_PLAN_STATUS_TRANSITION",
    });
    expect(prisma.__headerCreates).toHaveLength(0);
  });
});
