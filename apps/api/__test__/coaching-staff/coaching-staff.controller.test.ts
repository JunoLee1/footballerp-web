import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { CoachingStaffController } from "../../src/coaching-staff/coaching-staff.controller";
import { CoachingStaffEvalRepository } from "../../src/coaching-staff/coaching-staff-eval.repo";

const mockService = {
  getAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
} as any;

const mockEvalRepo = {
  listForStaff: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  create: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, score: 4 }),
} as any;

const controller = new CoachingStaffController(mockService, mockEvalRepo);

// PR #108 이후 역할 구조
const user = {
  admin:     { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN",         coachingRole: null,            frontOfficeRole: null },
  gm:        { id: "00000000-0000-4000-8000-000000000002", role: "GM",            coachingRole: null,            frontOfficeRole: null },
  headCoach: { id: "00000000-0000-4000-8000-000000000003", role: "COACHING_STAFF", coachingRole: "HEAD_COACH",   frontOfficeRole: null },
  assiCoach: { id: "00000000-0000-4000-8000-000000000004", role: "COACHING_STAFF", coachingRole: "ASSISTANT_COACH", frontOfficeRole: null },
  frontOffice:{ id: "00000000-0000-4000-8000-000000000005", role: "FRONT_OFFICE", coachingRole: null,            frontOfficeRole: null },
  player:    { id: "00000000-0000-4000-8000-000000000006", role: "PLAYER",        coachingRole: null,            frontOfficeRole: null },
};

const mockReq = (overrides: any) =>
  ({ user: user.admin, body: {}, params: { staffUserId: "3" }, query: {}, ...overrides }) as any;

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
};

const next = jest.fn() as any;

beforeEach(() => { jest.clearAllMocks(); });

// ─── list (isAdminLike | GM | COACHING_STAFF+HEAD_COACH) ─────────────────────

describe("list", () => {
  test("ADMIN → 200",             async () => { const res = mockRes(); await controller.list(mockReq({ user: user.admin }),      res, next); expect(res.json).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); });
  test("GM → 200",                async () => { const res = mockRes(); await controller.list(mockReq({ user: user.gm }),        res, next); expect(res.json).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); });
  test("HEAD_COACH → 200",        async () => { const res = mockRes(); await controller.list(mockReq({ user: user.headCoach }), res, next); expect(res.json).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); });
  test("ASSISTANT_COACH → 403",   async () => { const res = mockRes(); await controller.list(mockReq({ user: user.assiCoach }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("FRONT_OFFICE → 403",      async () => { const res = mockRes(); await controller.list(mockReq({ user: user.frontOffice }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("PLAYER → 403",            async () => { const res = mockRes(); await controller.list(mockReq({ user: user.player }),   res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
});

// ─── listEvaluations (isAdminLike | COACHING_STAFF) ──────────────────────────

describe("listEvaluations", () => {
  test("ADMIN → 200",          async () => { const res = mockRes(); await controller.listEvaluations(mockReq({ user: user.admin }),      res, next); expect(res.json).toHaveBeenCalled(); });
  test("HEAD_COACH → 200",     async () => { const res = mockRes(); await controller.listEvaluations(mockReq({ user: user.headCoach }), res, next); expect(res.json).toHaveBeenCalled(); });
  test("ASSISTANT_COACH → 200",async () => { const res = mockRes(); await controller.listEvaluations(mockReq({ user: user.assiCoach }), res, next); expect(res.json).toHaveBeenCalled(); });
  test("FRONT_OFFICE → 403",   async () => { const res = mockRes(); await controller.listEvaluations(mockReq({ user: user.frontOffice }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("PLAYER → 403",         async () => { const res = mockRes(); await controller.listEvaluations(mockReq({ user: user.player }),   res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
});

// ─── createEvaluation (isAdminLike | COACHING_STAFF+HEAD_COACH) ──────────────

describe("createEvaluation", () => {
  const body = { score: 4, comment: "성실함" };
  test("ADMIN → 201",          async () => { const res = mockRes(); await controller.createEvaluation(mockReq({ user: user.admin, body }),      res, next); expect(res.status).toHaveBeenCalledWith(201); expect(next).not.toHaveBeenCalled(); });
  test("HEAD_COACH → 201",     async () => { const res = mockRes(); await controller.createEvaluation(mockReq({ user: user.headCoach, body }), res, next); expect(res.status).toHaveBeenCalledWith(201); expect(next).not.toHaveBeenCalled(); });
  test("ASSISTANT_COACH → 403",async () => { const res = mockRes(); await controller.createEvaluation(mockReq({ user: user.assiCoach, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("FRONT_OFFICE → 403",   async () => { const res = mockRes(); await controller.createEvaluation(mockReq({ user: user.frontOffice, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("PLAYER → 403",         async () => { const res = mockRes(); await controller.createEvaluation(mockReq({ user: user.player, body }),   res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
});
