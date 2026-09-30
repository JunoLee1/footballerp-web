import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TransferController } from "../../src/transfer/transfer.controller";

const mockService = {
  getByPlayer: jest.fn(),
  getById: jest.fn(),
  createTransfer: jest.fn<() => Promise<{ id: number }>>().mockResolvedValue({ id: 1 }),
  getRecalls: jest.fn(),
  createRecall: jest.fn(),
  updateRecallStatus: jest.fn(),
} as any;

const controller = new TransferController(mockService);

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

describe("TransferController - createTransfer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("ADMIN can create Transfer → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null },
      body: { type: "PERMANENT" },
    });
    const res = mockRes();
    await controller.createTransfer(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createTransfer).toHaveBeenCalled();
  });

  test("TD (FRONT_OFFICE) can create Transfer → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000002", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TD" },
      body: { type: "LOAN_OUT" },
    });
    const res = mockRes();
    await controller.createTransfer(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createTransfer).toHaveBeenCalled();
  });

  test("CONTRACT_MANAGER can create Transfer → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "CONTRACT_MANAGER" },
      body: { type: "FREE" },
    });
    const res = mockRes();
    await controller.createTransfer(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createTransfer).toHaveBeenCalled();
  });

  test("GM can create Transfer → 201", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000004", role: "GM", coachingRole: null, frontOfficeRole: null },
      body: { type: "PERMANENT" },
    });
    const res = mockRes();
    await controller.createTransfer(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createTransfer).toHaveBeenCalled();
  });

  test("SCOUT (FRONT_OFFICE) cannot create Transfer → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000005", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "SCOUT" },
      body: { type: "PERMANENT" },
    });
    const res = mockRes();
    await controller.createTransfer(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test("TACTICAL_ANALYST (FRONT_OFFICE) cannot create Transfer → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000006", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TACTICAL_ANALYST" },
      body: { type: "PERMANENT" },
    });
    const res = mockRes();
    await controller.createTransfer(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  test("COACHING_STAFF cannot create Transfer → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000007", role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null },
      body: { type: "PERMANENT" },
    });
    const res = mockRes();
    await controller.createTransfer(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});
