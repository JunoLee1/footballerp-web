import { BudgetOverrideService } from "../../src/budget-plan/override.service";
import type { PrismaClient } from "../../src/generated/client";

const makePrisma = (opts: {
  planStatus?: string;
  categoryScope?: "TEAM" | "DEPARTMENT";
  headCoach?: { userId: string; teamId: number };
  headOfDept?: { headId: string; departmentId: number };
  logStatus?: string;
  logAmount?: number;
  totalOperatingBudget?: number;
  contingencyReserve?: number;
  existingAllocations?: number[];
}) => {
  const logs: any[] = [];
  const planUpdates: any[] = [];
  const logUpdates: any[] = [];
  return {
    financialReport: {
      findUnique: jest.fn().mockResolvedValue(
        opts.planStatus || opts.logStatus
          ? {
              id: 100,
              planStatus: opts.planStatus ?? "FINALIZED",
              totalOperatingBudget: opts.totalOperatingBudget ?? 10_000_000,
              contingencyReserve: opts.contingencyReserve ?? 100_000,
            }
          : null,
      ),
    } as any,
    budgetOverrideLog: {
      findUnique: jest.fn().mockResolvedValue(
        opts.logStatus
          ? {
              id: 500,
              status: opts.logStatus,
              financialReportId: 100,
              categoryId: 1,
              amount: opts.logAmount ?? 100_000,
            }
          : null,
      ),
      create: jest.fn().mockImplementation((args: any) => {
        const log = { id: 500, ...args.data };
        logs.push(log);
        return Promise.resolve(log);
      }),
      update: jest.fn().mockImplementation((args: any) => {
        logUpdates.push(args);
        return Promise.resolve({ id: args.where.id, ...args.data });
      }),
    } as any,
    expenseCategory: {
      findUnique: jest.fn().mockResolvedValue({ scope: opts.categoryScope ?? "TEAM" }),
    } as any,
    budgetCategoryPlan: {
      findFirst: jest.fn().mockResolvedValue({ id: 201, knapsackAllocated: 200_000 }),
      findMany: jest.fn().mockResolvedValue(
        (opts.existingAllocations ?? [200_000, 300_000]).map((a, i) => ({ id: 200 + i, knapsackAllocated: a })),
      ),
      update: jest.fn().mockImplementation((args: any) => {
        planUpdates.push(args);
        return Promise.resolve({ id: args.where.id, ...args.data });
      }),
    } as any,
    coach: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (
          opts.headCoach &&
          where.userId === opts.headCoach.userId &&
          where.coachingRole === "HEAD_COACH"
        ) return Promise.resolve({ teamId: opts.headCoach.teamId });
        return Promise.resolve(null);
      }),
    } as any,
    department: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (opts.headOfDept && where.headId === opts.headOfDept.headId) {
          return Promise.resolve({ id: opts.headOfDept.departmentId });
        }
        return Promise.resolve(null);
      }),
    } as any,
    $transaction: jest.fn().mockImplementation(async (ops: any[]) => {
      await Promise.all(ops);
    }),
    __logs: logs,
    __logUpdates: logUpdates,
    __planUpdates: planUpdates,
  };
};

describe("BudgetOverrideService.requestOverride (#407)", () => {
  test("팀장 신청 (성공)", async () => {
    const prisma = makePrisma({
      planStatus: "FINALIZED",
      categoryScope: "TEAM",
      headCoach: { userId: "00000000-0000-4000-8000-000000000500", teamId: 7 },
    });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    const result = await service.requestOverride(1, "00000000-0000-4000-8000-000000000500", {
      categoryId: 1,
      amount: 150_000,
      reason: "긴급 원정 지원비",
    });
    expect(result.id).toBe(500);
    expect(prisma.__logs[0].status).toBe("PENDING");
    expect(prisma.__logs[0].createdById).toBe("00000000-0000-4000-8000-000000000500");
  });

  test("planStatus !== FINALIZED → 409", async () => {
    const prisma = makePrisma({ planStatus: "KNAPSACK_EXECUTED" });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(
      service.requestOverride(1, "00000000-0000-4000-8000-000000000500", { categoryId: 1, amount: 100, reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_PLAN_STATUS_TRANSITION" });
  });

  test("팀장이 DEPARTMENT 카테고리 신청 → 403 스코프 mismatch", async () => {
    const prisma = makePrisma({
      planStatus: "FINALIZED",
      categoryScope: "DEPARTMENT",
      headCoach: { userId: "00000000-0000-4000-8000-000000000500", teamId: 7 },
    });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(
      service.requestOverride(1, "00000000-0000-4000-8000-000000000500", { categoryId: 1, amount: 100, reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 403, code: "CATEGORY_SCOPE_MISMATCH" });
  });

  test("amount <= 0 → 400", async () => {
    const prisma = makePrisma({
      planStatus: "FINALIZED",
      categoryScope: "TEAM",
      headCoach: { userId: "00000000-0000-4000-8000-000000000500", teamId: 7 },
    });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(
      service.requestOverride(1, "00000000-0000-4000-8000-000000000500", { categoryId: 1, amount: 0, reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 400, code: "AMOUNT_MUST_BE_POSITIVE" });
  });
});

describe("BudgetOverrideService.reviewOverride (#407)", () => {
  test("APPROVED → knapsackAllocated 조정", async () => {
    const prisma = makePrisma({
      logStatus: "PENDING",
      logAmount: 300_000,
      totalOperatingBudget: 10_000_000,
      existingAllocations: [200_000, 300_000], // plan 200: 200k, plan 201: 300k
    });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);

    await service.reviewOverride(500, "00000000-0000-4000-8000-000000000999", "APPROVED", "OK");

    const logUpdate = prisma.__logUpdates.at(-1);
    expect(logUpdate.data.status).toBe("APPROVED");
    // plan.id=201 이 findFirst 결과 → knapsackAllocated = 300_000 (log.amount)
    const planUpdate = prisma.__planUpdates.at(-1);
    expect(planUpdate.data.knapsackAllocated).toBe(300_000);
  });

  test("REJECTED → knapsackAllocated 변경 없음", async () => {
    const prisma = makePrisma({ logStatus: "PENDING", logAmount: 100_000 });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);

    await service.reviewOverride(500, "00000000-0000-4000-8000-000000000999", "REJECTED", "예산 초과");

    expect(prisma.__logUpdates.at(-1).data.status).toBe("REJECTED");
    expect(prisma.__planUpdates).toHaveLength(0);
  });

  test("logStatus !== PENDING → 409", async () => {
    const prisma = makePrisma({ logStatus: "APPROVED" });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(service.reviewOverride(500, "00000000-0000-4000-8000-000000000999", "APPROVED")).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_OVERRIDE_STATUS_TRANSITION",
    });
  });

  test("APPROVED 시 capacity 초과 → 409 OVERRIDE_EXCEEDS_TOTAL_BUDGET", async () => {
    const prisma = makePrisma({
      logStatus: "PENDING",
      logAmount: 9_500_000, // 다른 plan 300_000 + 이거 9_500_000 + reserve 100_000 = 9_900_000 > 9_000_000
      totalOperatingBudget: 9_000_000,
      contingencyReserve: 100_000,
      existingAllocations: [200_000, 300_000],
    });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(service.reviewOverride(500, "00000000-0000-4000-8000-000000000999", "APPROVED")).rejects.toMatchObject({
      statusCode: 409,
      code: "OVERRIDE_EXCEEDS_TOTAL_BUDGET",
    });
  });
});

// #444: BudgetOverrideLog 목록 조회 (id DESC, status filter, limit/cursor)
describe("BudgetOverrideService.list (#444)", () => {
  // list() 전용 mock — findMany 응답을 커스터마이즈.
  const makeListPrisma = (opts: {
    reportId?: number | null;
    rows?: any[];
  }) => {
    const findManyCalls: any[] = [];
    const findMany = jest.fn().mockImplementation((args: any) => {
      findManyCalls.push(args);
      return Promise.resolve(opts.rows ?? []);
    });
    return {
      financialReport: {
        findUnique: jest.fn().mockResolvedValue(
          opts.reportId === null ? null : { id: opts.reportId ?? 100 },
        ),
      } as any,
      budgetOverrideLog: { findMany } as any,
      __findManyCalls: findManyCalls,
    };
  };

  test("FinancialReport 없음 → 빈 배열 (404 대신 idempotent)", async () => {
    const prisma = makeListPrisma({ reportId: null });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    const rows = await service.list(1, {});
    expect(rows).toEqual([]);
    expect(prisma.__findManyCalls).toHaveLength(0);
  });

  test("status=PENDING filter → where.status='PENDING'", async () => {
    const prisma = makeListPrisma({
      reportId: 100,
      rows: [{ id: 3, status: "PENDING", amount: 500 }],
    });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    const rows = await service.list(1, { status: "PENDING" });
    expect(rows).toHaveLength(1);
    const call = prisma.__findManyCalls[0];
    expect(call.where).toMatchObject({ financialReportId: 100, status: "PENDING" });
    expect(call.orderBy).toEqual({ id: "desc" });
    expect(call.take).toBe(50); // default
  });

  test("status 미지정 → where.status 없음 (전체 상태)", async () => {
    const prisma = makeListPrisma({ reportId: 100, rows: [] });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await service.list(1, {});
    const call = prisma.__findManyCalls[0];
    expect(call.where.status).toBeUndefined();
  });

  test("limit 지정 → take 반영", async () => {
    const prisma = makeListPrisma({ reportId: 100, rows: [] });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await service.list(1, { limit: 25 });
    expect(prisma.__findManyCalls[0].take).toBe(25);
  });

  test("limit=200 (경계) → OK", async () => {
    const prisma = makeListPrisma({ reportId: 100, rows: [] });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await service.list(1, { limit: 200 });
    expect(prisma.__findManyCalls[0].take).toBe(200);
  });

  test("limit>200 → 400 LIMIT_EXCEEDS_MAX", async () => {
    const prisma = makeListPrisma({ reportId: 100 });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(service.list(1, { limit: 201 })).rejects.toMatchObject({
      statusCode: 400,
      code: "LIMIT_EXCEEDS_MAX",
    });
  });

  test("limit<=0 → 400 INVALID_LIMIT", async () => {
    const prisma = makeListPrisma({ reportId: 100 });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(service.list(1, { limit: 0 })).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_LIMIT",
    });
  });

  test("cursor 지정 → where.id={ lt: cursor }", async () => {
    const prisma = makeListPrisma({ reportId: 100, rows: [] });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await service.list(1, { cursor: 42 });
    expect(prisma.__findManyCalls[0].where).toMatchObject({
      financialReportId: 100,
      id: { lt: 42 },
    });
  });

  test("cursor<=0 → 400 INVALID_CURSOR", async () => {
    const prisma = makeListPrisma({ reportId: 100 });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(service.list(1, { cursor: 0 })).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_CURSOR",
    });
  });

  test("include: expenseCategory + createdBy + reviewedBy", async () => {
    const prisma = makeListPrisma({ reportId: 100, rows: [] });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await service.list(1, {});
    const call = prisma.__findManyCalls[0];
    expect(call.include).toMatchObject({
      expenseCategory: { select: { id: true, code: true, label: true } },
      createdBy: {
        select: { id: true, email: true, username: true, frontOfficeRole: true },
      },
      reviewedBy: {
        select: { id: true, email: true, username: true, frontOfficeRole: true },
      },
    });
  });

  test("invalid status 문자열 → 400 INVALID_STATUS", async () => {
    const prisma = makeListPrisma({ reportId: 100 });
    const service = new BudgetOverrideService(prisma as any as PrismaClient);
    await expect(
      service.list(1, { status: "BOGUS" as any }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_STATUS",
    });
  });
});
