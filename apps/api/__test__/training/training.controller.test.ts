import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TrainingController } from "../../src/training/training.controller";

const mockService = {
  getSessions: jest.fn(),
  getSessionById: jest.fn(),
  createSession: jest.fn<() => Promise<{ id: number }>>().mockResolvedValue({ id: 1 }),
  approveSession: jest.fn(),
  addContent: jest.fn(),
  addParticipants: jest.fn(),
  upsertResult: jest.fn(),
} as any;

const controller = new TrainingController(mockService);

const mockReq = (overrides: any) =>
  ({
    user: { id: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF", coachingRole: "GOALKEEPER_COACH", frontOfficeRole: null },
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

describe("TrainingController - createSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GOALKEEPER_COACH can create GOALKEEPER session → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF", coachingRole: "GOALKEEPER_COACH", frontOfficeRole: null },
      body: { sessionType: "GOALKEEPER" },
    });
    const res = mockRes();
    await controller.createSession(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createSession).toHaveBeenCalled();
  });

  test("ADMIN can create GOALKEEPER session → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null },
      body: { sessionType: "GOALKEEPER" },
    });
    const res = mockRes();
    await controller.createSession(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createSession).toHaveBeenCalled();
  });

  test("DEFENSIVE_COACH (non-GK) cannot create GOALKEEPER session → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000002", role: "COACHING_STAFF", coachingRole: "DEFENSIVE_COACH", frontOfficeRole: null },
      body: { sessionType: "GOALKEEPER" },
    });
    const res = mockRes();
    await controller.createSession(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test("COACHING_STAFF can create non-GOALKEEPER session → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF", coachingRole: "DEFENSIVE_COACH", frontOfficeRole: null },
      body: { sessionType: "TACTICAL_DEFENSIVE" },
    });
    const res = mockRes();
    await controller.createSession(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("PLAYER cannot create any session → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "PLAYER", coachingRole: null, frontOfficeRole: null },
      body: { sessionType: "PHYSICAL" },
    });
    const res = mockRes();
    await controller.createSession(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
  });
});

describe("TrainingController - approveSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockService.approveSession.mockResolvedValue({ id: 1, isApproved: true });
  });

  test("ADMIN can approve session → 200", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null },
      params: { id: "1" },
    });
    const res = mockRes();
    await controller.approveSession(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.approveSession).toHaveBeenCalled();
  });

  test("HEAD_COACH can approve session → 200", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000002", role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null },
      params: { id: "1" },
    });
    const res = mockRes();
    await controller.approveSession(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.approveSession).toHaveBeenCalled();
  });

  test("GOALKEEPER_COACH cannot approve session → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "COACHING_STAFF", coachingRole: "GOALKEEPER_COACH", frontOfficeRole: null },
      params: { id: "1" },
    });
    const res = mockRes();
    await controller.approveSession(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
