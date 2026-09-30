import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import * as request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { errorHandler } from "../../src/middleWare/ErrorHandler";
import { MandatoryMinimumController } from "../../src/mandatory-minimum/mandatory-minimum.controller";

const mockService = {
  propose: jest.fn(),
  review: jest.fn(),
  listHistory: jest.fn(),
  listPending: jest.fn(),
} as any;

const controller = new MandatoryMinimumController(mockService);

function buildApp(user: Express.User | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) req.user = user;
    next();
  });
  app.post("/budget-category-plans/:id/mandatory-minimum", controller.propose);
  app.post("/mandatory-minimum-changes/:id/review", controller.review);
  app.get("/budget-category-plans/:id/mandatory-minimum/history", controller.listHistory);
  app.get("/financial-reports/:seasonId/mandatory-minimum/pending", controller.listPending);
  app.use(errorHandler);
  return app;
}

const asFM = { id: "00000000-0000-4000-8000-000000000001", role: "FRONT_OFFICE", frontOfficeRole: "FINANCE_MANAGER", coachingRole: null } as any;
const asGM = { id: "00000000-0000-4000-8000-000000000002", role: "GM", frontOfficeRole: null, coachingRole: null } as any;
const asSuper = { id: "00000000-0000-4000-8000-000000000003", role: "SUPER_ADMIN", frontOfficeRole: null, coachingRole: null } as any;
const asHR = { id: "00000000-0000-4000-8000-000000000004", role: "FRONT_OFFICE", frontOfficeRole: "HR_MANAGER", coachingRole: null } as any;
const asCoach = { id: "00000000-0000-4000-8000-000000000005", role: "COACHING_STAFF", frontOfficeRole: null, coachingRole: "HEAD_COACH" } as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /budget-category-plans/:id/mandatory-minimum — propose (FM only)", () => {
  test("FM 정상 요청 → 201 + propose 호출", async () => {
    mockService.propose.mockResolvedValue({ id: 100, status: "PENDING" });
    const res = await (request as any)
      .default(buildApp(asFM))
      .post("/budget-category-plans/10/mandatory-minimum")
      .send({
        newAmount: 200_000,
        evidenceType: "CONTRACT",
        evidenceUrl: "https://x.com/c.pdf",
        reason: "임대료 인상",
        effectiveDate: "2026-09-01",
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 100, status: "PENDING" });
    expect(mockService.propose).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        newAmount: 200_000,
        evidenceType: "CONTRACT",
        evidenceUrl: "https://x.com/c.pdf",
        reason: "임대료 인상",
      }),
      "00000000-0000-4000-8000-000000000001",
    );
  });

  test("GM → 403 (FM만 propose 가능)", async () => {
    const res = await (request as any)
      .default(buildApp(asGM))
      .post("/budget-category-plans/10/mandatory-minimum")
      .send({
        newAmount: 200_000,
        evidenceType: "CONTRACT",
        evidenceUrl: "x",
        reason: "r",
        effectiveDate: "2026-09-01",
      });
    expect(res.status).toBe(403);
    expect(mockService.propose).not.toHaveBeenCalled();
  });

  test("HR_MANAGER → 403", async () => {
    const res = await (request as any)
      .default(buildApp(asHR))
      .post("/budget-category-plans/10/mandatory-minimum")
      .send({
        newAmount: 200_000,
        evidenceType: "CONTRACT",
        evidenceUrl: "x",
        reason: "r",
        effectiveDate: "2026-09-01",
      });
    expect(res.status).toBe(403);
  });

  test("no user → 401", async () => {
    const res = await (request as any)
      .default(buildApp(null))
      .post("/budget-category-plans/10/mandatory-minimum")
      .send({ newAmount: 1, evidenceType: "CONTRACT", evidenceUrl: "x", reason: "r", effectiveDate: "2026-09-01" });
    expect(res.status).toBe(401);
  });

  test("evidenceType 잘못됨 → 400", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .post("/budget-category-plans/10/mandatory-minimum")
      .send({ newAmount: 1, evidenceType: "OTHER", reason: "r", effectiveDate: "2026-09-01" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("INVALID_EVIDENCE_TYPE");
  });

  test("param id 잘못됨 → 400 INVALID_CATEGORY_PLAN_ID", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .post("/budget-category-plans/abc/mandatory-minimum")
      .send({ newAmount: 1, evidenceType: "CONTRACT", evidenceUrl: "x", reason: "r", effectiveDate: "2026-09-01" });
    expect(res.status).toBe(400);
  });

  test("effectiveDate 잘못됨 → 400", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .post("/budget-category-plans/10/mandatory-minimum")
      .send({ newAmount: 1, evidenceType: "CONTRACT", evidenceUrl: "x", reason: "r", effectiveDate: "invalid" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("INVALID_EFFECTIVE_DATE");
  });
});

describe("POST /mandatory-minimum-changes/:id/review — review (GM only)", () => {
  test("GM APPROVED → 200 + review 호출", async () => {
    mockService.review.mockResolvedValue({ id: 500, status: "APPROVED" });
    const res = await (request as any)
      .default(buildApp(asGM))
      .post("/mandatory-minimum-changes/500/review")
      .send({ decision: "APPROVED", note: "OK" });
    expect(res.status).toBe(200);
    expect(mockService.review).toHaveBeenCalledWith(500, "APPROVED", "OK", "00000000-0000-4000-8000-000000000002");
  });

  test("FM → 403 (review 는 GM only)", async () => {
    const res = await (request as any)
      .default(buildApp(asFM))
      .post("/mandatory-minimum-changes/500/review")
      .send({ decision: "APPROVED", note: "OK" });
    expect(res.status).toBe(403);
    expect(mockService.review).not.toHaveBeenCalled();
  });

  test("SUPER_ADMIN → 403 (review 는 GM only)", async () => {
    const res = await (request as any)
      .default(buildApp(asSuper))
      .post("/mandatory-minimum-changes/500/review")
      .send({ decision: "APPROVED" });
    expect(res.status).toBe(403);
  });

  test("decision 없음 → 400", async () => {
    const res = await (request as any)
      .default(buildApp(asGM))
      .post("/mandatory-minimum-changes/500/review")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("DECISION_MUST_BE_APPROVED_OR_REJECTED");
  });
});

describe("GET /budget-category-plans/:id/mandatory-minimum/history — listHistory", () => {
  test("FM → 200", async () => {
    mockService.listHistory.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/budget-category-plans/10/mandatory-minimum/history");
    expect(res.status).toBe(200);
    expect(mockService.listHistory).toHaveBeenCalledWith(10, "FRONT_OFFICE", "FINANCE_MANAGER");
  });

  test("GM → 200", async () => {
    mockService.listHistory.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asGM))
      .get("/budget-category-plans/10/mandatory-minimum/history");
    expect(res.status).toBe(200);
  });

  test("SUPER_ADMIN → 200 (history 는 SUPER_ADMIN 도 읽기 가능 — grill Q6)", async () => {
    mockService.listHistory.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asSuper))
      .get("/budget-category-plans/10/mandatory-minimum/history");
    expect(res.status).toBe(200);
  });

  test("COACHING_STAFF → 403", async () => {
    const res = await (request as any)
      .default(buildApp(asCoach))
      .get("/budget-category-plans/10/mandatory-minimum/history");
    expect(res.status).toBe(403);
  });

  test("HR_MANAGER → 403", async () => {
    const res = await (request as any)
      .default(buildApp(asHR))
      .get("/budget-category-plans/10/mandatory-minimum/history");
    expect(res.status).toBe(403);
  });
});

describe("GET /financial-reports/:seasonId/mandatory-minimum/pending — listPending", () => {
  test("FM → 200", async () => {
    mockService.listPending.mockResolvedValue([]);
    const res = await (request as any)
      .default(buildApp(asFM))
      .get("/financial-reports/5/mandatory-minimum/pending");
    expect(res.status).toBe(200);
    expect(mockService.listPending).toHaveBeenCalledWith(5, "FRONT_OFFICE", "FINANCE_MANAGER");
  });

  test("GM → 200", async () => {
    mockService.listPending.mockResolvedValue([{ id: 1 }]);
    const res = await (request as any)
      .default(buildApp(asGM))
      .get("/financial-reports/5/mandatory-minimum/pending");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1 }]);
  });

  test("SUPER_ADMIN → 403 (pending 은 FM/GM only)", async () => {
    const res = await (request as any)
      .default(buildApp(asSuper))
      .get("/financial-reports/5/mandatory-minimum/pending");
    expect(res.status).toBe(403);
  });
});
