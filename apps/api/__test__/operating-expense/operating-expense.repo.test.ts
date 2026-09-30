import { describe, test, jest, expect } from "@jest/globals";
import { OperatingExpenseRepository } from "../../src/operating-expense/operating-expense.repo";

/**
 * ADR 0023 · issue #474 — `createWithBudgetCheck` 재작성 검증.
 *
 * Focus:
 *  - Ceiling 은 seasonId+categoryId 로 조회한 "최신 APPROVED BudgetHeader" 의
 *    line originalAmount.
 *  - Used 는 seasonId+categoryId 전체 지출 (모든 version 합산).
 *  - Caller 의 budgetLineId 는 저장은 그대로 유지, 검증에는 사용하지 않음
 *    (호환/감사) — 단 categoryId 불일치는 CATEGORY_MISMATCH.
 */

interface BudgetLineRow {
  id: number;
  categoryId: number;
  originalAmount: number;
  budgetHeaderId: number;
}

const CAT_TRAVEL = 3;

const makeExpense = (over: Partial<any> = {}) => ({
  id: 999, seasonId: 1, categoryId: CAT_TRAVEL, amount: 100_000,
  date: new Date(), note: null, createdById: "00000000-0000-4000-8000-000000000010", status: "PENDING",
  budgetLineId: 1, createdAt: new Date(), updatedAt: new Date(),
  createdBy: { id: 10, username: "staff" },
  budgetLine: { id: 1, originalAmount: 500_000, expenseCategory: { code: "TRAVEL" } },
  expenseCategory: { code: "TRAVEL" },
  ...over,
});

/**
 * `activeLine`  → mock 반환값: budgetHeader.status=APPROVED 최신 version 의 category line.
 * `legacyLine`  → caller 가 넘긴 budgetLineId 의 실제 row (호환 검증용).
 * `usedSum`    → 카테고리+seasonId 전체 지출 합산 (모든 version 포함).
 */
const makePrisma = (opts: {
  activeLine: BudgetLineRow | null;
  legacyLine?: BudgetLineRow | null;
  usedSum?: number;
}) => {
  const created: any[] = [];
  const findFirstMock = jest.fn().mockResolvedValue(opts.activeLine as any);
  const findUniqueMock = jest.fn().mockResolvedValue((opts.legacyLine ?? null) as any);
  const aggregateMock = jest.fn().mockResolvedValue({ _sum: { amount: opts.usedSum ?? 0 } } as any);
  const createMock = jest.fn().mockImplementation((args: any) => {
    created.push(args);
    return Promise.resolve(makeExpense({
      seasonId: args.data.seasonId,
      categoryId: args.data.categoryId,
      amount: args.data.amount,
      budgetLineId: args.data.budgetLineId,
    })) as any;
  });
  const shared: any = {
    budgetLine: { findFirst: findFirstMock, findUnique: findUniqueMock },
    operatingExpense: { aggregate: aggregateMock, create: createMock },
    __created: created,
  };
  shared.$transaction = jest.fn().mockImplementation((fn: any) => fn(shared));
  return shared;
};

describe("OperatingExpenseRepository.createWithBudgetCheck (#474)", () => {
  const baseInput = {
    seasonId: 1,
    categoryId: CAT_TRAVEL,
    amount: 100_000,
    date: new Date(),
    note: null,
    createdById: "00000000-0000-4000-8000-000000000010",
    budgetLineId: 1,
  };

  test("최신 APPROVED header 없음 → BUDGET_LINE_NOT_FOUND", async () => {
    const prisma = makePrisma({ activeLine: null });
    const repo = new OperatingExpenseRepository(prisma as any);
    await expect(repo.createWithBudgetCheck(baseInput)).rejects.toThrow("BUDGET_LINE_NOT_FOUND");
  });

  test("v1 만 있는 시나리오 (기존 동작 유지)", async () => {
    const prisma = makePrisma({
      activeLine: { id: 1, categoryId: CAT_TRAVEL, originalAmount: 500_000, budgetHeaderId: 1 },
      legacyLine: { id: 1, categoryId: CAT_TRAVEL, originalAmount: 500_000, budgetHeaderId: 1 },
      usedSum: 100_000,
    });
    const repo = new OperatingExpenseRepository(prisma as any);
    const result = await repo.createWithBudgetCheck({ ...baseInput, amount: 200_000 });
    expect(result.amount).toBe(200_000);
    expect(prisma.__created).toHaveLength(1);
    expect(prisma.__created[0].data.budgetLineId).toBe(1);
  });

  test("v1+v2 재편성 시나리오: v1 에서 300M, v2 originalAmount 500M, 250M 신규 시도 → BUDGET_EXCEEDED", async () => {
    // v2 가 최신 APPROVED (v1 은 LOCKED). aggregate 는 seasonId+categoryId 로
    // v1 지출 300M 을 반드시 포함해야 한다.
    const prisma = makePrisma({
      activeLine: { id: 20, categoryId: CAT_TRAVEL, originalAmount: 500_000_000, budgetHeaderId: 2 },
      legacyLine: { id: 1, categoryId: CAT_TRAVEL, originalAmount: 300_000_000, budgetHeaderId: 1 }, // caller 가 v1 id 를 아직 알고 있음
      usedSum: 300_000_000, // v1 에서 이미 지출
    });
    const repo = new OperatingExpenseRepository(prisma as any);
    await expect(
      repo.createWithBudgetCheck({ ...baseInput, amount: 250_000_000 }),
    ).rejects.toThrow("BUDGET_EXCEEDED");
    // aggregate 가 budgetLineId 없이 seasonId+categoryId 로 호출됐는지 검증
    const aggregateCall = (prisma.operatingExpense.aggregate as jest.Mock).mock.calls[0][0] as any;
    expect(aggregateCall.where.seasonId).toBe(1);
    expect(aggregateCall.where.categoryId).toBe(CAT_TRAVEL);
    expect(aggregateCall.where.budgetLineId).toBeUndefined();
  });

  test("v1+v2 재편성 후 여유 있는 신규 지출은 허용", async () => {
    const prisma = makePrisma({
      activeLine: { id: 20, categoryId: CAT_TRAVEL, originalAmount: 500_000_000, budgetHeaderId: 2 },
      legacyLine: { id: 1, categoryId: CAT_TRAVEL, originalAmount: 300_000_000, budgetHeaderId: 1 },
      usedSum: 300_000_000,
    });
    const repo = new OperatingExpenseRepository(prisma as any);
    const result = await repo.createWithBudgetCheck({ ...baseInput, amount: 150_000_000 });
    expect(result.amount).toBe(150_000_000);
    // Caller-provided budgetLineId 유지 (호환)
    expect(prisma.__created[0].data.budgetLineId).toBe(1);
  });

  test("caller 가 넘긴 budgetLineId 의 categoryId 불일치 → CATEGORY_MISMATCH", async () => {
    const prisma = makePrisma({
      activeLine: { id: 20, categoryId: CAT_TRAVEL, originalAmount: 500_000, budgetHeaderId: 2 },
      // legacyLine 의 categoryId 가 다른 카테고리 (2) → mismatch
      legacyLine: { id: 5, categoryId: 2, originalAmount: 200_000, budgetHeaderId: 1 },
      usedSum: 0,
    });
    const repo = new OperatingExpenseRepository(prisma as any);
    await expect(repo.createWithBudgetCheck(baseInput)).rejects.toThrow("CATEGORY_MISMATCH");
  });

  test("caller 가 넘긴 budgetLineId 가 사라진 경우 (deleted 등) → 저장 진행 (activeLine 만 검증)", async () => {
    const prisma = makePrisma({
      activeLine: { id: 20, categoryId: CAT_TRAVEL, originalAmount: 500_000, budgetHeaderId: 2 },
      legacyLine: null,
      usedSum: 0,
    });
    const repo = new OperatingExpenseRepository(prisma as any);
    const result = await repo.createWithBudgetCheck({ ...baseInput, amount: 100_000 });
    expect(result.amount).toBe(100_000);
    expect(prisma.__created[0].data.budgetLineId).toBe(1); // caller 값 그대로 저장
  });

  test("최신 APPROVED header 는 orderBy version:desc 로 조회 (재편성 이후 v2 우선)", async () => {
    const prisma = makePrisma({
      activeLine: { id: 20, categoryId: CAT_TRAVEL, originalAmount: 500_000, budgetHeaderId: 2 },
      legacyLine: { id: 1, categoryId: CAT_TRAVEL, originalAmount: 300_000, budgetHeaderId: 1 },
      usedSum: 0,
    });
    const repo = new OperatingExpenseRepository(prisma as any);
    await repo.createWithBudgetCheck(baseInput);
    const findFirstCall = (prisma.budgetLine.findFirst as jest.Mock).mock.calls[0][0] as any;
    expect(findFirstCall.where.budgetHeader).toMatchObject({ seasonId: 1, status: "APPROVED" });
    expect(findFirstCall.orderBy).toEqual([{ budgetHeader: { version: "desc" } }]);
  });
});

describe("OperatingExpenseRepository.findBudgetLinesForSeasonCategory (#474)", () => {
  const CAT_ID = CAT_TRAVEL;

  test("APPROVED header 없음 → 빈 배열", async () => {
    const prisma = {
      budgetHeader: {
        findFirst: jest.fn().mockResolvedValue(null as any),
      },
      budgetLine: { findMany: jest.fn() },
    };
    const repo = new OperatingExpenseRepository(prisma as any);
    const lines = await repo.findBudgetLinesForSeasonCategory(1, CAT_ID);
    expect(lines).toEqual([]);
    expect(prisma.budgetLine.findMany).not.toHaveBeenCalled();
  });

  test("최신 APPROVED header 하나만 조회하여 그 line 만 반환", async () => {
    const prisma = {
      budgetHeader: {
        findFirst: jest.fn().mockResolvedValue({ id: 42 } as any),
      },
      budgetLine: {
        findMany: jest.fn().mockResolvedValue([
          { id: 100, departmentId: null, originalAmount: 500_000 },
        ] as any),
      },
    };
    const repo = new OperatingExpenseRepository(prisma as any);
    const lines = await repo.findBudgetLinesForSeasonCategory(1, CAT_ID);
    expect(lines).toEqual([{ id: 100, departmentId: null, originalAmount: 500_000 }]);

    const headerCall = (prisma.budgetHeader.findFirst as jest.Mock).mock.calls[0][0] as any;
    expect(headerCall.where).toEqual({ seasonId: 1, status: "APPROVED" });
    expect(headerCall.orderBy).toEqual({ version: "desc" });

    const lineCall = (prisma.budgetLine.findMany as jest.Mock).mock.calls[0][0] as any;
    expect(lineCall.where).toEqual({ categoryId: CAT_ID, budgetHeaderId: 42 });
  });
});
