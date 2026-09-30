import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { AdminController } from "../../src/admin/admin.controller";

jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));

const mockService = {
  listUsers: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getUserById: jest.fn(),
  updateUserRole: jest.fn(),
  deactivateUser: jest.fn(),
  reactivateUser: jest.fn(),
  deleteUser: jest.fn(),
  setDemoStatus: jest.fn(),
  getPlayersWithoutAccounts: jest.fn(),
  getAuditLogs: jest.fn(),
} as any;

const controller = new AdminController(mockService);

const adminReq = (overrides: any = {}) =>
  ({
    user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null },
    body: {},
    params: {},
    query: {},
    ...overrides,
  }) as any;

const nonAdminReq = (role: string) =>
  ({
    user: { id: "00000000-0000-4000-8000-000000000002", role, coachingRole: null, frontOfficeRole: null },
    body: {},
    params: {},
    query: {},
  }) as any;

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
};

const next = jest.fn() as any;

describe("AdminController - listUsers", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN gets 200 with list", async () => {
    const res = mockRes();
    mockService.listUsers.mockResolvedValue([{ id: 2 }]);
    await controller.listUsers(adminReq({ query: { role: "COACHING_STAFF" } }), res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("COACHING_STAFF gets 403", async () => {
    const res = mockRes();
    await controller.listUsers(nonAdminReq("COACHING_STAFF"), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("FRONT_OFFICE gets 403", async () => {
    const res = mockRes();
    await controller.listUsers(nonAdminReq("FRONT_OFFICE"), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

describe("AdminController - getUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN gets 200 with user", async () => {
    mockService.getUserById.mockResolvedValue({ id: 2 });
    const res = mockRes();
    await controller.getUser(adminReq({ params: { id: "2" } }), res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("non-ADMIN gets 403", async () => {
    const res = mockRes();
    await controller.getUser(nonAdminReq("PLAYER"), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

describe("AdminController - updateRole", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN gets 200", async () => {
    mockService.updateUserRole.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", role: "FRONT_OFFICE" });
    const res = mockRes();
    await controller.updateRole(adminReq({ params: { id: "2" }, body: { role: "FRONT_OFFICE" } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("non-ADMIN gets 403", async () => {
    const res = mockRes();
    await controller.updateRole(nonAdminReq("COACHING_STAFF"), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

describe("AdminController - deactivateUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN gets 200", async () => {
    mockService.deactivateUser.mockResolvedValue({ id: 2, isDeleted: true });
    const res = mockRes();
    await controller.deactivateUser(adminReq({ params: { id: "2" } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("non-ADMIN gets 403", async () => {
    const res = mockRes();
    await controller.deactivateUser(nonAdminReq("FRONT_OFFICE"), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

describe("AdminController - reactivateUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN gets 200", async () => {
    mockService.reactivateUser.mockResolvedValue({ id: 2, isDeleted: false });
    const res = mockRes();
    await controller.reactivateUser(adminReq({ params: { id: "2" } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("non-ADMIN gets 403", async () => {
    const res = mockRes();
    await controller.reactivateUser(nonAdminReq("COACHING_STAFF"), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

describe("AdminController - deleteUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("SUPER_ADMIN gets 204", async () => {
    mockService.deleteUser.mockResolvedValue(undefined);
    const res = mockRes();
    const req = { user: { id: "00000000-0000-4000-8000-000000000001", role: "SUPER_ADMIN", coachingRole: null, frontOfficeRole: null }, body: {}, params: { id: "2" }, query: {} } as any;
    await controller.deleteUser(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  test("ADMIN gets 403", async () => {
    const res = mockRes();
    await controller.deleteUser(adminReq({ params: { id: "2" } }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("non-ADMIN gets 403", async () => {
    const res = mockRes();
    await controller.deleteUser(nonAdminReq("PLAYER"), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});
