import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { DepartmentController } from "../../src/department/department.controller";

// 최상위 부서 (팀의 부모)
const deptRecord = {
  id: 1, name: "자산관리", parentId: null, isActive: true, children: [], parent: null,
};

// 팀(하위 노드): parentId 있음
const teamRecord = {
  id: 2, name: "1팀", parentId: 1, isActive: true, children: [],
  parent: { id: 1, name: "자산관리", parentId: null, isActive: true },
};

const mockService = {
  list: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  get: jest.fn<(id: number) => Promise<any>>(),
  create: jest.fn<() => Promise<any>>().mockResolvedValue(teamRecord),
  update: jest.fn<() => Promise<any>>().mockResolvedValue(teamRecord),
  delete: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
  isHead: jest.fn<(deptId: number, userId: number) => Promise<boolean>>().mockResolvedValue(false),
  listJobTitles: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  createJobTitle: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, label: "과장" }),
  updateJobTitle: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, label: "대리" }),
  deleteJobTitle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  updateMemberJobTitle: jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true }),
} as any;

const controller = new DepartmentController(mockService);

const user = {
  admin:       { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN",         coachingRole: null, frontOfficeRole: null },
  gm:          { id: "00000000-0000-4000-8000-000000000002", role: "GM",             coachingRole: null, frontOfficeRole: null },
  frontOffice: { id: "00000000-0000-4000-8000-000000000003", role: "FRONT_OFFICE",   coachingRole: null, frontOfficeRole: null },
  deptHead:    { id: "00000000-0000-4000-8000-000000000004", role: "FRONT_OFFICE",   coachingRole: null, frontOfficeRole: null },
  coaching:    { id: "00000000-0000-4000-8000-000000000005", role: "COACHING_STAFF", coachingRole: null, frontOfficeRole: null },
  player:      { id: "00000000-0000-4000-8000-000000000006", role: "PLAYER",         coachingRole: null, frontOfficeRole: null },
};

const mockReq = (overrides: any) =>
  ({ user: user.admin, body: {}, params: { id: "2" }, query: {}, ...overrides }) as any;

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  return r;
};

const next = jest.fn() as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockService.get.mockResolvedValue(teamRecord);
  mockService.isHead.mockResolvedValue(false);
});

// ─── READ ────────────────────────────────────────────────────────────────────

describe("list", () => {
  test("ADMIN → 200", async () => {
    const res = mockRes();
    await controller.list(mockReq({ user: user.admin }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("GM → 200", async () => {
    const res = mockRes();
    await controller.list(mockReq({ user: user.gm }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("FRONT_OFFICE → 200 (조회 허용)", async () => {
    const res = mockRes();
    await controller.list(mockReq({ user: user.frontOffice }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("COACHING_STAFF → 403", async () => {
    const res = mockRes();
    await controller.list(mockReq({ user: user.coaching }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("PLAYER → 403", async () => {
    const res = mockRes();
    await controller.list(mockReq({ user: user.player }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

// ─── CREATE ──────────────────────────────────────────────────────────────────

describe("create", () => {
  const body = { name: "신규팀", parentId: 1 };

  beforeEach(() => {
    // create 테스트: 부모는 최상위 부서여야 함 (깊이 제한)
    mockService.get.mockResolvedValue(deptRecord);
  });

  test("ADMIN → 201", async () => {
    const res = mockRes();
    await controller.create(mockReq({ user: user.admin, body }), res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test("GM → 201", async () => {
    const res = mockRes();
    await controller.create(mockReq({ user: user.gm, body }), res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test("부서장(isHead) → 201", async () => {
    mockService.isHead.mockResolvedValue(true);
    const res = mockRes();
    await controller.create(mockReq({ user: user.deptHead, body }), res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test("FRONT_OFFICE(부서장 아님) → 403", async () => {
    mockService.isHead.mockResolvedValue(false);
    const res = mockRes();
    await controller.create(mockReq({ user: user.frontOffice, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("FRONT_OFFICE + parentId 없음 → 403 (최상위 부서 생성 불가)", async () => {
    const res = mockRes();
    await controller.create(mockReq({ user: user.frontOffice, body: { name: "신규부서" } }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("COACHING_STAFF → 403", async () => {
    const res = mockRes();
    await controller.create(mockReq({ user: user.coaching, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("팀 아래 팀 생성 시도 → 400 DEPT_MAX_DEPTH_EXCEEDED", async () => {
    // 부모가 이미 sub-dept (parentId !== null)
    mockService.get.mockResolvedValue(teamRecord);
    const res = mockRes();
    await controller.create(mockReq({ user: user.admin, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: "DEPT_MAX_DEPTH_EXCEEDED" }));
  });

  test("빈 name → 400", async () => {
    const res = mockRes();
    await controller.create(mockReq({ user: user.admin, body: { name: "  " } }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: "NAME_REQUIRED" }));
  });

  test("name이 문자열 아님 → 400", async () => {
    const res = mockRes();
    await controller.create(mockReq({ user: user.admin, body: { name: 123 } }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: "NAME_REQUIRED" }));
  });
});

// ─── UPDATE ──────────────────────────────────────────────────────────────────

describe("update", () => {
  const body = { name: "수정팀" };

  test("ADMIN → 200", async () => {
    const res = mockRes();
    await controller.update(mockReq({ user: user.admin, body }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("GM → 200", async () => {
    const res = mockRes();
    await controller.update(mockReq({ user: user.gm, body }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("부서장(isHead) → 200", async () => {
    mockService.isHead.mockResolvedValue(true);
    const res = mockRes();
    await controller.update(mockReq({ user: user.deptHead, body }), res, next);
    expect(res.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test("FRONT_OFFICE(부서장 아님) → 403", async () => {
    const res = mockRes();
    await controller.update(mockReq({ user: user.frontOffice, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("COACHING_STAFF → 403", async () => {
    const res = mockRes();
    await controller.update(mockReq({ user: user.coaching, body }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

// ─── DELETE ──────────────────────────────────────────────────────────────────

describe("delete", () => {
  test("ADMIN → 204", async () => {
    const res = mockRes();
    await controller.delete(mockReq({ user: user.admin }), res, next);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });

  test("GM → 204", async () => {
    const res = mockRes();
    await controller.delete(mockReq({ user: user.gm }), res, next);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });

  test("부서장(isHead) → 204", async () => {
    mockService.isHead.mockResolvedValue(true);
    const res = mockRes();
    await controller.delete(mockReq({ user: user.deptHead }), res, next);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });

  test("FRONT_OFFICE(부서장 아님) → 403", async () => {
    const res = mockRes();
    await controller.delete(mockReq({ user: user.frontOffice }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("COACHING_STAFF → 403", async () => {
    const res = mockRes();
    await controller.delete(mockReq({ user: user.coaching }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });

  test("PLAYER → 403", async () => {
    const res = mockRes();
    await controller.delete(mockReq({ user: user.player }), res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }));
  });
});

// ─── DeptJobTitle ────────────────────────────────────────────────────────────

describe("listJobTitles", () => {
  test("ADMIN → 200 with array", async () => {
    mockService.listJobTitles.mockResolvedValue([{ id: 1, label: "과장" }]);
    const res = mockRes();
    await controller.listJobTitles(mockReq({ params: { deptId: "1" } }), res, next);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, label: "과장" }]);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("createJobTitle", () => {
  test("label 있으면 → 201", async () => {
    const res = mockRes();
    await controller.createJobTitle(
      mockReq({ params: { deptId: "1" }, body: { label: "과장" } }),
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  test("label 없으면 → 400 LABEL_REQUIRED", async () => {
    const res = mockRes();
    await controller.createJobTitle(
      mockReq({ params: { deptId: "1" }, body: {} }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: "LABEL_REQUIRED" }));
  });
});

describe("deleteJobTitle", () => {
  test("ADMIN → 204", async () => {
    const res = mockRes();
    await controller.deleteJobTitle(
      mockReq({ params: { deptId: "1", titleId: "5" } }),
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("updateMemberJobTitle", () => {
  test("jobTitleId 전달 → 200 { ok: true }", async () => {
    const res = mockRes();
    await controller.updateMemberJobTitle(
      mockReq({ params: { deptId: "1", userId: "2" }, body: { jobTitleId: 1 } }),
      res,
      next,
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  test("jobTitleId null → 200 (직급 해제)", async () => {
    const res = mockRes();
    await controller.updateMemberJobTitle(
      mockReq({ params: { deptId: "1", userId: "2" }, body: { jobTitleId: null } }),
      res,
      next,
    );
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });
});
