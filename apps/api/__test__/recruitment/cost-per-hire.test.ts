import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import * as request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { RecruitmentController } from "../../src/recruitment/recruitment.controller";
import { errorHandler } from "../../src/middleWare/ErrorHandler";
import { RecruitmentRepository } from "../../src/recruitment/recruitment.repo";

// Minimal prisma mock — only what getCostPerHire needs
const mockPrisma = {
  jobPosting: {
    findMany: jest.fn(),
  },
} as any;

const repo = new RecruitmentRepository(mockPrisma);

beforeEach(() => jest.clearAllMocks());

describe("RecruitmentRepository.getCostPerHire", () => {
  test("hiredCount > 0 이면 costPerHire = round(budget / hiredCount)", async () => {
    mockPrisma.jobPosting.findMany.mockResolvedValue([
      {
        id: 1,
        title: "FW 선수 채용",
        budget: 3000000,
        applications: [
          { status: "ONBOARDED" },
          { status: "ONBOARDED" },
          { status: "REJECTED" },
        ],
      },
    ]);

    const result = await repo.getCostPerHire();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      postingId: 1,
      title: "FW 선수 채용",
      budget: 3000000,
      hiredCount: 2,
      costPerHire: 1500000,
    });
  });

  test("hiredCount = 0 이면 costPerHire = 0", async () => {
    mockPrisma.jobPosting.findMany.mockResolvedValue([
      {
        id: 2,
        title: "GK 채용",
        budget: 1000000,
        applications: [{ status: "REJECTED" }, { status: "SCREENING" }],
      },
    ]);

    const result = await repo.getCostPerHire();

    expect(result[0]).toMatchObject({
      postingId: 2,
      hiredCount: 0,
      costPerHire: 0,
    });
  });

  test("budget이 null이면 budget = 0으로 처리한다", async () => {
    mockPrisma.jobPosting.findMany.mockResolvedValue([
      {
        id: 3,
        title: "MF 채용",
        budget: null,
        applications: [{ status: "ONBOARDED" }],
      },
    ]);

    const result = await repo.getCostPerHire();

    expect(result[0]).toMatchObject({
      postingId: 3,
      budget: 0,
      hiredCount: 1,
      costPerHire: 0,
    });
  });

  test("포스팅이 없으면 빈 배열 반환", async () => {
    mockPrisma.jobPosting.findMany.mockResolvedValue([]);

    const result = await repo.getCostPerHire();

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Route-level (controller) test for GET /cost-per-hire
// ---------------------------------------------------------------------------

const mockServiceForRoute = {
  getCostPerHire: jest.fn(),
} as any;

const controllerForRoute = new RecruitmentController(mockServiceForRoute);

function buildCostPerHireApp() {
  const app = express();
  app.use(express.json());
  // Stub auth: inject an HR_MANAGER user
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: "00000000-0000-4000-8000-000000000001", role: "FRONT_OFFICE", frontOfficeRole: "HR_MANAGER", coachingRole: null } as any;
    next();
  });
  app.get("/cost-per-hire", controllerForRoute.getCostPerHire);
  app.use(errorHandler);
  return app;
}

describe("GET /cost-per-hire — route layer (CL10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("서비스가 데이터를 반환하면 200과 배열을 응답한다", async () => {
    const mockData = [
      { postingId: 1, title: "FW 선수 채용", budget: 3000000, hiredCount: 2, costPerHire: 1500000 },
    ];
    mockServiceForRoute.getCostPerHire.mockResolvedValue(mockData);

    const app = buildCostPerHireApp();
    const res = await (request as any).default(app).get("/cost-per-hire");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      postingId: 1,
      title: "FW 선수 채용",
      hiredCount: 2,
      costPerHire: 1500000,
    });
    expect(mockServiceForRoute.getCostPerHire).toHaveBeenCalledTimes(1);
  });

  test("서비스가 빈 배열을 반환하면 200과 빈 배열을 응답한다", async () => {
    mockServiceForRoute.getCostPerHire.mockResolvedValue([]);

    const app = buildCostPerHireApp();
    const res = await (request as any).default(app).get("/cost-per-hire");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
