import { BudgetPlanRequestService } from "../../src/budget-plan/plan-request.service";
import type { PrismaClient } from "../../src/generated/client";
import { KnapsackService } from "../../src/budget/knapsack.service";

const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
const dayFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);

const makePrisma = (opts: {
  planStatus?: string;
  reviewDeadline?: Date | null;
  totalOperatingBudget?: number | null;
  contingencyReserve?: number | null;
  requests?: any[];
  categoryPlans?: any[];
  basicTiers?: any[];
}) => {
  const tierCreates: any[] = [];
  const tierDeletes: any[] = [];
  const reportUpdates: any[] = [];
  const planUpdates: any[] = [];
  const requestUpdates: any[] = [];

  return {
    financialReport: {
      findUnique: jest.fn().mockResolvedValue({
        id: 100,
        planStatus: opts.planStatus ?? "AWAITING_REVIEW",
        reviewDeadline: opts.reviewDeadline ?? dayAgo,
        totalOperatingBudget: opts.totalOperatingBudget ?? 1_000_000,
        contingencyReserve: opts.contingencyReserve ?? 100_000,
      }),
      update: jest.fn().mockImplementation((args: any) => {
        reportUpdates.push(args);
        return Promise.resolve({ id: args.where.id, ...args.data });
      }),
    } as any,
    budgetPlanRequest: {
      findMany: jest.fn().mockResolvedValue(opts.requests ?? []),
      updateMany: jest.fn().mockImplementation((args: any) => {
        requestUpdates.push(args);
        return Promise.resolve({ count: (opts.requests ?? []).length });
      }),
    } as any,
    budgetCategoryPlan: {
      findMany: jest.fn().mockResolvedValue(opts.categoryPlans ?? []),
      update: jest.fn().mockImplementation((args: any) => {
        planUpdates.push(args);
        return Promise.resolve({ id: args.where.id, ...args.data });
      }),
    } as any,
    budgetTier: {
      findMany: jest.fn().mockResolvedValue(opts.basicTiers ?? []),
      deleteMany: jest.fn().mockImplementation((args: any) => {
        tierDeletes.push(args);
        return Promise.resolve({ count: 0 });
      }),
      createMany: jest.fn().mockImplementation((args: any) => {
        tierCreates.push(args);
        return Promise.resolve({ count: args.data.length });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    } as any,
    team: {
      count: jest.fn().mockResolvedValue(1),
    } as any,
    department: {
      count: jest.fn().mockResolvedValue(1),
    } as any,
    __tierCreates: tierCreates,
    __tierDeletes: tierDeletes,
    __reportUpdates: reportUpdates,
    __planUpdates: planUpdates,
    __requestUpdates: requestUpdates,
  };
};

const CAT_PLANS = [
  { id: 201, categoryId: 1, mandatoryMinimum: 0 },
  { id: 202, categoryId: 2, mandatoryMinimum: 0 },
];
const BASIC_TIERS = [
  { id: 301, categoryPlanId: 201, name: "Basic", cost: 200_000, value: 0 },
  { id: 302, categoryPlanId: 202, name: "Basic", cost: 100_000, value: 0 },
];

describe("BudgetPlanRequestService.executeKnapsack (#403)", () => {
  test("성공: 신청 존재 + reviewDeadline 지남 → planStatus=KNAPSACK_EXECUTED", async () => {
    const prisma = makePrisma({
      totalOperatingBudget: 1_000_000,
      contingencyReserve: 100_000,
      categoryPlans: CAT_PLANS,
      basicTiers: BASIC_TIERS,
      requests: [
        {
          id: 500,
          scope: "TEAM",
          ownerType: "TEAM",
          ownerId: "00000000-0000-4000-8000-000000000007",
          lines: [
            { categoryId: 1, triggers: ["HOME_MATCH"], standardDelta: 50_000, premiumDelta: 100_000 },
            { categoryId: 2, triggers: [], standardDelta: 0, premiumDelta: 0 },
          ],
        },
      ],
    });
    const service = new BudgetPlanRequestService(prisma as PrismaClient, new KnapsackService());

    await service.executeKnapsack(1, 999);

    // planStatus 전이
    const reportUpdate = prisma.__reportUpdates.at(-1);
    expect(reportUpdate.data.planStatus).toBe("KNAPSACK_EXECUTED");
    expect(reportUpdate.data.knapsackExecutedAt).toBeInstanceOf(Date);
    // request PROCESSED 로 마킹
    expect(prisma.__requestUpdates[0].data.status).toBe("PROCESSED");
    // Standard/Premium 티어 생성됨 (categoryId=1 만, categoryId=2 는 트리거 없음)
    const createdTiers = prisma.__tierCreates.flatMap((c: any) => c.data);
    expect(createdTiers.filter((t: any) => t.name === "Standard")).toHaveLength(1);
    expect(createdTiers.filter((t: any) => t.name === "Premium")).toHaveLength(1);
  });

  test("실패: planStatus !== AWAITING_REVIEW → 409", async () => {
    const prisma = makePrisma({ planStatus: "DRAFT" });
    const service = new BudgetPlanRequestService(prisma as PrismaClient, new KnapsackService());

    await expect(service.executeKnapsack(1, 999)).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_PLAN_STATUS_TRANSITION",
    });
  });

  test("실패: reviewDeadline 전 + 미신청 팀·부서 있음 → 409 REVIEW_STILL_OPEN", async () => {
    const prisma = makePrisma({
      reviewDeadline: dayFuture,
      requests: [], // 아무도 신청 안 함
    });
    // team.count 는 2 를 반환 (2팀 있음, 0 신청)
    prisma.team.count = jest.fn().mockResolvedValue(2);
    prisma.department.count = jest.fn().mockResolvedValue(0);
    const service = new BudgetPlanRequestService(prisma as PrismaClient, new KnapsackService());

    await expect(service.executeKnapsack(1, 999)).rejects.toMatchObject({
      statusCode: 409,
      code: "REVIEW_STILL_OPEN",
    });
  });

  test("허용: reviewDeadline 전 + 모두 신청 완료 → 실행 성공", async () => {
    const prisma = makePrisma({
      reviewDeadline: dayFuture,
      totalOperatingBudget: 1_000_000,
      contingencyReserve: 100_000,
      categoryPlans: CAT_PLANS,
      basicTiers: BASIC_TIERS,
      requests: [
        {
          id: 500,
          scope: "TEAM",
          ownerType: "TEAM",
          ownerId: "00000000-0000-4000-8000-000000000007",
          lines: [
            { categoryId: 1, triggers: ["HOME_MATCH"], standardDelta: 50_000, premiumDelta: 0 },
          ],
        },
      ],
    });
    // 팀장 1 + 부서장 0 (요청자 있는 모든 owner 가 신청 완료)
    prisma.team.count = jest.fn().mockResolvedValue(1);
    prisma.department.count = jest.fn().mockResolvedValue(0);
    const service = new BudgetPlanRequestService(prisma as PrismaClient, new KnapsackService());

    await service.executeKnapsack(1, 999);

    expect(prisma.__reportUpdates.at(-1).data.planStatus).toBe("KNAPSACK_EXECUTED");
  });

  test("미신청 카테고리 → Basic 만 유지 (Standard/Premium 생성 안 함)", async () => {
    const prisma = makePrisma({
      totalOperatingBudget: 500_000,
      contingencyReserve: 100_000,
      categoryPlans: CAT_PLANS,
      basicTiers: BASIC_TIERS,
      requests: [
        {
          id: 500,
          scope: "TEAM",
          ownerType: "TEAM",
          ownerId: "00000000-0000-4000-8000-000000000007",
          lines: [
            { categoryId: 2, triggers: [], standardDelta: 0, premiumDelta: 0 },
          ],
        },
      ],
    });
    const service = new BudgetPlanRequestService(prisma as PrismaClient, new KnapsackService());

    await service.executeKnapsack(1, 999);

    const createdTiers = prisma.__tierCreates.flatMap((c: any) => c.data);
    expect(createdTiers.filter((t: any) => t.name === "Standard")).toHaveLength(0);
    expect(createdTiers.filter((t: any) => t.name === "Premium")).toHaveLength(0);
  });
});
