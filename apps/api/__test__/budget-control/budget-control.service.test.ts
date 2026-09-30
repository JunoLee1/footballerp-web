import { BudgetControlService } from "../../src/budget-control/budget-control.service";
import { AppError } from "../../src/lib/appError";
import type { BudgetControlRepository } from "../../src/budget-control/budget-control.repo";

jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));

const makeHeader = (overrides = {}) => ({
  id: 1, seasonId: 1, version: 1, status: "DRAFT", name: "2026시즌", totalBudget: 100_000_000,
  note: null, createdById: "00000000-0000-4000-8000-000000000001", approvedById: null, approvedAt: null, createdAt: new Date(), updatedAt: new Date(),
  lines: [], adjustments: [], season: { id: 1, name: "2026" }, createdBy: { id: 1, username: "admin" }, approvedBy: null,
  ...overrides,
});

const makeRepo = (overrides: Partial<BudgetControlRepository> = {}): BudgetControlRepository => ({
  createHeader: jest.fn().mockResolvedValue(makeHeader()),
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  updateStatus: jest.fn().mockResolvedValue(makeHeader()),
  updateHeader: jest.fn().mockResolvedValue(makeHeader()),
  createLine: jest.fn().mockResolvedValue({}),
  updateLine: jest.fn().mockResolvedValue({}),
  deleteLine: jest.fn().mockResolvedValue({}),
  createAdjustment: jest.fn().mockResolvedValue({}),
  updateAdjustmentStatus: jest.fn().mockResolvedValue({}),
  sumApprovedAdjustments: jest.fn().mockResolvedValue([]),
  sumCommitmentAndActual: jest.fn().mockResolvedValue({ commitment: 0, actual: 0, byCategory: {} }),
  ...overrides,
} as unknown as BudgetControlRepository);

const makeService = (repo: BudgetControlRepository) => new BudgetControlService(repo);

describe("BudgetControlService.getAvailableBudget", () => {
  it("returns totalBudget when no adjustments", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader()) });
    const result = await makeService(repo).getAvailableBudget(1);
    expect(result.available).toBe(100_000_000);
  });

  it("adds approved INCREASE adjustments", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeHeader()),
      sumApprovedAdjustments: jest.fn().mockResolvedValue([
        { type: "INCREASE", _sum: { amount: 10_000_000 } },
      ]),
    });
    const result = await makeService(repo).getAvailableBudget(1);
    expect(result.available).toBe(110_000_000);
  });

  it("subtracts approved DECREASE adjustments", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeHeader()),
      sumApprovedAdjustments: jest.fn().mockResolvedValue([
        { type: "DECREASE", _sum: { amount: 5_000_000 } },
      ]),
    });
    const result = await makeService(repo).getAvailableBudget(1);
    expect(result.available).toBe(95_000_000);
  });

  it("throws 404 when header not found", async () => {
    await expect(makeService(makeRepo()).getAvailableBudget(99))
      .rejects.toThrow(new AppError(404, "BUDGET_NOT_FOUND"));
  });
});

describe("BudgetControlService.submit", () => {
  it("throws 400 when already APPROVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader({ status: "APPROVED" })) });
    await expect(makeService(repo).submit(1, 1)).rejects.toThrow(new AppError(400, "BUDGET_ALREADY_APPROVED"));
  });

  it("throws 400 when totalBudget is 0", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader({ totalBudget: 0 })) });
    await expect(makeService(repo).submit(1, 1)).rejects.toThrow(new AppError(400, "BUDGET_AMOUNT_REQUIRED"));
  });

  it("calls updateStatus with SUBMITTED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader()) });
    await makeService(repo).submit(1, 1);
    expect(repo.updateStatus).toHaveBeenCalledWith(1, "SUBMITTED");
  });
});

describe("BudgetControlService.approve", () => {
  it("throws 400 when not SUBMITTED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader({ status: "DRAFT" })) });
    await expect(makeService(repo).approve(1, 2)).rejects.toThrow(new AppError(400, "BUDGET_NOT_SUBMITTED"));
  });

  it("calls updateStatus with APPROVED and approverId", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader({ status: "SUBMITTED" })) });
    await makeService(repo).approve(1, 2);
    expect(repo.updateStatus).toHaveBeenCalledWith(1, "APPROVED", 2);
  });
});

describe("BudgetControlService.requestAdjustment", () => {
  it("throws 400 when status is DRAFT", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader({ status: "DRAFT" })) });
    await expect(makeService(repo).requestAdjustment(1, { type: "INCREASE", amount: 1_000_000, reason: "test" }, 1))
      .rejects.toThrow(new AppError(400, "BUDGET_NOT_APPROVED"));
  });

  it("throws 400 when status is SUBMITTED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader({ status: "SUBMITTED" })) });
    await expect(makeService(repo).requestAdjustment(1, { type: "INCREASE", amount: 1_000_000, reason: "test" }, 1))
      .rejects.toThrow(new AppError(400, "BUDGET_NOT_APPROVED"));
  });

  it("throws 400 when amount is zero", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeHeader({ status: "APPROVED" })) });
    await expect(makeService(repo).requestAdjustment(1, { type: "INCREASE", amount: 0, reason: "test" }, 1))
      .rejects.toThrow(new AppError(400, "INVALID_ADJUSTMENT_AMOUNT"));
  });
});
