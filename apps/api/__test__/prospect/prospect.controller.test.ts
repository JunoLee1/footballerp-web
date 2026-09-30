import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { ProspectController } from "../../src/prospect/prospect.controller";

const mockService = {
  getAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getById: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, name: "Test", status: "ACTIVE" }),
  create: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  update: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  updateStatus: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, status: "ARCHIVED" }),
} as any;

const controller = new ProspectController(mockService);

const mockReq = (overrides: any) =>
  ({
    user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null },
    body: {},
    params: {},
    query: {},
    ...overrides,
  }) as any;

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const mockNext = jest.fn() as any;

describe("ProspectController - create (write permission)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN can create prospect → 201", async () => {
    const req = mockReq({ body: { name: "Test", nationalityId: 1, position: "STRIKER", currentTeam: "FC Lyon" } });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.create).toHaveBeenCalled();
  });

  test("SCOUT can create prospect → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000002", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "SCOUT" },
      body: { name: "Test", nationalityId: 1, position: "STRIKER", currentTeam: "FC Lyon" },
    });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.create).toHaveBeenCalled();
  });

  test("GM can create prospect → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "GM", coachingRole: null, frontOfficeRole: null },
      body: { name: "Test", nationalityId: 1, position: "STRIKER", currentTeam: "FC Lyon" },
    });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("TD cannot create prospect → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000004", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TD" } });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });

  test("CONTRACT_MANAGER cannot create prospect → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000005", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "CONTRACT_MANAGER" } });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });

  test("ASSISTANT_COACH (COACHING_STAFF) cannot create → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000006", role: "COACHING_STAFF", coachingRole: "ASSISTANT_COACH", frontOfficeRole: null } });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("ProspectController - list (read permission)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FRONT_OFFICE (TD) can list prospects → 200", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000007", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TD" }, query: {} });
    const res = mockRes();
    await controller.list(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("HEAD_COACH can list prospects → 200", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000008", role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null }, query: {} });
    const res = mockRes();
    await controller.list(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("ASSISTANT_COACH cannot list prospects → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000009", role: "COACHING_STAFF", coachingRole: "ASSISTANT_COACH", frontOfficeRole: null }, query: {} });
    const res = mockRes();
    await controller.list(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });

  test("PLAYER cannot list prospects → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000010", role: "PLAYER", coachingRole: null, frontOfficeRole: null }, query: {} });
    const res = mockRes();
    await controller.list(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });
});
