import { autoGenBudgetHeaderFromPlan } from "../../src/budget-plan/auto-header";
import type { Prisma } from "../../src/generated/client";

/**
 * ADR 0023 · issue #474
 *
 * Unit tests for the `autoGenBudgetHeaderFromPlan` helper. Uses a hand-rolled
 * `tx` mock (matches the shape of `Prisma.TransactionClient`) — no real DB.
 *
 * Scenarios exercised:
 *  1. First finalization (no prior header) → v1 created, one line per category.
 *  2. Re-finalization (v1 already APPROVED) → v1 LOCKED, v2 created.
 *  3. Zero-value category (mandatoryMinimum=0, knapsackAllocated=null)
 *     → line created with originalAmount=0.
 *  4. Season with zero categories → empty header, lineCount=0, warn logged.
 *  5. Missing FinancialReport → throws.
 */

interface HeaderRow {
  id: number;
  seasonId: number;
  version: number;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "LOCKED";
  name: string;
  totalBudget: number;
  createdById: number;
  approvedById: number | null;
  approvedAt: Date | null;
}

interface LineRow {
  budgetHeaderId: number;
  categoryId: number;
  originalAmount: number;
  year: number;
  departmentId: number | null;
}

interface CategoryPlanRow {
  categoryId: number;
  mandatoryMinimum: number;
  knapsackAllocated: number | null;
}

interface MockTxOpts {
  seasonId: number;
  startDate?: Date;
  existingHeaders?: HeaderRow[]; // pre-existing headers on the season
  categoryPlans?: CategoryPlanRow[];
  reportMissing?: boolean;
  seasonMissing?: boolean;
}

const makeTx = (opts: MockTxOpts) => {
  const headers: HeaderRow[] = [...(opts.existingHeaders ?? [])];
  const lines: LineRow[] = [];
  let nextHeaderId = 1000;

  const tx = {
    financialReport: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (opts.reportMissing) return Promise.resolve(null);
        if (where.seasonId !== opts.seasonId) return Promise.resolve(null);
        return Promise.resolve({
          id: 100,
          seasonId: opts.seasonId,
          budgetCategoryPlans: opts.categoryPlans ?? [],
        });
      }),
    },
    season: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (opts.seasonMissing) return Promise.resolve(null);
        if (where.id !== opts.seasonId) return Promise.resolve(null);
        return Promise.resolve({
          startDate: opts.startDate ?? new Date("2026-03-01T00:00:00Z"),
        });
      }),
    },
    budgetHeader: {
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        let count = 0;
        for (const h of headers) {
          if (h.seasonId === where.seasonId && h.status === where.status) {
            h.status = data.status;
            count += 1;
          }
        }
        return Promise.resolve({ count });
      }),
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const filtered = headers.filter((h) => h.seasonId === where.seasonId);
        if (filtered.length === 0) return Promise.resolve(null);
        // desc by version
        filtered.sort((a, b) => b.version - a.version);
        return Promise.resolve(filtered[0]);
      }),
      create: jest.fn().mockImplementation(({ data }: any) => {
        const row: HeaderRow = {
          id: nextHeaderId++,
          seasonId: data.seasonId,
          version: data.version,
          status: data.status,
          name: data.name,
          totalBudget: data.totalBudget,
          createdById: data.createdById,
          approvedById: data.approvedById ?? null,
          approvedAt: data.approvedAt ?? null,
        };
        headers.push(row);
        return Promise.resolve(row);
      }),
    },
    budgetLine: {
      createMany: jest.fn().mockImplementation(({ data }: any) => {
        for (const l of data) lines.push(l);
        return Promise.resolve({ count: data.length });
      }),
    },
    __headers: headers,
    __lines: lines,
  };
  return tx;
};

describe("autoGenBudgetHeaderFromPlan (#474)", () => {
  test("첫 확정 (기존 header 없음) → v1 APPROVED 생성 + 카테고리별 line", async () => {
    const tx = makeTx({
      seasonId: 1,
      startDate: new Date("2026-03-01T00:00:00Z"),
      categoryPlans: [
        { categoryId: 10, mandatoryMinimum: 100_000, knapsackAllocated: 200_000 },
        { categoryId: 11, mandatoryMinimum: 50_000, knapsackAllocated: 150_000 },
      ],
    });

    const result = await autoGenBudgetHeaderFromPlan(
      1,
      999,
      tx as unknown as Prisma.TransactionClient,
    );

    expect(result.lineCount).toBe(2);
    expect(tx.__headers).toHaveLength(1);
    const created = tx.__headers[0]!;
    expect(created.version).toBe(1);
    expect(created.status).toBe("APPROVED");
    expect(created.name).toBe("2026 시즌 편성 확정 v1");
    expect(created.totalBudget).toBe(300_000 + 200_000);
    expect(created.createdById).toBe(999);
    expect(created.approvedById).toBe(999);
    expect(created.approvedAt).toBeInstanceOf(Date);

    expect(tx.__lines).toHaveLength(2);
    const line1 = tx.__lines.find((l) => l.categoryId === 10)!;
    expect(line1.originalAmount).toBe(300_000);
    expect(line1.year).toBe(2026);
    expect(line1.departmentId).toBeNull();
    expect(line1.budgetHeaderId).toBe(created.id);
    const line2 = tx.__lines.find((l) => l.categoryId === 11)!;
    expect(line2.originalAmount).toBe(200_000);
  });

  test("재확정 (기존 v1 APPROVED 있음) → v1 LOCKED, v2 신규 APPROVED", async () => {
    const tx = makeTx({
      seasonId: 1,
      existingHeaders: [
        {
          id: 1,
          seasonId: 1,
          version: 1,
          status: "APPROVED",
          name: "2026 시즌 편성 확정 v1",
          totalBudget: 500_000,
          createdById: "00000000-0000-4000-8000-000000000999",
          approvedById: "00000000-0000-4000-8000-000000000999",
          approvedAt: new Date("2026-06-01T00:00:00Z"),
        },
      ],
      categoryPlans: [
        { categoryId: 10, mandatoryMinimum: 100_000, knapsackAllocated: 400_000 },
      ],
    });

    const result = await autoGenBudgetHeaderFromPlan(
      1,
      777,
      tx as unknown as Prisma.TransactionClient,
    );

    expect(result.lineCount).toBe(1);
    expect(tx.__headers).toHaveLength(2);
    const v1 = tx.__headers.find((h) => h.version === 1)!;
    expect(v1.status).toBe("LOCKED");
    const v2 = tx.__headers.find((h) => h.version === 2)!;
    expect(v2.status).toBe("APPROVED");
    expect(v2.name).toBe("2026 시즌 편성 확정 v2");
    expect(v2.totalBudget).toBe(500_000);
    expect(v2.createdById).toBe(777);
    expect(v2.approvedById).toBe(777);
  });

  test("mandatoryMinimum=0 + knapsackAllocated=null → originalAmount=0 line 생성", async () => {
    const tx = makeTx({
      seasonId: 1,
      categoryPlans: [
        { categoryId: 20, mandatoryMinimum: 0, knapsackAllocated: null },
        { categoryId: 21, mandatoryMinimum: 10_000, knapsackAllocated: null },
      ],
    });

    const result = await autoGenBudgetHeaderFromPlan(
      1,
      999,
      tx as unknown as Prisma.TransactionClient,
    );

    expect(result.lineCount).toBe(2);
    const zero = tx.__lines.find((l) => l.categoryId === 20)!;
    expect(zero.originalAmount).toBe(0);
    const nullKnap = tx.__lines.find((l) => l.categoryId === 21)!;
    expect(nullKnap.originalAmount).toBe(10_000);
    const header = tx.__headers[0]!;
    expect(header.totalBudget).toBe(10_000);
  });

  test("카테고리 0개 → 빈 header (lineCount=0), warn log 출력", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const tx = makeTx({
        seasonId: 1,
        categoryPlans: [],
      });

      const result = await autoGenBudgetHeaderFromPlan(
        1,
        999,
        tx as unknown as Prisma.TransactionClient,
      );

      expect(result.lineCount).toBe(0);
      expect(tx.__headers).toHaveLength(1);
      expect(tx.__headers[0]!.totalBudget).toBe(0);
      expect(tx.__lines).toHaveLength(0);
      expect(tx.budgetLine.createMany).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[autoGenBudgetHeaderFromPlan] season=1 has zero BudgetCategoryPlan rows"),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test("FinancialReport 없음 → FINANCIAL_REPORT_NOT_FOUND", async () => {
    const tx = makeTx({ seasonId: 1, reportMissing: true });
    await expect(
      autoGenBudgetHeaderFromPlan(1, 999, tx as unknown as Prisma.TransactionClient),
    ).rejects.toThrow("FINANCIAL_REPORT_NOT_FOUND");
  });

  test("Season 없음 → SEASON_NOT_FOUND", async () => {
    const tx = makeTx({ seasonId: 1, seasonMissing: true, categoryPlans: [] });
    await expect(
      autoGenBudgetHeaderFromPlan(1, 999, tx as unknown as Prisma.TransactionClient),
    ).rejects.toThrow("SEASON_NOT_FOUND");
  });

  test("여러 APPROVED header 공존 시 (경계) 모두 LOCKED 처리", async () => {
    const tx = makeTx({
      seasonId: 1,
      existingHeaders: [
        {
          id: 1, seasonId: 1, version: 1, status: "APPROVED",
          name: "auto v1", totalBudget: 100, createdById: "00000000-0000-4000-8000-000000000001",
          approvedById: "00000000-0000-4000-8000-000000000001", approvedAt: new Date(),
        },
        {
          id: 2, seasonId: 1, version: 2, status: "APPROVED",
          name: "manual v2", totalBudget: 200, createdById: "00000000-0000-4000-8000-000000000001",
          approvedById: "00000000-0000-4000-8000-000000000001", approvedAt: new Date(),
        },
      ],
      categoryPlans: [
        { categoryId: 10, mandatoryMinimum: 50, knapsackAllocated: 150 },
      ],
    });

    await autoGenBudgetHeaderFromPlan(1, 999, tx as unknown as Prisma.TransactionClient);

    const v1 = tx.__headers.find((h) => h.version === 1)!;
    const v2 = tx.__headers.find((h) => h.version === 2)!;
    const v3 = tx.__headers.find((h) => h.version === 3)!;
    expect(v1.status).toBe("LOCKED");
    expect(v2.status).toBe("LOCKED");
    expect(v3.status).toBe("APPROVED");
    expect(v3.totalBudget).toBe(200);
  });
});
