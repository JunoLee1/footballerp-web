import { OperatingExpenseService, APPROVAL_THRESHOLD } from "../../src/operating-expense/operating-expense.service";
import { AppError } from "../../src/lib/appError";
import { OperatingExpenseRepository } from "../../src/operating-expense/operating-expense.repo";
import { NotificationRepository } from "../../src/notification/notification.repo";
import type { ExpenseCategoryService } from "../../src/expense-category/expense-category.service";

// Fixed test category ids matching the seed data.
const CAT_IDS: Record<string, number> = {
  MEDICAL: 1, MEAL: 2, TRAVEL: 3, SPORTS_EQUIPMENT: 4, SCOUTING: 5,
  YOUTH: 6, IT_SECURITY: 7, FACILITY_EQUIPMENT: 8, STAFF_RECRUITMENT: 9,
};

const makeLine = (overrides = {}) => ({
  id: 1, budgetHeaderId: 1, departmentId: null, categoryId: CAT_IDS["TRAVEL"]!,
  year: 2026, month: null, originalAmount: 5_000_000,
  note: null, createdAt: new Date(), updatedAt: new Date(),
  ...overrides,
});

const makeExpense = (overrides = {}) => ({
  id: 1, seasonId: 1, categoryId: CAT_IDS["TRAVEL"]!, amount: 300_000,
  date: new Date(), note: null, createdById: "00000000-0000-4000-8000-000000000010",
  status: "PENDING" as const, budgetLineId: 1,
  firstApprovedById: null, firstApprovedAt: null,
  approvedById: null, approvedAt: null,
  rejectedById: null, rejectedAt: null, rejectionReason: null,
  cancelledById: null, cancelledAt: null, cancellationReason: null,
  paidAt: null, paidById: null,
  deletedAt: null, deletionReason: null, accountCodeId: null,
  createdAt: new Date(), updatedAt: new Date(),
  createdBy: { id: 10, username: "staff" },
  budgetLine: { id: 1, originalAmount: 5_000_000, budgetHeaderId: 1, expenseCategory: { code: "TRAVEL" } },
  expenseCategory: { code: "TRAVEL" },
  ...overrides,
});

const makeRepo = (overrides: Partial<OperatingExpenseRepository> = {}): OperatingExpenseRepository => ({
  findBySeasonId: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  findBudgetLine: jest.fn().mockResolvedValue(makeLine()),
  createWithBudgetCheck: jest.fn().mockResolvedValue(makeExpense()),
  updateStatus: jest.fn().mockResolvedValue(makeExpense()),
  softDelete: jest.fn().mockResolvedValue({}),
  purgeExpired: jest.fn().mockResolvedValue({}),
  ...overrides,
} as unknown as OperatingExpenseRepository);

const makeNotifRepo = (): NotificationRepository => ({
  createForFinanceStaff: jest.fn().mockResolvedValue(undefined),
  createForFinanceManager: jest.fn().mockResolvedValue(undefined),
  createForUser: jest.fn().mockResolvedValue(undefined),
} as unknown as NotificationRepository);

const makeCategoryService = (): ExpenseCategoryService => ({
  listActive: jest.fn().mockResolvedValue([]),
  listAll: jest.fn().mockResolvedValue([]),
  resolveCategoryId: jest.fn(async (code: string) => CAT_IDS[code]!),
  resolveCategoryCode: jest.fn(async (id: number) => Object.keys(CAT_IDS).find((k) => CAT_IDS[k] === id)!),
  isValidCode: jest.fn(async (code: string) => code in CAT_IDS),
  invalidateCache: jest.fn(),
} as unknown as ExpenseCategoryService);

const makeService = (repo = makeRepo(), notif = makeNotifRepo(), cat = makeCategoryService()) =>
  new OperatingExpenseService(repo, notif, cat);

describe("OperatingExpenseService.create", () => {
  const baseInput = {
    seasonId: 1, category: "TRAVEL", amount: 300_000,
    date: "2026-08-22", createdById: "00000000-0000-4000-8000-000000000010", budgetLineId: 1,
  };

  it("throws 400 when amount <= 0", async () => {
    await expect(makeService().create({ ...baseInput, amount: 0 }))
      .rejects.toThrow(new AppError(400, "INVALID_AMOUNT"));
  });

  it("throws 404 when BudgetLine not found", async () => {
    const repo = makeRepo({ findBudgetLine: jest.fn().mockResolvedValue(null) });
    await expect(makeService(repo).create(baseInput))
      .rejects.toThrow(new AppError(404, "BUDGET_LINE_NOT_FOUND"));
  });

  it("throws 409 when repo raises BUDGET_EXCEEDED", async () => {
    const repo = makeRepo({
      createWithBudgetCheck: jest.fn().mockRejectedValue(new Error("BUDGET_EXCEEDED")),
    });
    await expect(makeService(repo).create(baseInput))
      .rejects.toThrow(new AppError(409, "BUDGET_EXCEEDED"));
  });

  it("returns expense and notifies FINANCE_STAFF on success", async () => {
    const notif = makeNotifRepo();
    const result = await makeService(makeRepo(), notif).create(baseInput);
    expect(result.status).toBe("PENDING");
    expect(notif.createForFinanceStaff).toHaveBeenCalledWith(
      "EXPENSE_PENDING", expect.any(Function), 1
    );
  });
});

describe("OperatingExpenseService.firstApprove", () => {
  it("throws 404 when expense not found", async () => {
    await expect(makeService().firstApprove(99, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(404, "NOT_FOUND"));
  });

  it("throws 400 when status is not PENDING", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ status: "APPROVED" })) });
    await expect(makeService(repo).firstApprove(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(400, "INVALID_STATUS"));
  });

  it("throws 400 when amount < threshold", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ amount: 500_000 })) });
    await expect(makeService(repo).firstApprove(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(400, "USE_SINGLE_STAGE_APPROVE"));
  });

  it("throws 403 on self-approval", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ amount: 2_000_000, createdById: "00000000-0000-4000-8000-000000000005" })) });
    await expect(makeService(repo).firstApprove(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(403, "SELF_APPROVAL_FORBIDDEN"));
  });

  it("transitions to FIRST_APPROVED and notifies FINANCE_MANAGER", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeExpense({ amount: 2_000_000, createdById: "00000000-0000-4000-8000-000000000010" })),
      updateStatus: jest.fn().mockResolvedValue(makeExpense({ status: "FIRST_APPROVED", amount: 2_000_000 })),
    });
    const result = await makeService(repo, notif).firstApprove(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_STAFF");
    expect(result.status).toBe("FIRST_APPROVED");
    expect(notif.createForFinanceManager).toHaveBeenCalledWith("EXPENSE_FIRST_APPROVED", expect.any(Function), 1);
  });
});

describe("OperatingExpenseService.approve", () => {
  it("throws 403 when approver lacks permission", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ amount: 500_000, status: "PENDING" })) });
    await expect(makeService(repo).approve(1, "00000000-0000-4000-8000-000000000005","PLAYER", null))
      .rejects.toThrow(new AppError(403, "FORBIDDEN"));
  });

  it("1-stage: PENDING → APPROVED for amount < threshold with FINANCE_STAFF", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeExpense({ amount: 500_000, createdById: "00000000-0000-4000-8000-000000000010", status: "PENDING" })),
      updateStatus: jest.fn().mockResolvedValue(makeExpense({ status: "APPROVED", amount: 500_000 })),
    });
    const result = await makeService(repo, notif).approve(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_STAFF");
    expect(result.status).toBe("APPROVED");
    expect(notif.createForUser).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000010","EXPENSE_APPROVED", expect.any(Function), 1);
  });

  it("2-stage: requires FIRST_APPROVED status for amount >= threshold", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ amount: 2_000_000, status: "PENDING" })) });
    await expect(makeService(repo).approve(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_MANAGER"))
      .rejects.toThrow(new AppError(400, "REQUIRES_FIRST_APPROVAL"));
  });

  it("2-stage: FIRST_APPROVED → APPROVED with FINANCE_MANAGER", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeExpense({ amount: 2_000_000, createdById: "00000000-0000-4000-8000-000000000010", status: "FIRST_APPROVED" })),
      updateStatus: jest.fn().mockResolvedValue(makeExpense({ status: "APPROVED", amount: 2_000_000 })),
    });
    const result = await makeService(repo, notif).approve(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_MANAGER");
    expect(result.status).toBe("APPROVED");
    expect(notif.createForUser).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000010","EXPENSE_APPROVED", expect.any(Function), 1);
  });

  it("2-stage: throws 403 when FINANCE_STAFF tries final approval", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ amount: 2_000_000, status: "FIRST_APPROVED" })) });
    await expect(makeService(repo).approve(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(403, "FORBIDDEN"));
  });

  it("throws 403 on self-approval", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ amount: 500_000, createdById: "00000000-0000-4000-8000-000000000005", status: "PENDING" })) });
    await expect(makeService(repo).approve(1, "00000000-0000-4000-8000-000000000005","FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(403, "SELF_APPROVAL_FORBIDDEN"));
  });
});

describe("OperatingExpenseService.reject", () => {
  it("throws 400 when status is not PENDING or FIRST_APPROVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ status: "APPROVED" })) });
    await expect(makeService(repo).reject(1, "00000000-0000-4000-8000-000000000005","거부 사유", "FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(400, "INVALID_STATUS"));
  });

  it("transitions to REJECTED and notifies creator", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeExpense({ status: "PENDING", createdById: "00000000-0000-4000-8000-000000000010" })),
      updateStatus: jest.fn().mockResolvedValue(makeExpense({ status: "REJECTED" })),
    });
    await makeService(repo, notif).reject(1, "00000000-0000-4000-8000-000000000005","예산 부족", "FRONT_OFFICE", "FINANCE_STAFF");
    expect(notif.createForUser).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000010","EXPENSE_REJECTED", expect.any(Function), 1);
  });
});

describe("OperatingExpenseService.cancel", () => {
  it("throws 400 when status is not APPROVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ status: "PENDING" })) });
    await expect(makeService(repo).cancel(1, "00000000-0000-4000-8000-000000000010","취소 사유", "FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(400, "INVALID_STATUS"));
  });

  it("throws 403 when not creator and not FINANCE_MANAGER", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ status: "APPROVED", createdById: "00000000-0000-4000-8000-000000000010" })) });
    await expect(makeService(repo).cancel(1, "00000000-0000-4000-8000-000000000099","취소", "FRONT_OFFICE", "FINANCE_STAFF"))
      .rejects.toThrow(new AppError(403, "FORBIDDEN"));
  });

  it("creator can cancel own APPROVED expense", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeExpense({ status: "APPROVED", createdById: "00000000-0000-4000-8000-000000000010" })),
      updateStatus: jest.fn().mockResolvedValue(makeExpense({ status: "CANCELLED" })),
    });
    await makeService(repo, notif).cancel(1, "00000000-0000-4000-8000-000000000010","취소 사유", "FRONT_OFFICE", "FINANCE_STAFF");
    expect(notif.createForUser).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000010","EXPENSE_CANCELLED", expect.any(Function), 1);
  });
});

describe("OperatingExpenseService.markPaid", () => {
  it("throws 400 when status is not APPROVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeExpense({ status: "PENDING" })) });
    await expect(makeService(repo).markPaid(1, "00000000-0000-4000-8000-000000000005"))
      .rejects.toThrow(new AppError(400, "INVALID_STATUS"));
  });

  it("transitions to PAID and notifies creator", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeExpense({ status: "APPROVED", createdById: "00000000-0000-4000-8000-000000000010" })),
      updateStatus: jest.fn().mockResolvedValue(makeExpense({ status: "PAID" })),
    });
    await makeService(repo, notif).markPaid(1, "00000000-0000-4000-8000-000000000005");
    expect(notif.createForUser).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000010","EXPENSE_PAID", expect.any(Function), 1);
  });
});
