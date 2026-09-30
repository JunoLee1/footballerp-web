import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TrainingReferenceController } from "../../src/training-reference/training-reference.controller";

const mockService = {
  list: jest.fn(),
  create: jest.fn<() => Promise<{ id: number }>>().mockResolvedValue({ id: 1 }),
  delete: jest.fn(),
  getRecommendations: jest.fn(),
} as any;

const controller = new TrainingReferenceController(mockService);

const mockReq = (overrides: any) =>
  ({
    user: { id: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null },
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

describe("TrainingReferenceController - list", () => {
  beforeEach(() => jest.clearAllMocks());

  test("COACHING_STAFF can list → 200", async () => {
    mockService.list.mockResolvedValue([]);
    const req = mockReq({ query: { sessionType: "PHYSICAL" } });
    const res = mockRes();
    await controller.list(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("PLAYER role is forbidden → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000002", role: "PLAYER" }, query: {} });
    const res = mockRes();
    await controller.list(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

describe("TrainingReferenceController - create", () => {
  beforeEach(() => jest.clearAllMocks());

  test("COACHING_STAFF can create → 201", async () => {
    const req = mockReq({
      body: { sessionType: "PHYSICAL", title: "Test", url: "http://x.com", source: "EXTERNAL", tags: ["압박"] },
    });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("FRONT_OFFICE role is forbidden → 403", async () => {
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000002", role: "FRONT_OFFICE", frontOfficeRole: "GM" }, body: {} });
    const res = mockRes();
    await controller.create(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
