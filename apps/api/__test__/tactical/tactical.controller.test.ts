import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TacticalController } from "../../src/tactical/tactical.controller";

const mockService = {
  getByMatch: jest.fn(),
  getById: jest.fn(),
  list: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
  createAnalysis: jest.fn<() => Promise<{ id: number }>>().mockResolvedValue({ id: 1 }),
  updateAnalysis: jest.fn<() => Promise<{ id: number }>>().mockResolvedValue({ id: 1 }),
  addLineup: jest.fn(),
  addMedia: jest.fn(),
  confirmAnalysis: jest
    .fn<() => Promise<{ id: number; status: string }>>()
    .mockResolvedValue({ id: 1, status: "CONFIRMED" }),
} as any;

const controller = new TacticalController(mockService);

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

describe("TacticalController - create (TACTICAL_ANALYST)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN can create TacticalAnalysis → 201", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null } });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createAnalysis).toHaveBeenCalled();
  });

  test("COACHING_STAFF can create TacticalAnalysis → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000002", role: "COACHING_STAFF", coachingRole: "DEFENSIVE_COACH", frontOfficeRole: null },
    });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("TACTICAL_ANALYST (FRONT_OFFICE) can create TacticalAnalysis → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TACTICAL_ANALYST" },
    });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createAnalysis).toHaveBeenCalled();
  });

  test("GM (FRONT_OFFICE, non-analyst) cannot create TacticalAnalysis → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000004", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "GM" },
    });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test("PLAYER cannot create TacticalAnalysis → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000005", role: "PLAYER", coachingRole: null, frontOfficeRole: null },
    });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
  });
});

describe("TacticalController - update", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN can update TacticalAnalysis → 200", async () => {
    const req = mockReq({
      params: { id: "1" },
      body: { formation: "4-3-3", opponentKeyThreat: "High press" },
    });
    const res = mockRes();
    await controller.update(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.updateAnalysis).toHaveBeenCalledWith(1, {
      formation: "4-3-3",
      opponentKeyThreat: "High press",
    });
  });

  test("PLAYER cannot update TacticalAnalysis → 403 via next", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000005", role: "PLAYER", coachingRole: null, frontOfficeRole: null },
      params: { id: "1" },
      body: {},
    });
    const res = mockRes();
    await controller.update(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test("TACTICAL_ANALYST can update TacticalAnalysis → 200", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000006", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TACTICAL_ANALYST" },
      params: { id: "2" },
      body: { concededAnalysis: "압박 부족" },
    });
    const res = mockRes();
    await controller.update(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("TacticalController - confirm", () => {
  beforeEach(() => jest.clearAllMocks());

  test("HEAD_COACH can confirm TacticalAnalysis → 200", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null },
      params: { id: "1" },
    });
    const res = mockRes();
    await controller.confirm(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.confirmAnalysis).toHaveBeenCalledWith(1);
  });

  test("ADMIN can confirm TacticalAnalysis → 200", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000002", role: "ADMIN", coachingRole: null, frontOfficeRole: null },
      params: { id: "1" },
    });
    const res = mockRes();
    await controller.confirm(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("TACTICAL_ANALYST cannot confirm TacticalAnalysis → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TACTICAL_ANALYST" },
      params: { id: "1" },
    });
    const res = mockRes();
    await controller.confirm(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test("DEFENSIVE_COACH cannot confirm TacticalAnalysis → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000004", role: "COACHING_STAFF", coachingRole: "DEFENSIVE_COACH", frontOfficeRole: null },
      params: { id: "1" },
    });
    const res = mockRes();
    await controller.confirm(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
  });
});
