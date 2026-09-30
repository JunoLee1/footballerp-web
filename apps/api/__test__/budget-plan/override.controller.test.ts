/**
 * #444: BudgetOverrideController integration tests — GET /financial-reports/:seasonId/override-logs
 * status filter / limit / cursor / 권한 게이트 검증.
 *
 * mandatory-minimum.controller.test 와 동일한 supertest 패턴을 따른다:
 * express app 을 직접 mount 하고 req.user 를 middleware 에서 주입.
 */
import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import * as request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { errorHandler } from "../../src/middleWare/ErrorHandler";
import { BudgetOverrideController } from "../../src/budget-plan/override.controller";

const mockService = {
  requestOverride: jest.fn(),
  reviewOverride: jest.fn(),
  list: jest.fn(),
} as any;

const controller = new BudgetOverrideController(mockService);

function buildApp(user: Express.User | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) req.user = user;
    next();
  });
  app.post("/financial-reports/:seasonId/override-request", controller.requestOverride);
  app.post("/budget-override-logs/:id/review", controller.review);
  app.get("/financial-reports/:seasonId/override-logs", controller.list);
  app.use(errorHandler);
  return app;
}

const asFM = {
  id: 1,
  role: "FRONT_OFFICE",
  frontOfficeRole: "FINANCE_MANAGER",
  coachingRole: null,
} as any;
const asGM = { id: "00000000-0000-4000-8000-000000000002", role: "GM", frontOfficeRole: null, coachingRole: null } as any;
const asAdmin = { id: "00000000-0000-4000-8000-000000000003", role: "ADMIN", frontOfficeRole: null, coachingRole: null } as any;
const asSuper = { id: "00000000-0000-4000-8000-000000000004", role: "SUPER_ADMIN", frontOfficeRole: null, coachingRole: null } as any;
const asHR = {
  id: 5,
  role: "FRONT_OFFICE",
  frontOfficeRole: "HR_MANAGER",
  coachingRole: null,
} as any;
const asFinanceStaff = {
  id: 6,
  role: "FRONT_OFFICE",
  frontOfficeRole: "FINANCE_STAFF",
  coachingRole: null,
} as any;
const asCoach = {
  id: 7,
  role: "COACHING_STAFF",
  frontOfficeRole: null,
  coachingRole: "HEAD_COACH",
} as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /financial-reports/:seasonId/override-logs — list (#444)", () => {
  test("FM → 200 + service.list 호출", async () => {
    mockService.list.mockResolvedValue([{ id: 10, status: "PENDING" }]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 10, status: "PENDING" }]);
    expect(mockService.list).toHaveBeenCalledWith(5, {});
  });

  test("GM → 200", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asGM))
      .get("/financial-reports/5/override-logs");
    expect(res.status).toBe(200);
  });

  test("ADMIN → 200", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asAdmin))
      .get("/financial-reports/5/override-logs");
    expect(res.status).toBe(200);
  });

  test("SUPER_ADMIN → 200 (isAdminLike 에 포함)", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asSuper))
      .get("/financial-reports/5/override-logs");
    expect(res.status).toBe(200);
  });

  test("HR_MANAGER → 403", async () => {
    const res = await (request as any)
      .default(buildApp(asHR))
      .get("/financial-reports/5/override-logs");
    expect(res.status).toBe(403);
    expect(mockService.list).not.toHaveBeenCalled();
  });

  test("FINANCE_STAFF → 403 (list 는 FM/GM/ADMIN 전용)", async () => {
    const res = await (request as any)
      .default(buildApp(asFinanceStaff))
      .get("/financial-reports/5/override-logs");
    expect(res.status).toBe(403);
  });

  test("HEAD_COACH (팀장) → 403 (MVP: scope 매칭 후속 이슈)", async () => {
    const res = await (request as any)
      .default(buildApp(asCoach))
      .get("/financial-reports/5/override-logs");
    expect(res.status).toBe(403);
  });

  test("no user → 401", async () => {
    const res = await (request as any)
      .default(buildApp(null))
      .get("/financial-reports/5/override-logs");
    expect(res.status).toBe(401);
  });

  test("query status=PENDING → service.list 두번째 인자에 status", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?status=PENDING");
    expect(res.status).toBe(200);
    expect(mockService.list).toHaveBeenCalledWith(5, { status: "PENDING" });
  });

  test("query status=APPROVED → OK", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?status=APPROVED");
    expect(res.status).toBe(200);
    expect(mockService.list).toHaveBeenCalledWith(5, { status: "APPROVED" });
  });

  test("query status=REJECTED → OK", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?status=REJECTED");
    expect(res.status).toBe(200);
    expect(mockService.list).toHaveBeenCalledWith(5, { status: "REJECTED" });
  });

  test("query status=BOGUS → 400 INVALID_STATUS", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?status=BOGUS");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("INVALID_STATUS");
    expect(mockService.list).not.toHaveBeenCalled();
  });

  test("query limit=25 → service.list.limit=25", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?limit=25");
    expect(res.status).toBe(200);
    expect(mockService.list).toHaveBeenCalledWith(5, { limit: 25 });
  });

  test("query limit=201 → 400 LIMIT_EXCEEDS_MAX", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?limit=201");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("LIMIT_EXCEEDS_MAX");
  });

  test("query limit=abc → 400 INVALID_LIMIT", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?limit=abc");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("INVALID_LIMIT");
  });

  test("query cursor=42 → service.list.cursor=42", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?cursor=42");
    expect(res.status).toBe(200);
    expect(mockService.list).toHaveBeenCalledWith(5, { cursor: 42 });
  });

  test("query cursor=0 → 400 INVALID_CURSOR", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/override-logs?cursor=0");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("INVALID_CURSOR");
  });

  test("query status+limit+cursor 동시 → 정상 조합", async () => {
    mockService.list.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get(
        "/financial-reports/5/override-logs?status=PENDING&limit=10&cursor=100",
      );
    expect(res.status).toBe(200);
    expect(mockService.list).toHaveBeenCalledWith(5, {
      status: "PENDING",
      limit: 10,
      cursor: 100,
    });
  });

  test("seasonId 잘못됨 (abc) → 400 INVALID_SEASON_ID", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/abc/override-logs");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("INVALID_SEASON_ID");
  });
});
