import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { InjuryController } from "../../src/injury/injury.controller";

const mockService = {
  getByPlayer: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getById: jest.fn(),
  createInjury: jest.fn(),
  updateStatus: jest.fn(),
  getStats: jest
    .fn<() => Promise<any>>()
    .mockResolvedValue({ activeCount: 3, byBodyPart: {}, byCause: {}, avgRecoveryDays: 14 }),
  getActive: jest.fn<() => Promise<any[]>>().mockResolvedValue([
    { playerId: 'player-1', status: 'REHABILITATING' },
  ]),
} as any;

const controller = new InjuryController(mockService);

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

describe("InjuryController - getStats (MEDICAL_DIRECTOR)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN can access injury stats → 200", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null } });
    const res = mockRes();
    await controller.getStats(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.getStats).toHaveBeenCalled();
  });

  test("MEDICAL_DIRECTOR can access injury stats → 200", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000002", role: "COACHING_STAFF", coachingRole: "MEDICAL_DIRECTOR", frontOfficeRole: null },
    });
    const res = mockRes();
    await controller.getStats(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.getStats).toHaveBeenCalled();
  });

  test("plain MEDICAL cannot access injury stats → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "COACHING_STAFF", coachingRole: "MEDICAL", frontOfficeRole: null },
    });
    const res = mockRes();
    await controller.getStats(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test("FRONT_OFFICE cannot access injury stats → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000004", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TACTICAL_ANALYST" },
    });
    const res = mockRes();
    await controller.getStats(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
  });
});

describe("InjuryController - getActive", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN can get active injuries → 200", async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getActive(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.getActive).toHaveBeenCalled();
  });

  test("returns active injury list", async () => {
    const req = mockReq({});
    const res = mockRes();
    await controller.getActive(req, res, mockNext);
    expect(res.json).toHaveBeenCalledWith([
      { playerId: 'player-1', status: 'REHABILITATING' },
    ]);
  });
});

describe("InjuryController - getByPlayer (TACTICAL_ANALYST 읽기 접근)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("TACTICAL_ANALYST (FRONT_OFFICE) can read injuries → 200", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000005", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TACTICAL_ANALYST" },
      params: { playerId: "player-uuid-1" },
    });
    const res = mockRes();
    await controller.getByPlayer(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.getByPlayer).toHaveBeenCalledWith("player-uuid-1");
  });
});
