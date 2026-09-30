import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { AdminService } from "../../src/admin/admin.service";

const REQUESTER = "00000000-0000-4000-8000-000000000001";
const USER_2 = "00000000-0000-4000-8000-000000000002";
const USER_3 = "00000000-0000-4000-8000-000000000003";
const USER_99 = "00000000-0000-4000-8000-000000000099";

const mockRepo = {
  listUsers: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  findById: jest.fn(),
  updateRole: jest.fn(),
  setDeleted: jest.fn(),
  getLinkedData: jest.fn(),
  hardDelete: jest.fn(),
  setDemo: jest.fn(),
  listAuditLogs: jest.fn(),
  countAuditLogs: jest.fn(),
} as any;

const service = new AdminService(mockRepo);

describe("AdminService - listUsers", () => {
  beforeEach(() => jest.clearAllMocks());

  test("delegates to repo with filters", async () => {
    const filters = { role: "COACHING_STAFF" as const };
    mockRepo.listUsers.mockResolvedValue([{ id: REQUESTER }]);
    const result = await service.listUsers(filters);
    expect(mockRepo.listUsers).toHaveBeenCalledWith(filters, undefined);
    expect(result).toHaveLength(1);
  });
});

describe("AdminService - getUserById", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns user when found", async () => {
    mockRepo.findById.mockResolvedValue({ id: REQUESTER, username: "juno", isDeleted: false });
    const result = await service.getUserById(REQUESTER);
    expect(result.id).toBe(REQUESTER);
  });

  test("throws 404 when not found", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.getUserById(USER_99)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });
});

describe("AdminService - updateUserRole", () => {
  beforeEach(() => jest.clearAllMocks());

  test("cannot change own role → 403", async () => {
    await expect(service.updateUserRole(REQUESTER, { role: "FRONT_OFFICE" }, REQUESTER)).rejects.toMatchObject({
      statusCode: 403,
      code: "CANNOT_MODIFY_SELF",
    });
  });

  test("throws 404 when user not found", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.updateUserRole(USER_2, { role: "FRONT_OFFICE" }, REQUESTER)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  test("clears coachingRole when switching from COACHING_STAFF to FRONT_OFFICE", async () => {
    mockRepo.findById.mockResolvedValue({ id: USER_2, role: "COACHING_STAFF", coachingRole: "HEAD_COACH" });
    mockRepo.updateRole.mockResolvedValue({ id: USER_2, role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "GM" });

    await service.updateUserRole(USER_2, { role: "FRONT_OFFICE", frontOfficeRole: "GM" }, REQUESTER, "SUPER_ADMIN");

    expect(mockRepo.updateRole).toHaveBeenCalledWith(USER_2, "FRONT_OFFICE", null, "GM", undefined);
  });

  test("clears frontOfficeRole when switching to COACHING_STAFF", async () => {
    mockRepo.findById.mockResolvedValue({ id: USER_3, role: "FRONT_OFFICE", frontOfficeRole: "SCOUT" });
    mockRepo.updateRole.mockResolvedValue({ id: USER_3, role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null });

    await service.updateUserRole(USER_3, { role: "COACHING_STAFF", coachingRole: "HEAD_COACH" }, REQUESTER);

    expect(mockRepo.updateRole).toHaveBeenCalledWith(USER_3, "COACHING_STAFF", "HEAD_COACH", null, undefined);
  });
});

describe("AdminService - deactivateUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("cannot deactivate self → 403", async () => {
    await expect(service.deactivateUser(REQUESTER, REQUESTER)).rejects.toMatchObject({
      statusCode: 403,
      code: "CANNOT_MODIFY_SELF",
    });
  });

  test("throws 404 when user not found", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.deactivateUser(USER_2, REQUESTER)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  test("sets isDeleted = true", async () => {
    mockRepo.findById.mockResolvedValue({ id: USER_2, isDeleted: false });
    mockRepo.setDeleted.mockResolvedValue({ id: USER_2, isDeleted: true });

    await service.deactivateUser(USER_2, REQUESTER);

    expect(mockRepo.setDeleted).toHaveBeenCalledWith(USER_2, true);
  });
});

describe("AdminService - reactivateUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("throws 404 when not found", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.reactivateUser(USER_2)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  test("sets isDeleted = false", async () => {
    mockRepo.findById.mockResolvedValue({ id: USER_2, isDeleted: true });
    mockRepo.setDeleted.mockResolvedValue({ id: USER_2, isDeleted: false });

    await service.reactivateUser(USER_2);

    expect(mockRepo.setDeleted).toHaveBeenCalledWith(USER_2, false);
  });
});

describe("AdminService - deleteUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("cannot delete self → 403", async () => {
    await expect(service.deleteUser(REQUESTER, REQUESTER)).rejects.toMatchObject({
      statusCode: 403,
      code: "CANNOT_MODIFY_SELF",
    });
  });

  test("throws 404 when user not found", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.deleteUser(USER_2, REQUESTER)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  test("throws 409 when user has linked contracts", async () => {
    mockRepo.findById.mockResolvedValue({ id: USER_2, isDeleted: false });
    mockRepo.getLinkedData.mockResolvedValue({
      player: null,
      _count: { managedContracts: 2, createdSessions: 0, approvedSessions: 0, tacticalAnalyses: 0, managedInjuries: 0, agentPlayers: 0, recallRequests: 0, recallApprovals: 0 },
    });

    await expect(service.deleteUser(USER_2, REQUESTER)).rejects.toMatchObject({
      statusCode: 409,
      code: "USER_HAS_LINKED_DATA",
    });
  });

  test("hard deletes when no linked data", async () => {
    mockRepo.findById.mockResolvedValue({ id: USER_2, isDeleted: true });
    mockRepo.getLinkedData.mockResolvedValue({
      player: null,
      _count: { managedContracts: 0, createdSessions: 0, approvedSessions: 0, tacticalAnalyses: 0, managedInjuries: 0, agentPlayers: 0, recallRequests: 0, recallApprovals: 0 },
    });
    mockRepo.hardDelete.mockResolvedValue(undefined);

    await service.deleteUser(USER_2, REQUESTER);

    expect(mockRepo.hardDelete).toHaveBeenCalledWith(USER_2);
  });
});

describe("AdminService - listUsers (isDemo masking)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("isDemo=false이면 email/username 원본 반환", async () => {
    mockRepo.listUsers.mockResolvedValue([
      { id: REQUESTER, email: "hong@kfa.kr", username: "hong_gildong", nickname: "홍길동", role: "ADMIN", isDemo: false },
    ]);
    const result = await service.listUsers({}, false);
    expect(result[0]!.email).toBe("hong@kfa.kr");
    expect(result[0]!.username).toBe("hong_gildong");
  });

  test("isDemo=true이면 email/username 마스킹", async () => {
    mockRepo.listUsers.mockResolvedValue([
      { id: REQUESTER, email: "hong@kfa.kr", username: "hong_gildong", nickname: "홍길동", role: "ADMIN", isDemo: false },
    ]);
    const result = await service.listUsers({}, true);
    expect(result[0]!.email).toBe("ho***@kfa.kr");
    expect(result[0]!.username).toBe("hon***");
  });
});

describe("AdminService - getUserById (isDemo masking)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("isDemo=true이면 단건 조회도 마스킹", async () => {
    mockRepo.findById.mockResolvedValue({ id: REQUESTER, email: "abc@test.com", username: "abcdef", nickname: "테스트", role: "ADMIN" });
    const result = await service.getUserById(REQUESTER, true);
    expect(result.email).toBe("a***@test.com");
    expect(result.username).toBe("abc***");
  });
});

describe("AdminService - getAuditLogs (isDemo masking)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("isDemo=true이면 actor.username 마스킹", async () => {
    mockRepo.listAuditLogs.mockResolvedValue([
      { id: 1, action: "ROLE_UPDATE", targetId: 2, detail: {}, createdAt: new Date(),
        actor: { id: REQUESTER, username: "hong_gildong", nickname: "홍길동", role: "ADMIN" } },
    ]);
    mockRepo.countAuditLogs.mockResolvedValue(1);
    const { logs } = await service.getAuditLogs({}, true);
    expect(logs[0]!.actor.username).toBe("hon***");
  });

  test("isDemo=false이면 actor.username 원본", async () => {
    mockRepo.listAuditLogs.mockResolvedValue([
      { id: 1, action: "ROLE_UPDATE", targetId: 2, detail: {}, createdAt: new Date(),
        actor: { id: REQUESTER, username: "hong_gildong", nickname: "홍길동", role: "ADMIN" } },
    ]);
    mockRepo.countAuditLogs.mockResolvedValue(1);
    const { logs } = await service.getAuditLogs({}, false);
    expect(logs[0]!.actor.username).toBe("hong_gildong");
  });
});

describe("AdminService - setDemoStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  test("자기 자신에게는 설정 불가 → 403", async () => {
    await expect(service.setDemoStatus(REQUESTER, { isDemo: true }, REQUESTER)).rejects.toMatchObject({
      statusCode: 403,
      code: "CANNOT_MODIFY_SELF",
    });
  });

  test("대상 유저 없으면 404", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.setDemoStatus(USER_2, { isDemo: true }, REQUESTER)).rejects.toMatchObject({
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  });

  test("isDemo 설정 성공", async () => {
    mockRepo.findById.mockResolvedValue({ id: USER_2, isDemo: false });
    mockRepo.setDemo.mockResolvedValue({ id: USER_2, isDemo: true });
    const result = await service.setDemoStatus(USER_2, { isDemo: true }, REQUESTER);
    expect(mockRepo.setDemo).toHaveBeenCalledWith(USER_2, true);
    expect(result.isDemo).toBe(true);
  });
});
