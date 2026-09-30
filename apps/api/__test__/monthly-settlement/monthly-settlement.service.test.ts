import { MonthlySettlementService } from "../../src/monthly-settlement/monthly-settlement.service";
import { AppError } from "../../src/lib/appError";
import type { MonthlySettlementRepository } from "../../src/monthly-settlement/monthly-settlement.repo";

const makeReport = (overrides = {}) => ({
  id: 1,
  seasonId: 1,
  year: 2026,
  month: 8,
  status: "DRAFT",
  totalRevenue: 0,
  totalExpense: 0,
  netIncome: 0,
  snapshotJson: {},
  note: null,
  rejectionReason: null,
  createdById: "00000000-0000-4000-8000-000000000001",
  firstSubmittedById: null,
  firstSubmittedAt: null,
  firstApproverId: null,
  firstApprovedAt: null,
  approverId: null,
  approvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  season: { id: 1, name: "2026" },
  createdBy: { id: 1, username: "admin" },
  firstSubmittedBy: null,
  firstApprover: null,
  approver: null,
  ...overrides,
});

const makeRepo = (overrides: Partial<MonthlySettlementRepository> = {}): MonthlySettlementRepository => ({
  findByYearMonth: jest.fn().mockResolvedValue(null),
  findById: jest.fn().mockResolvedValue(null),
  findAll: jest.fn().mockResolvedValue([]),
  upsertDraft: jest.fn().mockResolvedValue(makeReport()),
  updateNote: jest.fn().mockResolvedValue(makeReport()),
  updateStatus: jest.fn().mockResolvedValue(makeReport()),
  lockAcademyFees: jest.fn().mockResolvedValue({ count: 0 }),
  createPeriodLock: jest.fn().mockResolvedValue({}),
  ...overrides,
} as unknown as MonthlySettlementRepository);

const makePrisma = (overrides: any = {}) => ({
  ledgerEntry: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  operatingExpense: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  budgetCategoryPlan: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  expenseCategory: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  revenueAdjustment: {
    aggregate: jest.fn().mockResolvedValue({ _sum: { delta: null } }),
  },
  monthlySettlementReport: {
    update: jest.fn().mockResolvedValue({}),
  },
  ...overrides,
} as any);

const makeService = (repo: MonthlySettlementRepository, prisma: any = makePrisma()) =>
  new MonthlySettlementService(repo, prisma);

// --- generate ---

describe("MonthlySettlementService.generate", () => {
  it("builds correct snapshotJson with revenue and expenses summed", async () => {
    const prisma = makePrisma({
      ledgerEntry: {
        groupBy: jest.fn().mockResolvedValue([
          { category: "TICKET", _sum: { amountKrw: 1_000_000 } },
          { category: "SPONSORSHIP", _sum: { amountKrw: 500_000 } },
        ]),
      },
      operatingExpense: {
        groupBy: jest.fn().mockResolvedValue([
          { categoryId: 1, _sum: { amount: 800_000 } },
          { categoryId: 2, _sum: { amount: 200_000 } },
        ]),
      },
      budgetCategoryPlan: {
        findMany: jest.fn().mockResolvedValue([
          { categoryId: 1, mandatoryMinimum: 700_000 },
          { categoryId: 2, mandatoryMinimum: 300_000 },
        ]),
      },
      expenseCategory: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, code: "SALARY" },
          { id: 2, code: "FACILITY" },
        ]),
      },
    });

    const repo = makeRepo();
    const service = makeService(repo, prisma);

    await service.generate(1, 2026, 8, 1);

    expect(repo.upsertDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonId: 1,
        year: 2026,
        month: 8,
        totalRevenue: 1_500_000,
        totalExpense: 1_000_000,
        netIncome: 500_000,
        snapshotJson: {
          revenue: { TICKET: 1_000_000, SPONSORSHIP: 500_000 },
          expenses: { SALARY: 800_000, FACILITY: 200_000 },
          budgetComparison: {
            SALARY: { budget: 700_000, actual: 800_000, variance: 100_000 },
            FACILITY: { budget: 300_000, actual: 200_000, variance: -100_000 },
          },
          pnl: { totalRevenue: 1_500_000, totalExpense: 1_000_000, netIncome: 500_000 },
        },
      }),
    );
  });

  it("handles empty revenue and expense lists", async () => {
    const repo = makeRepo();
    const service = makeService(repo);

    await service.generate(1, 2026, 8, 1);

    expect(repo.upsertDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        totalRevenue: 0,
        totalExpense: 0,
        netIncome: 0,
      }),
    );
  });
});

// --- submitFirst ---

describe("MonthlySettlementService.submitFirst", () => {
  it("throws 400 if status is not DRAFT", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({ status: "PENDING_FIRST" })),
    });
    await expect(makeService(repo).submitFirst(1, 1))
      .rejects.toThrow(new AppError(400, "SETTLEMENT_NOT_DRAFT"));
  });

  it("throws 400 if status is FIRST_APPROVED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({ status: "FIRST_APPROVED" })),
    });
    await expect(makeService(repo).submitFirst(1, 1))
      .rejects.toThrow(new AppError(400, "SETTLEMENT_NOT_DRAFT"));
  });

  it("calls updateStatus with PENDING_FIRST when status is DRAFT", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({ status: "DRAFT" })),
    });
    await makeService(repo).submitFirst(1, "00000000-0000-4000-8000-000000000042");
    expect(repo.updateStatus).toHaveBeenCalledWith(1, expect.objectContaining({
      status: "PENDING_FIRST",
      firstSubmittedById: "00000000-0000-4000-8000-000000000042",
    }));
  });
});

// --- approve ---

describe("MonthlySettlementService.approve", () => {
  it("calls lockAcademyFees and createPeriodLock after approval", async () => {
    const report = makeReport({ status: "FIRST_APPROVED", year: 2026, month: 8 });
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(report),
    });
    const service = makeService(repo);
    await service.approve(1, "00000000-0000-4000-8000-000000000099");

    expect(repo.updateStatus).toHaveBeenCalledWith(1, expect.objectContaining({
      status: "APPROVED",
      approverId: "00000000-0000-4000-8000-000000000099",
    }));
    expect(repo.lockAcademyFees).toHaveBeenCalledWith(2026, 8);
    expect(repo.createPeriodLock).toHaveBeenCalledWith(2026, 8, "00000000-0000-4000-8000-000000000099");
  });

  it("throws 400 if status is not FIRST_APPROVED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({ status: "PENDING_FIRST" })),
    });
    await expect(makeService(repo).approve(1, 1))
      .rejects.toThrow(new AppError(400, "SETTLEMENT_NOT_FIRST_APPROVED"));
  });

  it("throws 400 if status is DRAFT", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({ status: "DRAFT" })),
    });
    await expect(makeService(repo).approve(1, 1))
      .rejects.toThrow(new AppError(400, "SETTLEMENT_NOT_FIRST_APPROVED"));
  });
});

// --- reject ---

describe("MonthlySettlementService.reject", () => {
  it("resets status to DRAFT with rejectionReason, clears approval fields", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({
        status: "PENDING_FIRST",
        firstSubmittedById: "00000000-0000-4000-8000-000000000010",
        firstSubmittedAt: new Date(),
      })),
    });
    await makeService(repo).reject(1, "데이터 오류");

    expect(repo.updateStatus).toHaveBeenCalledWith(1, {
      status: "DRAFT",
      rejectionReason: "데이터 오류",
      firstSubmittedById: null,
      firstSubmittedAt: null,
      firstApproverId: null,
      firstApprovedAt: null,
      approverId: null,
      approvedAt: null,
    });
  });

  it("can reject from FIRST_APPROVED status", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({ status: "FIRST_APPROVED" })),
    });
    await makeService(repo).reject(1, "1차 승인 취소");
    expect(repo.updateStatus).toHaveBeenCalledWith(1, expect.objectContaining({
      status: "DRAFT",
      rejectionReason: "1차 승인 취소",
    }));
  });

  it("throws 400 if status is DRAFT (not rejectable)", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({ status: "DRAFT" })),
    });
    await expect(makeService(repo).reject(1, "reason"))
      .rejects.toThrow(new AppError(400, "SETTLEMENT_NOT_REJECTABLE"));
  });

  it("throws 400 if status is APPROVED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeReport({ status: "APPROVED" })),
    });
    await expect(makeService(repo).reject(1, "reason"))
      .rejects.toThrow(new AppError(400, "SETTLEMENT_NOT_REJECTABLE"));
  });
});
