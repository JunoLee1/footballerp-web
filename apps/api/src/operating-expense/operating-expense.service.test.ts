import { OperatingExpenseService } from "./operating-expense.service";
import { OperatingExpenseRepository } from "./operating-expense.repo";
import { AppError } from "../lib/appError";

const USER_10 = "11111111-1111-1111-1111-111111111110";
const EXPENSE_FIXTURE = {
  id: 1,
  seasonId: 1,
  categoryId: 2,
  amount: 500_000,
  date: new Date(),
  createdById: USER_10,
  status: "PENDING",
  deletedAt: null,
  paidAt: null,
  expenseCategory: { code: "STAFF_WAGES" },
  budgetLine: null,
  createdBy: { id: USER_10, username: "user" },
};

function mockRepo(): jest.Mocked<OperatingExpenseRepository> {
  return {
    findBySeasonId: jest.fn(),
    findById: jest.fn(),
    findBudgetLine: jest.fn(),
    findBudgetLinesForSeasonCategory: jest.fn(),
    findBudgetLineForSeasonCategoryDept: jest.fn(),
    createWithBudgetCheck: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findBudgetPlan: jest.fn(),
    sumSpendBySeasonAndCategory: jest.fn(),
    softDelete: jest.fn(),
    purgeExpired: jest.fn(),
  } as unknown as jest.Mocked<OperatingExpenseRepository>;
}

function mockNotifRepo() {
  return {
    createForFinanceStaff: jest.fn().mockResolvedValue(undefined),
    createForFinanceManager: jest.fn().mockResolvedValue(undefined),
    createForUser: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function mockCategoryService() {
  return {
    isValidCode: jest.fn().mockResolvedValue(true),
    resolveCategoryId: jest.fn().mockResolvedValue(2),
  } as any;
}

describe("OperatingExpenseService — clubId 스코핑", () => {
  let repo: jest.Mocked<OperatingExpenseRepository>;
  let service: OperatingExpenseService;

  beforeEach(() => {
    repo = mockRepo();
    service = new OperatingExpenseService(repo as any, mockNotifRepo(), mockCategoryService());
  });

  describe("list", () => {
    it("actorClubId를 repo.findBySeasonId에 전달한다", async () => {
      repo.findBySeasonId.mockResolvedValue([{ ...EXPENSE_FIXTURE }] as any);
      await service.list(1, 5);
      expect(repo.findBySeasonId).toHaveBeenCalledWith(1, 5);
    });

    it("actorClubId = null → null 전달", async () => {
      repo.findBySeasonId.mockResolvedValue([]);
      await service.list(1, null);
      expect(repo.findBySeasonId).toHaveBeenCalledWith(1, null);
    });
  });

  describe("approve", () => {
    it("일치하는 clubId → 승인 처리", async () => {
      repo.findById.mockResolvedValue({ ...EXPENSE_FIXTURE, status: "PENDING" } as any);
      repo.updateStatus.mockResolvedValue({} as any);
      await service.approve(1, "99999999-9999-9999-9999-999999999999", "ADMIN", null, undefined, 5);
      expect(repo.findById).toHaveBeenCalledWith(1, 5);
    });

    it("다른 clubId → repo null → 404 NOT_FOUND", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.approve(1, "99999999-9999-9999-9999-999999999999", "ADMIN", null, undefined, 99)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("actorClubId = null (SUPER_ADMIN) → clubId 필터 없이 처리", async () => {
      repo.findById.mockResolvedValue({ ...EXPENSE_FIXTURE, status: "PENDING" } as any);
      repo.updateStatus.mockResolvedValue({} as any);
      await service.approve(1, "99999999-9999-9999-9999-999999999999", "ADMIN", null, undefined, null);
      expect(repo.findById).toHaveBeenCalledWith(1, null);
    });
  });

  describe("delete", () => {
    it("다른 clubId → repo null → 404 NOT_FOUND", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.delete(1, USER_10, "ADMIN", "reason", 99)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("일치하는 clubId + PENDING → 소프트 삭제", async () => {
      repo.findById.mockResolvedValue({ ...EXPENSE_FIXTURE, status: "PENDING", createdById: USER_10 } as any);
      repo.softDelete.mockResolvedValue({} as any);
      await service.delete(1, USER_10, "FRONT_OFFICE", "reason", 5);
      expect(repo.findById).toHaveBeenCalledWith(1, 5);
      expect(repo.softDelete).toHaveBeenCalledWith(1, "reason");
    });
  });
});
