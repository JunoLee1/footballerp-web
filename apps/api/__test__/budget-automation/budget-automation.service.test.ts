jest.mock("../../src/lib/season-actuals", () => ({
  getSeasonRevenueActuals: jest.fn(),
}));

import { getSeasonRevenueActuals } from "../../src/lib/season-actuals";
import { BudgetAutomationService } from "../../src/budget-automation/budget-automation.service";
import { AppError } from "../../src/lib/appError";
import { BudgetAutomationRepository } from "../../src/budget-automation/budget-automation.repo";
import type { ExpenseCategoryService } from "../../src/expense-category/expense-category.service";

const mockedGetSeasonRevenueActuals = getSeasonRevenueActuals as jest.MockedFunction<typeof getSeasonRevenueActuals>;

const SEASON_2024 = { id: 10, name: "2023/24", startDate: new Date("2023-07-01") };
const SEASON_2025 = { id: 11, name: "2024/25", startDate: new Date("2024-07-01") };
const SEASON_2026 = { id: 12, name: "2025/26", startDate: new Date("2025-07-01") };
const TARGET_SEASON = { id: 13, name: "2026/27", startDate: new Date("2026-07-01") };

// Fixed test category ids matching the seed data — 1..9 in sortOrder.
const CAT_IDS: Record<string, number> = {
  MEDICAL: 1, MEAL: 2, TRAVEL: 3, SPORTS_EQUIPMENT: 4, SCOUTING: 5,
  YOUTH: 6, IT_SECURITY: 7, FACILITY_EQUIPMENT: 8, STAFF_RECRUITMENT: 9,
};
const ACTIVE_CATEGORIES = Object.entries(CAT_IDS).map(([code, id], idx) => ({
  id, code, label: code, sortOrder: idx, isActive: true,
}));

const makeCategoryService = (): ExpenseCategoryService => ({
  listActive: jest.fn().mockResolvedValue(ACTIVE_CATEGORIES),
  listAll: jest.fn().mockResolvedValue(ACTIVE_CATEGORIES),
  resolveCategoryId: jest.fn(async (code: string) => CAT_IDS[code]!),
  resolveCategoryCode: jest.fn(async (id: number) => Object.keys(CAT_IDS).find((k) => CAT_IDS[k] === id)!),
  isValidCode: jest.fn(async (code: string) => code in CAT_IDS),
  invalidateCache: jest.fn(),
} as unknown as ExpenseCategoryService);

const makeActuals = (overrides: Partial<Record<string, number>> = {}): Record<string, number> => ({
  plannedRevenueTicket: 100_000_000,
  plannedRevenueSponsorship: 50_000_000,
  plannedRevenueBroadcast: 0,     // manual-only, no system-of-record
  plannedRevenueMerchandise: 10_000_000,
  plannedRevenueSubsidy: 0,       // manual-only
  plannedRevenueParentCompany: 0, // manual-only
  plannedRevenueAcademyFee: 0,
  plannedRevenueOther: 0,
  ...overrides,
});

const makeExpenseRow = (seasonId: number, categoryCode: string, amount: number) => ({
  seasonId,
  categoryId: CAT_IDS[categoryCode]!,
  _sum: { amount },
});

const makeRepo = (overrides: Partial<BudgetAutomationRepository> = {}): BudgetAutomationRepository => ({
  getTargetSeason: jest.fn().mockResolvedValue(TARGET_SEASON),
  getPastSeasons: jest.fn().mockResolvedValue([SEASON_2026, SEASON_2025, SEASON_2024]),
  getExpenseActualsByCategory: jest.fn().mockResolvedValue([
    makeExpenseRow(SEASON_2024.id, "TRAVEL", 20_000_000),
    makeExpenseRow(SEASON_2025.id, "TRAVEL", 22_000_000),
    makeExpenseRow(SEASON_2026.id, "TRAVEL", 24_000_000),
    makeExpenseRow(SEASON_2024.id, "SCOUTING", 10_000_000),
    makeExpenseRow(SEASON_2025.id, "SCOUTING", 11_000_000),
    makeExpenseRow(SEASON_2026.id, "SCOUTING", 12_000_000),
  ]),
  getLatestApprovedBudgetLines: jest.fn().mockResolvedValue([
    { categoryId: CAT_IDS["TRAVEL"], originalAmount: 30_000_000 },
    { categoryId: CAT_IDS["SCOUTING"], originalAmount: 25_000_000 },
  ]),
  createHeaderWithLines: jest.fn().mockResolvedValue({ id: 99, lines: [] }),
  ...overrides,
} as unknown as BudgetAutomationRepository);

const makeService = (repo = makeRepo(), catService = makeCategoryService()) =>
  new BudgetAutomationService(repo, catService);

const baseRequest = {
  targetSeasonId: 13,
  revenueGoal: "MAINTAIN" as const,
  expenseGoal: "MAINTAIN" as const,
};

beforeEach(() => {
  mockedGetSeasonRevenueActuals.mockReset();
  // Default: three seasons of revenue actuals (called once per seasonId in chrono order)
  mockedGetSeasonRevenueActuals
    .mockResolvedValueOnce(makeActuals() as any)   // SEASON_2024
    .mockResolvedValueOnce(makeActuals() as any)   // SEASON_2025
    .mockResolvedValueOnce(makeActuals() as any);  // SEASON_2026
});

describe("BudgetAutomationService.preview", () => {
  it("throws 404 when target season not found", async () => {
    const repo = makeRepo({ getTargetSeason: jest.fn().mockResolvedValue(null) });
    await expect(makeService(repo).preview(baseRequest))
      .rejects.toThrow(new AppError(404, "SEASON_NOT_FOUND"));
  });

  it("throws 400 when no historical seasons exist", async () => {
    const repo = makeRepo({ getPastSeasons: jest.fn().mockResolvedValue([]) });
    await expect(makeService(repo).preview(baseRequest))
      .rejects.toThrow(new AppError(400, "NO_HISTORICAL_DATA"));
  });

  it("returns predictions with MAINTAIN goal (×1.0) applied", async () => {
    const result = await makeService().preview(baseRequest);
    expect(result.expense.byCategory["TRAVEL"].predicted).toBeGreaterThan(24_000_000);
    expect(result.expense.byCategory["TRAVEL"].dataPoints).toBe(3);
  });

  it("applies AGGRESSIVE goal (×1.2) to expense", async () => {
    const r1 = await makeService().preview({ ...baseRequest, expenseGoal: "MAINTAIN" });
    // Re-prime helper mock for the second preview call
    mockedGetSeasonRevenueActuals
      .mockResolvedValueOnce(makeActuals() as any)
      .mockResolvedValueOnce(makeActuals() as any)
      .mockResolvedValueOnce(makeActuals() as any);
    const r2 = await makeService().preview({ ...baseRequest, expenseGoal: "AGGRESSIVE" });
    expect(r2.expense.byCategory["TRAVEL"].predicted)
      .toBeCloseTo(r1.expense.byCategory["TRAVEL"].predicted * 1.2, -4);
  });

  it("applies categoryOverrides over expenseGoal", async () => {
    const r1 = await makeService().preview({ ...baseRequest, expenseGoal: "MAINTAIN" });
    mockedGetSeasonRevenueActuals
      .mockResolvedValueOnce(makeActuals() as any)
      .mockResolvedValueOnce(makeActuals() as any)
      .mockResolvedValueOnce(makeActuals() as any);
    const r2 = await makeService().preview({
      ...baseRequest,
      expenseGoal: "MAINTAIN",
      categoryOverrides: { TRAVEL: "CONSERVATIVE" },
    });
    expect(r2.expense.byCategory["TRAVEL"].predicted)
      .toBeCloseTo(r1.expense.byCategory["TRAVEL"].predicted * (0.8 / 1.0), -4);
  });

  it("sets INSUFFICIENT_DATA warning when only 1 season available", async () => {
    mockedGetSeasonRevenueActuals.mockReset();
    mockedGetSeasonRevenueActuals.mockResolvedValueOnce(makeActuals() as any);
    const repo = makeRepo({
      getPastSeasons: jest.fn().mockResolvedValue([SEASON_2026]),
      getExpenseActualsByCategory: jest.fn().mockResolvedValue([
        makeExpenseRow(SEASON_2026.id, "TRAVEL", 24_000_000),
      ]),
    });
    const result = await makeService(repo).preview(baseRequest);
    expect(result.expense.byCategory["TRAVEL"].warning).toBe("INSUFFICIENT_DATA");
  });

  it("sets LOW_UTILIZATION warning when actual < 50% of budget", async () => {
    const repo = makeRepo({
      getLatestApprovedBudgetLines: jest.fn().mockResolvedValue([
        { categoryId: CAT_IDS["TRAVEL"], originalAmount: 100_000_000 }, // budget 100M, actual 24M < 50%
      ]),
    });
    const result = await makeService(repo).preview(baseRequest);
    expect(result.expense.byCategory["TRAVEL"].warning).toBe("LOW_UTILIZATION");
  });

  it("uses inflation parameter to increase predictions", async () => {
    const r0 = await makeService().preview({ ...baseRequest, inflation: 0 });
    mockedGetSeasonRevenueActuals
      .mockResolvedValueOnce(makeActuals() as any)
      .mockResolvedValueOnce(makeActuals() as any)
      .mockResolvedValueOnce(makeActuals() as any);
    const r1 = await makeService().preview({ ...baseRequest, inflation: 0.1 });
    expect(r1.expense.byCategory["TRAVEL"].predicted)
      .toBeGreaterThan(r0.expense.byCategory["TRAVEL"].predicted);
  });

  it("includes parameters echo in response", async () => {
    const result = await makeService().preview(baseRequest);
    expect(result.parameters.targetSeasonId).toBe(13);
    expect(result.parameters.lookback).toBe(3);
    expect(result.parameters.inflation).toBe(0.03);
    expect(result.parameters.seasonsUsed).toBe(3);
  });

  it("returns INSUFFICIENT_DATA for manual-only revenue categories (BROADCAST, SUBSIDY, PARENT_COMPANY)", async () => {
    // Default beforeEach primes three seasons where those three keys = 0
    const result = await makeService().preview(baseRequest);

    expect(result.revenue.byCategory["plannedRevenueBroadcast"].warning).toBe("INSUFFICIENT_DATA");
    expect(result.revenue.byCategory["plannedRevenueSubsidy"].warning).toBe("INSUFFICIENT_DATA");
    expect(result.revenue.byCategory["plannedRevenueParentCompany"].warning).toBe("INSUFFICIENT_DATA");

    // Non-manual categories with actuals > 0 should NOT have INSUFFICIENT_DATA
    expect(result.revenue.byCategory["plannedRevenueTicket"].warning).not.toBe("INSUFFICIENT_DATA");
    expect(result.revenue.byCategory["plannedRevenueSponsorship"].warning).not.toBe("INSUFFICIENT_DATA");
  });
});

describe("BudgetAutomationService.apply", () => {
  it("calls createHeaderWithLines with correct totalBudget", async () => {
    const repo = makeRepo();
    await makeService(repo).apply(
      { ...baseRequest, name: "2026/27 예산안" },
      "00000000-0000-4000-8000-000000000005"
    );
    const [headerData] = (repo.createHeaderWithLines as jest.Mock).mock.calls[0];
    expect(headerData.name).toBe("2026/27 예산안");
    expect(headerData.createdById).toBe("00000000-0000-4000-8000-000000000005");
    expect(headerData.totalBudget).toBeGreaterThan(0);
  });
});
