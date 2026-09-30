import {
  computeSeasonNetIncome,
  applyCarryOverToNextSeason,
} from "../../src/lib/season-carryover";

const makePrisma = (overrides: Record<string, unknown> = {}) =>
  ({
    monthlySettlementReport: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { totalRevenue: 0, totalExpense: 0 } }),
    },
    season: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ endDate: new Date("2025-12-31") }),
      findFirst: jest.fn().mockResolvedValue({ id: 2 }),
    },
    financialReport: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe("computeSeasonNetIncome", () => {
  it("returns 0 when no approved reports", async () => {
    expect(await computeSeasonNetIncome(makePrisma(), 1)).toBe(0);
  });

  it("returns revenue - expense", async () => {
    const p = makePrisma({
      monthlySettlementReport: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalRevenue: 100_000_000, totalExpense: 60_000_000 },
        }),
      },
    });
    expect(await computeSeasonNetIncome(p, 1)).toBe(40_000_000);
  });
});

describe("applyCarryOverToNextSeason", () => {
  it("skips when closed season not found", async () => {
    const p = makePrisma({
      season: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
      },
    });
    const r = await applyCarryOverToNextSeason(p, 1);
    expect(r.applied).toBe(false);
  });

  it("skips when there is no next season", async () => {
    const p = makePrisma({
      season: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ endDate: new Date("2025-12-31") }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    const r = await applyCarryOverToNextSeason(p, 1);
    expect(r.applied).toBe(false);
  });

  it("skips write when next season has a manual override", async () => {
    const p = makePrisma({
      financialReport: {
        findUnique: jest.fn().mockResolvedValue({ carryOverOverriddenById: "00000000-0000-4000-8000-000000000005" }),
        upsert: jest.fn(),
      },
    });
    const r = await applyCarryOverToNextSeason(p, 1);
    expect(r.applied).toBe(false);
    expect(r.nextSeasonId).toBe(2);
    expect(p.financialReport.upsert).not.toHaveBeenCalled();
  });

  it("upserts carryOverFromPrev on next season when no override exists", async () => {
    const p = makePrisma({
      monthlySettlementReport: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { totalRevenue: 100_000_000, totalExpense: 60_000_000 },
        }),
      },
    });
    const r = await applyCarryOverToNextSeason(p, 1);
    expect(r.applied).toBe(true);
    expect(r.amount).toBe(40_000_000);
    expect(r.nextSeasonId).toBe(2);
    expect(p.financialReport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { seasonId: 2 },
        create: expect.objectContaining({ carryOverFromPrev: 40_000_000 }),
      }),
    );
  });
});
