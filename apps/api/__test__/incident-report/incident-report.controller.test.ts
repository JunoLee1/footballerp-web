import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { IncidentReportController } from "../../src/incident-report/incident-report.controller";

const report = { id: 1, playerId: "p1", teamId: 1, type: "MATCH", description: "test incident", status: "DRAFT" };

const mockService = {
  getAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([report]),
  getById: jest.fn<() => Promise<any>>().mockResolvedValue(report),
  create: jest.fn<() => Promise<any>>().mockResolvedValue(report),
  submit: jest.fn<() => Promise<any>>().mockResolvedValue({ ...report, status: "SUBMITTED" }),
  sign: jest.fn<() => Promise<any>>().mockResolvedValue({ ...report, status: "SIGNED" }),
} as any;

const controller = new IncidentReportController(mockService);

const user = {
  admin: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null },
  gm: { id: "00000000-0000-4000-8000-000000000002", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "GM" },
  headCoach: { id: "00000000-0000-4000-8000-000000000003", role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null },
  medical: { id: "00000000-0000-4000-8000-000000000004", role: "COACHING_STAFF", coachingRole: "MEDICAL", frontOfficeRole: null },
  medicalDirector: { id: "00000000-0000-4000-8000-000000000005", role: "COACHING_STAFF", coachingRole: "MEDICAL_DIRECTOR", frontOfficeRole: null },
  assistantCoach: { id: "00000000-0000-4000-8000-000000000006", role: "COACHING_STAFF", coachingRole: "ASSISTANT_COACH", frontOfficeRole: null },
  player: { id: "00000000-0000-4000-8000-000000000007", role: "PLAYER", coachingRole: null, frontOfficeRole: null },
  guardian: { id: "00000000-0000-4000-8000-000000000008", role: "GUARDIAN", coachingRole: null, frontOfficeRole: null },
};

const mockReq = (overrides: any) =>
  ({
    user: user.admin,
    body: {},
    params: { id: "1" },
    query: {},
    ...overrides,
  }) as any;

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const next = jest.fn() as any;
beforeEach(() => jest.clearAllMocks());

// ─── getAll / getById ─────────────────────────────────────────────────────────

describe("IncidentReportController - getAll", () => {
  test("ADMIN → 200", async () => {
    const res = mockRes();
    await controller.getAll(mockReq({ user: user.admin }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("COACHING_STAFF → 200", async () => {
    const res = mockRes();
    await controller.getAll(mockReq({ user: user.headCoach }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("FRONT_OFFICE → 200", async () => {
    const res = mockRes();
    await controller.getAll(mockReq({ user: user.gm }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("PLAYER → 403", async () => {
    const res = mockRes();
    await controller.getAll(mockReq({ user: user.player }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.json).not.toHaveBeenCalled();
  });

  test("GUARDIAN → 403", async () => {
    const res = mockRes();
    await controller.getAll(mockReq({ user: user.guardian }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

// ─── sign: role="MEDICAL" ─────────────────────────────────────────────────────

describe("IncidentReportController - sign (MEDICAL)", () => {
  const body = { role: "MEDICAL" };

  test("ADMIN can sign as MEDICAL → 200", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.admin, body }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("MEDICAL coachingRole can sign → 200", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.medical, body }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("MEDICAL_DIRECTOR coachingRole can sign → 200", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.medicalDirector, body }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("GM (FRONT_OFFICE) cannot sign as MEDICAL → 403", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.gm, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.json).not.toHaveBeenCalled();
  });

  test("HEAD_COACH cannot sign as MEDICAL → 403", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.headCoach, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("ASSISTANT_COACH cannot sign as MEDICAL → 403", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.assistantCoach, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

// ─── sign: role="SUPERVISOR" ──────────────────────────────────────────────────

describe("IncidentReportController - sign (SUPERVISOR)", () => {
  const body = { role: "SUPERVISOR" };

  test("ADMIN can sign as SUPERVISOR → 200", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.admin, body }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("HEAD_COACH can sign as SUPERVISOR → 200", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.headCoach, body }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("GM cannot sign as SUPERVISOR → 403", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.gm, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.json).not.toHaveBeenCalled();
  });

  test("MEDICAL cannot sign as SUPERVISOR → 403", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.medical, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("ASSISTANT_COACH cannot sign as SUPERVISOR → 403", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.assistantCoach, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

// ─── sign: invalid role body ──────────────────────────────────────────────────

describe("IncidentReportController - sign (invalid role)", () => {
  test("unknown role body → 400", async () => {
    const res = mockRes();
    await controller.sign(mockReq({ user: user.admin, body: { role: "ADMIN" } }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: "INVALID_ROLE" }));
  });
});
