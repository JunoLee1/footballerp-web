import { AssetRequestService } from "../../src/asset-request/asset-request.service";
import { AppError } from "../../src/lib/appError";
import type { AssetRequestRepository } from "../../src/asset-request/asset-request.repo";
import type { OperatingExpenseRepository } from "../../src/operating-expense/operating-expense.repo";
import type { NotificationRepository } from "../../src/notification/notification.repo";
import type { PrismaClient } from "../../src/generated/client";
import type { CreateAssetRequestDto } from "../../src/asset-request/dto/asset-request.dto";

jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));

const REQUESTER = "00000000-0000-4000-8000-000000000100";
const LEADER = "00000000-0000-4000-8000-000000000200";
const DEPT_HEAD = "00000000-0000-4000-8000-000000000300";
const OUTSIDER = "00000000-0000-4000-8000-000000000999";
const LEAF_DEPT = 10;
const PARENT_DEPT = 5;
const CAT_ID = 7; // IT_SECURITY-ish
const BUDGET_LINE_ID = 555;
const ACTIVE_SEASON_ID = 1;

const makeRequest = (overrides: Partial<any> = {}) => ({
  id: 1,
  requesterId: REQUESTER,
  departmentId: LEAF_DEPT,
  type: "SOFTWARE" as const,
  status: "DRAFT" as const,
  equipmentItemId: null,
  softwareLicenseId: null,
  customName: null,
  customDescription: null,
  expenseCategoryId: CAT_ID,
  expectedAmount: 500_000,
  neededBy: null,
  justification: "필요합니다",
  operatingExpenseId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  requester: { id: REQUESTER, username: "requester", nickname: "R" },
  department: {
    id: LEAF_DEPT,
    name: "그라운드 매니지먼트",
    headId: LEADER,
    parent: { id: PARENT_DEPT, name: "시설관리팀", headId: DEPT_HEAD },
  },
  expenseCategory: { id: CAT_ID, code: "IT_SECURITY", label: "IT 보안" },
  equipmentItem: null,
  softwareLicense: null,
  operatingExpense: null,
  approvals: [],
  ...overrides,
});

const makeBudgetLine = (overrides: Partial<any> = {}) => ({
  id: BUDGET_LINE_ID,
  originalAmount: 5_000_000,
  month: null,
  year: new Date().getFullYear(),
  departmentId: LEAF_DEPT,
  ...overrides,
});

const makeExpense = (overrides: Partial<any> = {}) => ({
  id: 42,
  amount: 500_000,
  status: "PENDING",
  budgetLineId: BUDGET_LINE_ID,
  expenseCategory: { code: "IT_SECURITY" },
  ...overrides,
});

const makeRepo = (overrides: Partial<AssetRequestRepository> = {}): AssetRequestRepository =>
  ({
    create: jest.fn().mockImplementation(async (dto, requesterId, deptId) => makeRequest({
      requesterId,
      departmentId: deptId,
      type: dto.type,
      expectedAmount: dto.expectedAmount,
    })),
    findById: jest.fn().mockResolvedValue(null),
    findByRequester: jest.fn().mockResolvedValue([]),
    findByDepartment: jest.fn().mockResolvedValue([]),
    findPendingForLeader: jest.fn().mockResolvedValue([]),
    findPendingForDeptHead: jest.fn().mockResolvedValue([]),
    findAll: jest.fn().mockResolvedValue([]),
    updateStatus: jest.fn().mockImplementation(async (id, patch) => makeRequest({ id, status: patch.status, operatingExpenseId: patch.operatingExpenseId ?? null })),
    addApproval: jest.fn().mockResolvedValue({}),
    linkEquipmentItem: jest.fn().mockResolvedValue({}),
    linkSoftwareLicense: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as AssetRequestRepository);

const makeExpenseRepo = (overrides: Partial<OperatingExpenseRepository> = {}): OperatingExpenseRepository =>
  ({
    findBudgetLineForSeasonCategoryDept: jest.fn().mockResolvedValue(makeBudgetLine()),
    createWithBudgetCheck: jest.fn().mockResolvedValue(makeExpense()),
    ...overrides,
  } as unknown as OperatingExpenseRepository);

const makeNotifRepo = (): NotificationRepository =>
  ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForFinanceStaff: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationRepository);

const makePrisma = (overrides: Partial<any> = {}): PrismaClient =>
  ({
    userDepartment: {
      findFirst: jest.fn().mockResolvedValue({ departmentId: LEAF_DEPT }),
    },
    season: {
      findFirst: jest.fn().mockResolvedValue({ id: ACTIVE_SEASON_ID }),
    },
    equipmentItem: {
      create: jest.fn().mockResolvedValue({ id: 77, name: "Custom Laptop" }),
    },
    softwareLicense: {
      create: jest.fn().mockResolvedValue({ id: 88, name: "Custom License" }),
    },
    // approve() / leaderApprove() wrap DB writes in $transaction; the tx client
    // is passed through to repo methods as an optional param but the mocked
    // repos in these tests ignore that arg, so a passthrough tx is enough.
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn({})),
    ...overrides,
  } as unknown as PrismaClient);

const makeService = (
  repo = makeRepo(),
  expenseRepo = makeExpenseRepo(),
  notif = makeNotifRepo(),
  prisma = makePrisma(),
) => new AssetRequestService(repo, expenseRepo, notif, prisma);

const baseCreateDto: CreateAssetRequestDto = {
  type: "SOFTWARE",
  softwareLicenseId: 3,
  expenseCategoryId: CAT_ID,
  expectedAmount: 500_000,
  justification: "필요",
};

// ────────────────────────────────────────────
// create
// ────────────────────────────────────────────

describe("AssetRequestService.create", () => {
  it("creates SOFTWARE request with softwareLicenseId", async () => {
    const repo = makeRepo();
    const result = await makeService(repo).create(baseCreateDto, REQUESTER);
    expect(result.status).toBe("DRAFT");
    expect(repo.create).toHaveBeenCalledWith(baseCreateDto, REQUESTER, LEAF_DEPT, undefined);
  });

  it("creates HARDWARE request with equipmentItemId", async () => {
    const repo = makeRepo();
    const dto: CreateAssetRequestDto = {
      type: "HARDWARE",
      equipmentItemId: 5,
      expenseCategoryId: CAT_ID,
      expectedAmount: 200_000,
      justification: "필요",
    };
    await makeService(repo).create(dto, REQUESTER);
    expect(repo.create).toHaveBeenCalled();
  });

  it("creates SOFTWARE request with customName", async () => {
    const repo = makeRepo();
    const dto: CreateAssetRequestDto = {
      type: "SOFTWARE",
      customName: "New tool",
      expenseCategoryId: CAT_ID,
      expectedAmount: 100_000,
      justification: "필요",
    };
    await makeService(repo).create(dto, REQUESTER);
    expect(repo.create).toHaveBeenCalled();
  });

  it("throws 400 INVALID_PAYLOAD when no payload key set", async () => {
    const dto = {
      type: "SOFTWARE" as const,
      expenseCategoryId: CAT_ID,
      expectedAmount: 100_000,
      justification: "필요",
    };
    await expect(makeService().create(dto, REQUESTER)).rejects.toThrow(new AppError(400, "INVALID_PAYLOAD"));
  });

  it("throws 400 INVALID_PAYLOAD when two payload keys set", async () => {
    const dto: CreateAssetRequestDto = {
      type: "SOFTWARE",
      softwareLicenseId: 3,
      customName: "Foo",
      expenseCategoryId: CAT_ID,
      expectedAmount: 100_000,
      justification: "필요",
    };
    await expect(makeService().create(dto, REQUESTER)).rejects.toThrow(new AppError(400, "INVALID_PAYLOAD"));
  });

  it("throws 400 when SOFTWARE type carries equipmentItemId", async () => {
    const dto: CreateAssetRequestDto = {
      type: "SOFTWARE",
      equipmentItemId: 3,
      expenseCategoryId: CAT_ID,
      expectedAmount: 100_000,
      justification: "필요",
    };
    await expect(makeService().create(dto, REQUESTER)).rejects.toThrow(new AppError(400, "INVALID_PAYLOAD"));
  });

  it("throws 400 when HARDWARE type carries softwareLicenseId", async () => {
    const dto: CreateAssetRequestDto = {
      type: "HARDWARE",
      softwareLicenseId: 3,
      expenseCategoryId: CAT_ID,
      expectedAmount: 100_000,
      justification: "필요",
    };
    await expect(makeService().create(dto, REQUESTER)).rejects.toThrow(new AppError(400, "INVALID_PAYLOAD"));
  });

  it("throws 400 INVALID_AMOUNT when expectedAmount is zero", async () => {
    const dto: CreateAssetRequestDto = { ...baseCreateDto, expectedAmount: 0 };
    await expect(makeService().create(dto, REQUESTER)).rejects.toThrow(new AppError(400, "INVALID_AMOUNT"));
  });

  it("throws 400 NO_DEPARTMENT when user has no membership", async () => {
    const prisma = makePrisma({
      userDepartment: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      makeService(makeRepo(), makeExpenseRepo(), makeNotifRepo(), prisma).create(baseCreateDto, REQUESTER),
    ).rejects.toThrow(new AppError(400, "NO_DEPARTMENT"));
  });
});

// ────────────────────────────────────────────
// submit
// ────────────────────────────────────────────

describe("AssetRequestService.submit", () => {
  it("DRAFT → SUBMITTED and notifies leader", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRequest({ status: "DRAFT" })),
    });
    const result = await makeService(repo, makeExpenseRepo(), notif).submit(1, REQUESTER);
    expect(result.status).toBe("SUBMITTED");
    expect(repo.updateStatus).toHaveBeenCalledWith(1, { status: "SUBMITTED" });
    expect(notif.createForUser).toHaveBeenCalledWith(LEADER, expect.any(String), expect.any(Function), 1);
  });

  it("throws 403 NOT_YOUR_REQUEST when caller is not requester", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "DRAFT" })) });
    await expect(makeService(repo).submit(1, OUTSIDER)).rejects.toThrow(new AppError(403, "NOT_YOUR_REQUEST"));
  });

  it("throws 400 INVALID_STATUS when not DRAFT", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "SUBMITTED" })) });
    await expect(makeService(repo).submit(1, REQUESTER)).rejects.toThrow(new AppError(400, "INVALID_STATUS"));
  });
});

// ────────────────────────────────────────────
// leaderApprove
// ────────────────────────────────────────────

describe("AssetRequestService.leaderApprove", () => {
  it("SUBMITTED → LEADER_APPROVED and notifies dept-head", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRequest({ status: "SUBMITTED" })),
    });
    const result = await makeService(repo, makeExpenseRepo(), notif).leaderApprove(1, LEADER);
    expect(result.status).toBe("LEADER_APPROVED");
    // addApproval now receives an optional tx passthrough as its 3rd arg
    expect(repo.addApproval).toHaveBeenCalledWith(
      1,
      { stage: "LEADER", action: "APPROVED", reviewerId: LEADER },
      expect.anything(),
    );
    expect(notif.createForUser).toHaveBeenCalledWith(DEPT_HEAD, expect.any(String), expect.any(Function), 1);
  });

  it("throws 400 INVALID_STATUS when not SUBMITTED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "DRAFT" })) });
    await expect(makeService(repo).leaderApprove(1, LEADER)).rejects.toThrow(new AppError(400, "INVALID_STATUS"));
  });

  it("throws 403 NOT_LEADER when reviewer is not dept head", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "SUBMITTED" })) });
    await expect(makeService(repo).leaderApprove(1, OUTSIDER)).rejects.toThrow(new AppError(403, "NOT_LEADER"));
  });

  it("throws 403 SELF_APPROVAL_FORBIDDEN when leader is the requester", async () => {
    // requester is also the leaf dept head
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(
        makeRequest({
          status: "SUBMITTED",
          requesterId: LEADER,
          department: {
            id: LEAF_DEPT,
            name: "leaf",
            headId: LEADER,
            parent: { id: PARENT_DEPT, name: "parent", headId: DEPT_HEAD },
          },
        }),
      ),
    });
    await expect(makeService(repo).leaderApprove(1, LEADER)).rejects.toThrow(
      new AppError(403, "SELF_APPROVAL_FORBIDDEN"),
    );
  });
});

// ────────────────────────────────────────────
// leaderReject
// ────────────────────────────────────────────

describe("AssetRequestService.leaderReject", () => {
  it("SUBMITTED → LEADER_REJECTED and notifies requester", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRequest({ status: "SUBMITTED" })),
    });
    const result = await makeService(repo, makeExpenseRepo(), notif).leaderReject(1, LEADER, "예산 부족");
    expect(result.status).toBe("LEADER_REJECTED");
    expect(repo.addApproval).toHaveBeenCalledWith(1, {
      stage: "LEADER",
      action: "REJECTED",
      reviewerId: LEADER,
      reason: "예산 부족",
    });
    expect(notif.createForUser).toHaveBeenCalledWith(REQUESTER, expect.any(String), expect.any(Function), 1);
  });

  it("throws 400 REASON_REQUIRED when reason is blank", async () => {
    await expect(makeService().leaderReject(1, LEADER, "   ")).rejects.toThrow(new AppError(400, "REASON_REQUIRED"));
  });
});

// ────────────────────────────────────────────
// approve (dept-head)
// ────────────────────────────────────────────

describe("AssetRequestService.approve", () => {
  const loadReq = (patch: Partial<any> = {}) =>
    makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "LEADER_APPROVED", ...patch })) });

  it("LEADER_APPROVED → APPROVED and creates OperatingExpense", async () => {
    const repo = loadReq();
    const expenseRepo = makeExpenseRepo();
    const notif = makeNotifRepo();
    const result = await makeService(repo, expenseRepo, notif).approve(1, DEPT_HEAD);
    expect(result.status).toBe("APPROVED");
    // createWithBudgetCheck / updateStatus now receive an optional tx passthrough as their last arg
    expect(expenseRepo.createWithBudgetCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonId: ACTIVE_SEASON_ID,
        categoryId: CAT_ID,
        amount: 500_000,
        budgetLineId: BUDGET_LINE_ID,
        createdById: DEPT_HEAD,
        costType: "VARIABLE",
      }),
      expect.anything(),
    );
    expect(repo.updateStatus).toHaveBeenCalledWith(
      1,
      { status: "APPROVED", operatingExpenseId: 42 },
      expect.anything(),
    );
    expect(notif.createForFinanceStaff).toHaveBeenCalled();
    expect(notif.createForUser).toHaveBeenCalledWith(REQUESTER, expect.any(String), expect.any(Function), 1);
  });

  it("throws 400 INVALID_STATUS when not LEADER_APPROVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "SUBMITTED" })) });
    await expect(makeService(repo).approve(1, DEPT_HEAD)).rejects.toThrow(new AppError(400, "INVALID_STATUS"));
  });

  it("throws 403 NOT_DEPT_HEAD when reviewer is not parent dept head", async () => {
    const repo = loadReq();
    await expect(makeService(repo).approve(1, OUTSIDER)).rejects.toThrow(new AppError(403, "NOT_DEPT_HEAD"));
  });

  it("throws 403 SELF_APPROVAL_FORBIDDEN when requester === dept-head", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(
        makeRequest({
          status: "LEADER_APPROVED",
          requesterId: DEPT_HEAD,
          department: {
            id: LEAF_DEPT,
            name: "leaf",
            headId: LEADER,
            parent: { id: PARENT_DEPT, name: "parent", headId: DEPT_HEAD },
          },
        }),
      ),
    });
    await expect(makeService(repo).approve(1, DEPT_HEAD)).rejects.toThrow(
      new AppError(403, "SELF_APPROVAL_FORBIDDEN"),
    );
  });

  it("throws 400 BUDGET_LINE_NOT_FOUND when both dept and null fallback fail", async () => {
    const repo = loadReq();
    const expenseRepo = makeExpenseRepo({
      findBudgetLineForSeasonCategoryDept: jest.fn().mockResolvedValue(null),
    });
    await expect(makeService(repo, expenseRepo).approve(1, DEPT_HEAD)).rejects.toThrow(
      new AppError(400, "BUDGET_LINE_NOT_FOUND"),
    );
    // called twice: dept-scoped then null fallback
    expect(expenseRepo.findBudgetLineForSeasonCategoryDept).toHaveBeenCalledTimes(2);
  });

  it("uses null-department fallback when dept-scoped match fails", async () => {
    const repo = loadReq();
    const findMock = jest
      .fn()
      // dept-scoped call → null
      .mockResolvedValueOnce(null)
      // club-wide fallback → hit
      .mockResolvedValueOnce(makeBudgetLine({ departmentId: null }));
    const expenseRepo = makeExpenseRepo({ findBudgetLineForSeasonCategoryDept: findMock });
    const result = await makeService(repo, expenseRepo).approve(1, DEPT_HEAD);
    expect(result.status).toBe("APPROVED");
    expect(findMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ departmentId: LEAF_DEPT }));
    expect(findMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ departmentId: null }));
  });

  it("propagates BUDGET_EXCEEDED as 409", async () => {
    const repo = loadReq();
    const expenseRepo = makeExpenseRepo({
      createWithBudgetCheck: jest.fn().mockRejectedValue(new Error("BUDGET_EXCEEDED")),
    });
    await expect(makeService(repo, expenseRepo).approve(1, DEPT_HEAD)).rejects.toThrow(
      new AppError(409, "BUDGET_EXCEEDED"),
    );
  });

  it("throws 400 NO_ACTIVE_SEASON when no active season", async () => {
    const repo = loadReq();
    const prisma = makePrisma({ season: { findFirst: jest.fn().mockResolvedValue(null) } });
    await expect(
      makeService(repo, makeExpenseRepo(), makeNotifRepo(), prisma).approve(1, DEPT_HEAD),
    ).rejects.toThrow(new AppError(400, "NO_ACTIVE_SEASON"));
  });
});

// ────────────────────────────────────────────
// reject (dept-head)
// ────────────────────────────────────────────

describe("AssetRequestService.reject", () => {
  it("LEADER_APPROVED → REJECTED with reason", async () => {
    const notif = makeNotifRepo();
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "LEADER_APPROVED" })) });
    const result = await makeService(repo, makeExpenseRepo(), notif).reject(1, DEPT_HEAD, "예산 없음");
    expect(result.status).toBe("REJECTED");
    expect(repo.addApproval).toHaveBeenCalledWith(1, {
      stage: "DEPT_HEAD",
      action: "REJECTED",
      reviewerId: DEPT_HEAD,
      reason: "예산 없음",
    });
    expect(notif.createForUser).toHaveBeenCalledWith(REQUESTER, expect.any(String), expect.any(Function), 1);
  });

  it("throws 400 REASON_REQUIRED when reason is blank", async () => {
    await expect(makeService().reject(1, DEPT_HEAD, "")).rejects.toThrow(new AppError(400, "REASON_REQUIRED"));
  });
});

// ────────────────────────────────────────────
// cancel
// ────────────────────────────────────────────

describe("AssetRequestService.cancel", () => {
  it("cancels DRAFT request", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "DRAFT" })) });
    const result = await makeService(repo).cancel(1, REQUESTER);
    expect(result.status).toBe("CANCELLED");
  });

  it("cancels SUBMITTED request", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "SUBMITTED" })) });
    const result = await makeService(repo).cancel(1, REQUESTER);
    expect(result.status).toBe("CANCELLED");
  });

  it("throws 400 INVALID_STATUS when LEADER_APPROVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "LEADER_APPROVED" })) });
    await expect(makeService(repo).cancel(1, REQUESTER)).rejects.toThrow(new AppError(400, "INVALID_STATUS"));
  });

  it("throws 403 NOT_YOUR_REQUEST when caller is not requester", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "DRAFT" })) });
    await expect(makeService(repo).cancel(1, OUTSIDER)).rejects.toThrow(new AppError(403, "NOT_YOUR_REQUEST"));
  });
});

// ────────────────────────────────────────────
// fulfill
// ────────────────────────────────────────────

describe("AssetRequestService.fulfill", () => {
  it("APPROVED → FULFILLED for ASSET_MANAGER on SOFTWARE type", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(
        makeRequest({ status: "APPROVED", type: "SOFTWARE", softwareLicenseId: 3 }),
      ),
    });
    const result = await makeService(repo).fulfill(1, "00000000-0000-4000-8000-000000000500", "FRONT_OFFICE", "ASSET_MANAGER");
    expect(result.status).toBe("FULFILLED");
  });

  it("APPROVED → FULFILLED for EQUIPMENT_MANAGER on HARDWARE type", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(
        makeRequest({ status: "APPROVED", type: "HARDWARE", equipmentItemId: 3 }),
      ),
    });
    const result = await makeService(repo).fulfill(1, "00000000-0000-4000-8000-000000000500", "FRONT_OFFICE", "EQUIPMENT_MANAGER");
    expect(result.status).toBe("FULFILLED");
  });

  it("APPROVED → FULFILLED for ADMIN regardless of type", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(
        makeRequest({ status: "APPROVED", type: "HARDWARE", equipmentItemId: 3 }),
      ),
    });
    const result = await makeService(repo).fulfill(1, "00000000-0000-4000-8000-000000000500", "ADMIN", null);
    expect(result.status).toBe("FULFILLED");
  });

  it("throws 400 INVALID_STATUS when not APPROVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRequest({ status: "DRAFT" })) });
    await expect(makeService(repo).fulfill(1, "00000000-0000-4000-8000-000000000500", "ADMIN", null)).rejects.toThrow(
      new AppError(400, "INVALID_STATUS"),
    );
  });

  it("throws 403 for PLAYER role", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(
        makeRequest({ status: "APPROVED", type: "SOFTWARE", softwareLicenseId: 3 }),
      ),
    });
    await expect(makeService(repo).fulfill(1, "00000000-0000-4000-8000-000000000500", "PLAYER", null)).rejects.toThrow(
      new AppError(403, "FORBIDDEN"),
    );
  });

  it("creates EquipmentItem for custom HARDWARE request", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(
        makeRequest({ status: "APPROVED", type: "HARDWARE", customName: "New drone" }),
      ),
    });
    const prisma = makePrisma();
    await makeService(repo, makeExpenseRepo(), makeNotifRepo(), prisma).fulfill(1, "00000000-0000-4000-8000-000000000500", "ADMIN", null);
    expect(prisma.equipmentItem.create).toHaveBeenCalled();
    expect(repo.linkEquipmentItem).toHaveBeenCalledWith(1, 77);
  });

  it("creates SoftwareLicense for custom SOFTWARE request", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(
        makeRequest({ status: "APPROVED", type: "SOFTWARE", customName: "New tool" }),
      ),
    });
    const prisma = makePrisma();
    await makeService(repo, makeExpenseRepo(), makeNotifRepo(), prisma).fulfill(1, "00000000-0000-4000-8000-000000000500", "ADMIN", null);
    expect(prisma.softwareLicense.create).toHaveBeenCalled();
    expect(repo.linkSoftwareLicense).toHaveBeenCalledWith(1, 88);
  });
});
