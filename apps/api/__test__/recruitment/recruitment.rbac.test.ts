import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import * as request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { errorHandler } from "../../src/middleWare/ErrorHandler";
import { RecruitmentController } from "../../src/recruitment/recruitment.controller";

// Mock the service — we only care about auth/RBAC, not business logic
const mockService = {
  getApplication: jest.fn(),
} as any;

const controller = new RecruitmentController(mockService);

// Build a minimal express app that stubs auth and wires the controller
function buildApp(user: Express.User) {
  const app = express();
  app.use(express.json());
  // Stub auth: inject the provided user and call next
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    next();
  });
  app.get("/applications/:id", controller.getApplication);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: service resolves with a dummy record (avoids 404 noise in 200 tests)
  mockService.getApplication.mockResolvedValue({ id: 1 });
});

describe("GET /applications/:id — SJ9 RBAC (controller)", () => {
  test("HR_MANAGER (FRONT_OFFICE + frontOfficeRole=HR_MANAGER) gets 200", async () => {
    const app = buildApp({ id: "00000000-0000-4000-8000-000000000001", role: "FRONT_OFFICE", frontOfficeRole: "HR_MANAGER", coachingRole: null } as any);
    const res = await (request as any).default(app).get("/applications/1");
    expect(res.status).not.toBe(403);
    expect([200, 404]).toContain(res.status);
  });

  test("ADMIN gets 200 (or 404 if not found — not 403)", async () => {
    const app = buildApp({ id: "00000000-0000-4000-8000-000000000002", role: "ADMIN", frontOfficeRole: null, coachingRole: null } as any);
    const res = await (request as any).default(app).get("/applications/1");
    expect(res.status).not.toBe(403);
    expect([200, 404]).toContain(res.status);
  });

  test("SUPER_ADMIN gets 200 (or 404 if not found — not 403)", async () => {
    const app = buildApp({ id: "00000000-0000-4000-8000-000000000003", role: "SUPER_ADMIN", frontOfficeRole: null, coachingRole: null } as any);
    const res = await (request as any).default(app).get("/applications/1");
    expect(res.status).not.toBe(403);
    expect([200, 404]).toContain(res.status);
  });

  test("COACHING_STAFF (HEAD_COACH) gets 403 FORBIDDEN", async () => {
    const app = buildApp({ id: "00000000-0000-4000-8000-000000000004", role: "COACHING_STAFF", frontOfficeRole: null, coachingRole: "HEAD_COACH" } as any);
    const res = await (request as any).default(app).get("/applications/1");
    expect(res.status).toBe(403);
  });

  test("COACHING_STAFF without coachingRole gets 403 FORBIDDEN", async () => {
    const app = buildApp({ id: "00000000-0000-4000-8000-000000000005", role: "COACHING_STAFF", frontOfficeRole: null, coachingRole: null } as any);
    const res = await (request as any).default(app).get("/applications/1");
    expect(res.status).toBe(403);
  });

  test("PLAYER gets 403 FORBIDDEN", async () => {
    const app = buildApp({ id: "00000000-0000-4000-8000-000000000006", role: "PLAYER", frontOfficeRole: null, coachingRole: null } as any);
    const res = await (request as any).default(app).get("/applications/1");
    expect(res.status).toBe(403);
  });

  test("FRONT_OFFICE non-HR role (TD) gets 403 FORBIDDEN", async () => {
    const app = buildApp({ id: "00000000-0000-4000-8000-000000000007", role: "FRONT_OFFICE", frontOfficeRole: "TD", coachingRole: null } as any);
    const res = await (request as any).default(app).get("/applications/1");
    expect(res.status).toBe(403);
  });
});
