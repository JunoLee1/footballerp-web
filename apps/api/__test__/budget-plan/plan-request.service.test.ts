import { BudgetPlanRequestService } from "../../src/budget-plan/plan-request.service";
import { AppError } from "../../src/lib/appError";
import type { PrismaClient } from "../../src/generated/client";

type Prisma = Pick<
  PrismaClient,
  "financialReport" | "budgetPlanRequest" | "budgetPlanRequestLine" | "expenseCategory" | "coach" | "department"
>;

const REVIEW_DAYS = 14;

const makePrisma = (opts: {
  reportPlanStatus?: string | null;
  reportId?: number;
  headCoach?: { userId: string; teamId: number };
  headOfDept?: { headId: string; departmentId: number };
  categories?: { id: number; scope: "TEAM" | "DEPARTMENT" }[];
}) => {
  const reportUpdates: any[] = [];
  const requestCreates: any[] = [];
  return {
    financialReport: {
      findUnique: jest.fn().mockResolvedValue(
        opts.reportPlanStatus
          ? { id: opts.reportId ?? 100, planStatus: opts.reportPlanStatus }
          : null,
      ),
      update: jest.fn().mockImplementation((args: any) => {
        reportUpdates.push(args);
        return Promise.resolve({ id: args.where.id, ...args.data });
      }),
    } as any,
    budgetPlanRequest: {
      create: jest.fn().mockImplementation((args: any) => {
        requestCreates.push(args);
        return Promise.resolve({ id: 500, ...args.data });
      }),
      findMany: jest.fn().mockResolvedValue([]),
    } as any,
    budgetPlanRequestLine: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    } as any,
    expenseCategory: {
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        const ids = where.id.in;
        const cats = opts.categories ?? [];
        return Promise.resolve(cats.filter((c) => ids.includes(c.id)));
      }),
    } as any,
    coach: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (
          opts.headCoach &&
          where.userId === opts.headCoach.userId &&
          where.coachingRole === "HEAD_COACH"
        ) {
          return Promise.resolve({ teamId: opts.headCoach.teamId });
        }
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
    __reportUpdates: reportUpdates,
    __requestCreates: requestCreates,
  };
};

describe("BudgetPlanRequestService.openReview", () => {
  test("DRAFT → AWAITING_REVIEW 전이, reviewOpenedAt/Deadline 14일 세팅", async () => {
    const prisma = makePrisma({ reportPlanStatus: "DRAFT", reportId: 100 });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    const before = Date.now();
    await service.openReview(1, "00000000-0000-4000-8000-000000000999");
    const after = Date.now();

    const update = prisma.__reportUpdates[0];
    expect(update.where.id).toBe(100);
    expect(update.data.planStatus).toBe("AWAITING_REVIEW");
    expect(update.data.reviewOpenedAt).toBeInstanceOf(Date);
    const opened = update.data.reviewOpenedAt.getTime();
    const deadline = update.data.reviewDeadline.getTime();
    expect(opened).toBeGreaterThanOrEqual(before);
    expect(opened).toBeLessThanOrEqual(after);
    expect(deadline - opened).toBe(REVIEW_DAYS * 24 * 60 * 60 * 1000);
    expect(update.data.planStatusChangedById).toBe("00000000-0000-4000-8000-000000000999");
  });

  test("planStatus !== DRAFT → 409 INVALID_PLAN_STATUS_TRANSITION", async () => {
    const prisma = makePrisma({ reportPlanStatus: "FINALIZED", reportId: 100 });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await expect(service.openReview(1, "00000000-0000-4000-8000-000000000999")).rejects.toMatchObject({
      statusCode: 409,
      code: "INVALID_PLAN_STATUS_TRANSITION",
    });
    expect(prisma.__reportUpdates).toHaveLength(0);
  });

  test("FinancialReport 없음 → 404 FINANCIAL_REPORT_NOT_FOUND", async () => {
    const prisma = makePrisma({ reportPlanStatus: null });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await expect(service.openReview(1, "00000000-0000-4000-8000-000000000999")).rejects.toMatchObject({
      statusCode: 404,
      code: "FINANCIAL_REPORT_NOT_FOUND",
    });
  });
});

describe("BudgetPlanRequestService.submit", () => {
  test("팀장 신청 → BudgetPlanRequest + Line 생성 (scope=TEAM 자동)", async () => {
    const prisma = makePrisma({
      reportPlanStatus: "AWAITING_REVIEW",
      reportId: 100,
      headCoach: { userId: "00000000-0000-4000-8000-000000000500", teamId: 7 },
      categories: [
        { id: 1, scope: "TEAM" },
        { id: 2, scope: "TEAM" },
      ],
    });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await service.submit(1, "00000000-0000-4000-8000-000000000500", [
      { categoryId: 1, triggers: ["HOME_MATCH"], standardDelta: 100_000, premiumDelta: 200_000 },
      { categoryId: 2, triggers: ["WEEKEND_OVERTIME"], standardDelta: 50_000, premiumDelta: 0 },
    ]);

    const create = prisma.__requestCreates[0];
    expect(create.data.financialReportId).toBe(100);
    expect(create.data.requestedById).toBe("00000000-0000-4000-8000-000000000500");
    expect(create.data.scope).toBe("TEAM");
    expect(create.data.ownerType).toBe("TEAM");
    expect(create.data.ownerId).toBe(7);
    expect(create.data.status).toBe("SUBMITTED");
    expect(create.data.submittedAt).toBeInstanceOf(Date);
    expect(prisma.budgetPlanRequestLine.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            requestId: 500,
            categoryId: 1,
            triggers: ["HOME_MATCH"],
            standardDelta: 100_000,
            premiumDelta: 200_000,
          }),
        ]),
      }),
    );
  });

  test("부서장 신청 → scope=DEPARTMENT 자동", async () => {
    const prisma = makePrisma({
      reportPlanStatus: "AWAITING_REVIEW",
      reportId: 100,
      headOfDept: { headId: "00000000-0000-4000-8000-000000000600", departmentId: 3 },
      categories: [{ id: 10, scope: "DEPARTMENT" }],
    });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await service.submit(1, "00000000-0000-4000-8000-000000000600", [
      { categoryId: 10, triggers: ["MULTI_LOCATION"], standardDelta: 500_000, premiumDelta: 0 },
    ]);

    const create = prisma.__requestCreates[0];
    expect(create.data.scope).toBe("DEPARTMENT");
    expect(create.data.ownerId).toBe(3);
  });

  test("팀장이 DEPARTMENT 카테고리 신청 → 403 CATEGORY_SCOPE_MISMATCH", async () => {
    const prisma = makePrisma({
      reportPlanStatus: "AWAITING_REVIEW",
      reportId: 100,
      headCoach: { userId: "00000000-0000-4000-8000-000000000500", teamId: 7 },
      categories: [{ id: 1, scope: "DEPARTMENT" }],
    });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await expect(
      service.submit(1, "00000000-0000-4000-8000-000000000500", [
        { categoryId: 1, triggers: ["HOME_MATCH"], standardDelta: 100, premiumDelta: 0 },
      ]),
    ).rejects.toMatchObject({ statusCode: 403, code: "CATEGORY_SCOPE_MISMATCH" });
    expect(prisma.__requestCreates).toHaveLength(0);
  });

  test("팀장·부서장 아님 → 403 NOT_BUDGET_PLAN_REQUESTER", async () => {
    const prisma = makePrisma({
      reportPlanStatus: "AWAITING_REVIEW",
      reportId: 100,
      categories: [{ id: 1, scope: "TEAM" }],
    });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await expect(
      service.submit(1, "00000000-0000-4000-8000-000000000999", [{ categoryId: 1, triggers: [], standardDelta: 0, premiumDelta: 0 }]),
    ).rejects.toMatchObject({ statusCode: 403, code: "NOT_BUDGET_PLAN_REQUESTER" });
  });

  test("planStatus !== AWAITING_REVIEW → 409 INVALID_PLAN_STATUS_TRANSITION", async () => {
    const prisma = makePrisma({
      reportPlanStatus: "DRAFT",
      reportId: 100,
      headCoach: { userId: "00000000-0000-4000-8000-000000000500", teamId: 7 },
      categories: [{ id: 1, scope: "TEAM" }],
    });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await expect(
      service.submit(1, "00000000-0000-4000-8000-000000000500", [
        { categoryId: 1, triggers: ["HOME_MATCH"], standardDelta: 100, premiumDelta: 0 },
      ]),
    ).rejects.toMatchObject({ statusCode: 409, code: "INVALID_PLAN_STATUS_TRANSITION" });
  });

  test("존재하지 않는 categoryId → 400 UNKNOWN_CATEGORY", async () => {
    const prisma = makePrisma({
      reportPlanStatus: "AWAITING_REVIEW",
      reportId: 100,
      headCoach: { userId: "00000000-0000-4000-8000-000000000500", teamId: 7 },
      categories: [{ id: 1, scope: "TEAM" }],
    });
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    await expect(
      service.submit(1, "00000000-0000-4000-8000-000000000500", [
        { categoryId: 999, triggers: [], standardDelta: 0, premiumDelta: 0 },
      ]),
    ).rejects.toMatchObject({ statusCode: 400, code: "UNKNOWN_CATEGORY" });
  });
});

describe("BudgetPlanRequestService.list", () => {
  test("financialReportId 로 request + lines 조회", async () => {
    const prisma = makePrisma({ reportPlanStatus: "AWAITING_REVIEW", reportId: 100 });
    prisma.budgetPlanRequest.findMany = jest.fn().mockResolvedValue([
      { id: 500, status: "SUBMITTED", scope: "TEAM", ownerId: 7 },
    ]);
    const service = new BudgetPlanRequestService(prisma as PrismaClient);

    const result = await service.list(1);

    expect(prisma.budgetPlanRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { financialReport: { seasonId: 1 } },
        include: expect.objectContaining({ lines: true }),
      }),
    );
    expect(result).toHaveLength(1);
  });
});
