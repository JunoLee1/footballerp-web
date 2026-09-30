import { AssetRequestService } from "./asset-request.service";
import { AppError } from "../lib/appError";
import type { AssetRequestRepository } from "./asset-request.repo";

jest.mock("../lib/cache", () => ({
  cached: jest.fn((_key: string, _ttl: number, fn: any) => fn()),
}));

jest.mock("../lib/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const REQUEST_FIXTURE = {
  id: 1,
  requesterId: "user-5",
  departmentId: 3,
  type: "HARDWARE",
  status: "DRAFT",
  expenseCategoryId: 1,
  expectedAmount: 10000,
  justification: "필요",
  clubId: 1,
  department: {
    id: 3,
    headId: "user-7",
    parent: { id: 2, headId: "user-9" },
  },
};

const makeRepo = (overrides: any = {}): jest.Mocked<AssetRequestRepository> => ({
  findById: jest.fn(),
  findAll: jest.fn(),
  findByRequester: jest.fn(),
  findByDepartment: jest.fn(),
  findPendingForLeader: jest.fn(),
  findPendingForDeptHead: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  addApproval: jest.fn(),
  linkEquipmentItem: jest.fn(),
  linkSoftwareLicense: jest.fn(),
  ...overrides,
} as unknown as jest.Mocked<AssetRequestRepository>);

const makePrisma = (): any => ({
  userDepartment: {
    findFirst: jest.fn().mockResolvedValue({ departmentId: 3 }),
  },
  $transaction: jest.fn().mockImplementation(async (fn: any) => fn({} as any)),
});

const makeNotifRepo = (): any => ({
  createForUser: jest.fn().mockResolvedValue(undefined),
  createForFinanceStaff: jest.fn().mockResolvedValue(undefined),
});

describe("AssetRequestService — clubId 스코핑 (Phase 2.5)", () => {
  describe("getById", () => {
    it("일치하는 clubId → 요청 반환", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(REQUEST_FIXTURE),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      const result = await service.getById(1, 1);
      expect(repo.findById).toHaveBeenCalledWith(1, 1);
      expect(result.id).toBe(1);
    });

    it("다른 clubId → repo null → 404 NOT_FOUND", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      await expect(service.getById(1, 99))
        .rejects.toThrow(new AppError(404, "NOT_FOUND"));
    });

    it("actorClubId undefined (SUPER_ADMIN) → 정상 반환", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(REQUEST_FIXTURE),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      const result = await service.getById(1);
      expect(repo.findById).toHaveBeenCalledWith(1, undefined);
      expect(result.id).toBe(1);
    });
  });

  describe("list", () => {
    it("me 필터 + clubId → repo.findByRequester 로 전달", async () => {
      const repo = makeRepo({
        findByRequester: jest.fn().mockResolvedValue([]),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      await service.list("user-5", "PLAYER", "me", undefined, 1);
      expect(repo.findByRequester).toHaveBeenCalledWith("user-5", undefined, 1);
    });

    it("pending-leader + clubId → repo.findPendingForLeader 로 전달", async () => {
      const repo = makeRepo({
        findPendingForLeader: jest.fn().mockResolvedValue([]),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      await service.list("user-7", "COACHING_STAFF", "pending-leader", undefined, 1);
      expect(repo.findPendingForLeader).toHaveBeenCalledWith("user-7", 1);
    });

    it("all 필터 + non-admin → 403 FORBIDDEN", async () => {
      const repo = makeRepo();
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      await expect(service.list("user-5", "PLAYER", "all", undefined, 1))
        .rejects.toThrow(new AppError(403, "FORBIDDEN"));
    });

    it("all 필터 + ADMIN + clubId → repo.findAll 로 전달", async () => {
      const repo = makeRepo({
        findAll: jest.fn().mockResolvedValue([]),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      await service.list("user-1", "ADMIN", "all", undefined, 1);
      expect(repo.findAll).toHaveBeenCalledWith(undefined, 1);
    });
  });

  describe("create", () => {
    it("actorClubId 를 repo.create 에 전달", async () => {
      const repo = makeRepo({
        create: jest.fn().mockResolvedValue({ id: 100 }),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      const dto = {
        type: "HARDWARE" as any,
        equipmentItemId: 1,
        expenseCategoryId: 1,
        expectedAmount: 10000,
        justification: "필요",
      };
      await service.create(dto, "user-5", 1);
      expect(repo.create).toHaveBeenCalledWith(dto, "user-5", 3, 1);
    });
  });

  describe("submit", () => {
    it("다른 clubId → 404 NOT_FOUND", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      await expect(service.submit(1, "user-5", 99))
        .rejects.toThrow(new AppError(404, "NOT_FOUND"));
    });

    it("일치하는 clubId + 본인 + DRAFT → SUBMITTED 전환", async () => {
      const findById = jest.fn().mockResolvedValue(REQUEST_FIXTURE);
      const updateStatus = jest.fn().mockResolvedValue({ ...REQUEST_FIXTURE, status: "SUBMITTED" });
      const repo = makeRepo({ findById, updateStatus });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      const result = await service.submit(1, "user-5", 1);
      expect(findById).toHaveBeenCalledWith(1, 1);
      expect(updateStatus).toHaveBeenCalledWith(1, { status: "SUBMITTED" });
      expect((result as any).status).toBe("SUBMITTED");
    });
  });

  describe("cancel", () => {
    it("다른 clubId → 404 NOT_FOUND", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      await expect(service.cancel(1, "user-5", 99))
        .rejects.toThrow(new AppError(404, "NOT_FOUND"));
    });
  });

  describe("leaderApprove", () => {
    it("다른 clubId → 404 NOT_FOUND", async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(null),
      });
      const service = new AssetRequestService(
        repo, {} as any, makeNotifRepo(), makePrisma(),
      );
      await expect(service.leaderApprove(1, "user-7", 99))
        .rejects.toThrow(new AppError(404, "NOT_FOUND"));
    });
  });
});
