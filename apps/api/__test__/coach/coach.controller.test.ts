import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { CoachController } from "../../src/coach/coach.controller";

const mockService = {
  getAllRounds:      jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  createRound:      jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  updateRoundStatus:jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  getAll:           jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getById:          jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, name: "김코치" }),
  create:           jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, name: "김코치" }),
  update:           jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  updateStatus:     jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  upsertEvaluation: jest.fn<() => Promise<any>>().mockResolvedValue({}),
  getTutors:        jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  createTutor:      jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  updateTutor:      jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
} as any;

const controller = new CoachController(mockService);

// PR #108 이후 역할 구조
const user = {
  admin:      { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN",          coachingRole: null, frontOfficeRole: null },
  superAdmin: { id: "00000000-0000-4000-8000-000000000002", role: "SUPER_ADMIN",     coachingRole: null, frontOfficeRole: null },
  gm:         { id: "00000000-0000-4000-8000-000000000003", role: "GM",              coachingRole: null, frontOfficeRole: null },
  td:         { id: "00000000-0000-4000-8000-000000000004", role: "FRONT_OFFICE",    coachingRole: null, frontOfficeRole: "TD" },
  hr:         { id: "00000000-0000-4000-8000-000000000005", role: "FRONT_OFFICE",    coachingRole: null, frontOfficeRole: "HR_MANAGER" },
  coaching:   { id: "00000000-0000-4000-8000-000000000006", role: "COACHING_STAFF",  coachingRole: "HEAD_COACH", frontOfficeRole: null },
  player:     { id: "00000000-0000-4000-8000-000000000007", role: "PLAYER",          coachingRole: null, frontOfficeRole: null },
};

const mockReq = (overrides: any) =>
  ({ user: user.admin, body: {}, params: { id: "1" }, query: {}, ...overrides }) as any;

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
};

const next = jest.fn() as any;

beforeEach(() => { jest.clearAllMocks(); });

// ─── READ (canRead = isAdminLike | GM | FRONT_OFFICE+TD) ─────────────────────

describe("list", () => {
  test("ADMIN → 200",      async () => { const res = mockRes(); await controller.list(mockReq({ user: user.admin }),   res, next); expect(res.json).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); });
  test("GM → 200",         async () => { const res = mockRes(); await controller.list(mockReq({ user: user.gm }),     res, next); expect(res.json).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); });
  test("TD → 200",         async () => { const res = mockRes(); await controller.list(mockReq({ user: user.td }),     res, next); expect(res.json).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); });
  test("HR_MANAGER → 403", async () => { const res = mockRes(); await controller.list(mockReq({ user: user.hr }),     res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("COACHING_STAFF → 403", async () => { const res = mockRes(); await controller.list(mockReq({ user: user.coaching }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("PLAYER → 403",     async () => { const res = mockRes(); await controller.list(mockReq({ user: user.player }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
});

describe("getById", () => {
  test("ADMIN → 200",      async () => { const res = mockRes(); await controller.getById(mockReq({ user: user.admin }), res, next); expect(res.json).toHaveBeenCalled(); });
  test("GM → 200",         async () => { const res = mockRes(); await controller.getById(mockReq({ user: user.gm }),   res, next); expect(res.json).toHaveBeenCalled(); });
  test("TD → 200",         async () => { const res = mockRes(); await controller.getById(mockReq({ user: user.td }),   res, next); expect(res.json).toHaveBeenCalled(); });
  test("PLAYER → 403",     async () => { const res = mockRes(); await controller.getById(mockReq({ user: user.player }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
});

// ─── HiringRound (canApprove = GM only) ──────────────────────────────────────

describe("listRounds", () => {
  test("GM → 200",     async () => { const res = mockRes(); await controller.listRounds(mockReq({ user: user.gm }),    res, next); expect(res.json).toHaveBeenCalled(); });
  test("ADMIN → 200",  async () => { const res = mockRes(); await controller.listRounds(mockReq({ user: user.admin }), res, next); expect(res.json).toHaveBeenCalled(); });
  test("PLAYER → 403", async () => { const res = mockRes(); await controller.listRounds(mockReq({ user: user.player }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 })); });
});

describe("createRound", () => {
  const body = { targetRole: "HEAD_COACH" };
  test("GM → 201",     async () => { const res = mockRes(); await controller.createRound(mockReq({ user: user.gm, body }), res, next); expect(res.status).toHaveBeenCalledWith(201); expect(next).not.toHaveBeenCalled(); });
  test("ADMIN → 403",  async () => { const res = mockRes(); await controller.createRound(mockReq({ user: user.admin, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 })); });
  test("TD → 403",     async () => { const res = mockRes(); await controller.createRound(mockReq({ user: user.td, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 })); });
});

describe("updateRoundStatus", () => {
  const body = { status: "CLOSED" };
  test("GM → 200",     async () => { const res = mockRes(); await controller.updateRoundStatus(mockReq({ user: user.gm, body }), res, next); expect(res.json).toHaveBeenCalled(); });
  test("TD → 403",     async () => { const res = mockRes(); await controller.updateRoundStatus(mockReq({ user: user.td, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 })); });
});

// ─── WRITE (canWrite = GM | FRONT_OFFICE+TD) ─────────────────────────────────

describe("create", () => {
  const body = { name: "김코치", coachingRole: "HEAD_COACH" };

  test("GM → 201",      async () => { const res = mockRes(); await controller.create(mockReq({ user: user.gm, body }), res, next); expect(res.status).toHaveBeenCalledWith(201); expect(next).not.toHaveBeenCalled(); });
  test("TD → 201",      async () => { const res = mockRes(); await controller.create(mockReq({ user: user.td, body }), res, next); expect(res.status).toHaveBeenCalledWith(201); expect(next).not.toHaveBeenCalled(); });
  test("ADMIN → 403",   async () => { const res = mockRes(); await controller.create(mockReq({ user: user.admin, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("PLAYER → 403",  async () => { const res = mockRes(); await controller.create(mockReq({ user: user.player, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });

  test("빈 name → 400",         async () => { const res = mockRes(); await controller.create(mockReq({ user: user.gm, body: { name: "  ", coachingRole: "HEAD_COACH" } }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: "NAME_REQUIRED" })); });
  test("name 비문자열 → 400",   async () => { const res = mockRes(); await controller.create(mockReq({ user: user.gm, body: { name: 123, coachingRole: "HEAD_COACH" } }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: "NAME_REQUIRED" })); });
  test("coachingRole 없음 → 400", async () => { const res = mockRes(); await controller.create(mockReq({ user: user.gm, body: { name: "김코치" } }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: "COACHING_ROLE_REQUIRED" })); });
});

describe("update", () => {
  const body = { name: "박코치" };
  test("GM → 200",     async () => { const res = mockRes(); await controller.update(mockReq({ user: user.gm, body }), res, next); expect(res.json).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); });
  test("TD → 200",     async () => { const res = mockRes(); await controller.update(mockReq({ user: user.td, body }), res, next); expect(res.json).toHaveBeenCalled(); expect(next).not.toHaveBeenCalled(); });
  test("ADMIN → 403",  async () => { const res = mockRes(); await controller.update(mockReq({ user: user.admin, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
  test("PLAYER → 403", async () => { const res = mockRes(); await controller.update(mockReq({ user: user.player, body }), res, next); expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" })); });
});
