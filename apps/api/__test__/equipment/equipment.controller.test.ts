import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { EquipmentController } from "../../src/equipment/equipment.controller";

const mockService = {
  getAllItems: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getItemById: jest.fn(),
  createItem: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  adjustQuantity: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, quantity: 10 }),
  addUnit: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, status: "AVAILABLE" }),
  transitionUnitStatus: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, status: "IN_USE" }),
  createAssignment: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  getUnreturnedByPlayer: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  returnAssignment: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
} as any;

const controller = new EquipmentController(mockService);

const mockReq = (overrides: any) => {
  const base = { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null, clubId: 1 } as any;
  const merged = overrides.user
    ? { ...overrides, user: { clubId: 1, ...overrides.user } }
    : { user: base, ...overrides };
  return ({
    body: {},
    params: {},
    query: {},
    ...merged,
  }) as any;
};

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const mockNext = jest.fn() as any;

describe("EquipmentController - createItem (write permission)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN can create item → 201", async () => {
    const req = mockReq({ body: { name: "Ball", category: "BALL_AND_TOOLS", trackedIndividually: false, quantity: 20 } });
    const res = mockRes();
    await controller.createItem(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createItem).toHaveBeenCalled();
  });

  test("EQUIPMENT_MANAGER can create item → 201", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000002", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "EQUIPMENT_MANAGER" }, body: { name: "GPS Vest", category: "TACTICAL", trackedIndividually: true } });
    const res = mockRes();
    await controller.createItem(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockService.createItem).toHaveBeenCalled();
  });

  test("GM can create item → 201", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000003", role: "GM", coachingRole: null, frontOfficeRole: null }, body: { name: "Ball", category: "BALL_AND_TOOLS", trackedIndividually: false } });
    const res = mockRes();
    await controller.createItem(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("SCOUT cannot create item → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000004", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "SCOUT" } });
    const res = mockRes();
    await controller.createItem(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });

  test("COACHING_STAFF (HEAD_COACH) cannot create item → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000005", role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null } });
    const res = mockRes();
    await controller.createItem(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });

  test("PLAYER cannot create item → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000006", role: "PLAYER", coachingRole: null, frontOfficeRole: null } });
    const res = mockRes();
    await controller.createItem(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("EquipmentController - listItems (read permission)", () => {
  beforeEach(() => jest.clearAllMocks());

  test("FRONT_OFFICE (TD) can list items → 200", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000007", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TD" } });
    const res = mockRes();
    await controller.listItems(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("COACHING_STAFF can list items → 200", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000008", role: "COACHING_STAFF", coachingRole: "ASSISTANT_COACH", frontOfficeRole: null } });
    const res = mockRes();
    await controller.listItems(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("PLAYER cannot list items → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000009", role: "PLAYER", coachingRole: null, frontOfficeRole: null } });
    const res = mockRes();
    await controller.listItems(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });

  test("AGENT cannot list items → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000010", role: "AGENT", coachingRole: null, frontOfficeRole: null } });
    const res = mockRes();
    await controller.listItems(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
    expect(res.status).not.toHaveBeenCalled();
  });
});
