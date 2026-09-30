import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TrainingService } from "../../src/training/training.service";
import { TrainingController } from "../../src/training/training.controller";

jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));

// ─── Service ────────────────────────────────────────────────────────────────

const makeRepo = (overrides: Record<string, unknown> = {}) => ({
  findById: jest.fn(),
  approve: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  addAllActivePlayers: jest.fn(),
  addContent: jest.fn(),
  addParticipants: jest.fn(),
  upsertResult: jest.fn(),
  countUnexcusedAttendance: jest.fn(),
  findPlayerUserId: jest.fn(),
  findPlayerNameById: jest.fn(),
  findByIdWithTeam: jest.fn(),
  findGuardiansByTeam: jest.fn(),
  cancelSession: jest.fn(),
  updateSession: jest.fn(),
  findResultById: jest.fn(),
  updateAttendance: jest.fn(),
  findResults: jest.fn(),
  ...overrides,
});

describe("TrainingService.getResultById", () => {
  test("결과가 있으면 반환한다", async () => {
    const result = { id: 1, sessionId: 10, playerId: "p1", attendance: "PRESENT", feedback: "good", performanceScore: 8 };
    const service = new TrainingService(makeRepo({ findResultById: jest.fn().mockResolvedValue(result) }) as any);
    expect(await service.getResultById(1)).toEqual(result);
  });

  test("결과가 없으면 404 RESULT_NOT_FOUND", async () => {
    const service = new TrainingService(makeRepo({ findResultById: jest.fn().mockResolvedValue(null) }) as any);
    await expect(service.getResultById(99)).rejects.toMatchObject({ statusCode: 404, code: "RESULT_NOT_FOUND" });
  });
});

// ─── Controller ─────────────────────────────────────────────────────────────

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};
const mockNext = jest.fn() as any;

const makeService = (overrides: Record<string, unknown> = {}) => ({
  getSessions: jest.fn(),
  getSessionById: jest.fn(),
  createSession: jest.fn(),
  approveSession: jest.fn(),
  addContent: jest.fn(),
  addParticipants: jest.fn(),
  upsertResult: jest.fn(),
  getResults: jest.fn(),
  getResultById: jest.fn(),
  correctAttendance: jest.fn(),
  ...overrides,
});

describe("TrainingController.getResultById", () => {
  beforeEach(() => jest.clearAllMocks());

  test("존재하는 resultId → 200 + 결과 반환", async () => {
    const result = { id: 5, sessionId: 10, playerId: "p1", attendance: "PRESENT", feedback: null, performanceScore: 7 };
    const service = makeService({ getResultById: jest.fn().mockResolvedValue(result) });
    const controller = new TrainingController(service as any);
    const req: any = { user: { id: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF" }, params: { resultId: "5" }, body: {}, query: {} };
    const res = mockRes();
    await controller.getResultById(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
  });

  test("없는 resultId → next(err) 호출", async () => {
    const err = { statusCode: 404, code: "RESULT_NOT_FOUND" };
    const service = makeService({ getResultById: jest.fn().mockRejectedValue(err) });
    const controller = new TrainingController(service as any);
    const req: any = { user: { id: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF" }, params: { resultId: "99" }, body: {}, query: {} };
    const res = mockRes();
    await controller.getResultById(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(err);
  });
});
