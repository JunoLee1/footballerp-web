import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import * as request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { AppError } from "../../src/lib/appError";
import { errorHandler } from "../../src/middleWare/ErrorHandler";
import { canReadActiveInjury, canReadInjuryReport } from "../../src/lib/permissions";

// #584: PLAYER self-scope 검증.
// injury.routes 는 controller/service/repo 전체를 import 하니 실제 라우터를 그대로
// 마운트하기 어렵다 → guardOrSelf 와 동일한 구조를 인라인으로 재현 + 서비스는 목킹.

type MockService = {
  isSelfOwnedInjury: jest.Mock<(id: number, uid: number) => Promise<boolean>>;
  isSelfOwnedPlayer: jest.Mock<(pid: string, uid: number) => Promise<boolean>>;
};

const mockService: MockService = {
  isSelfOwnedInjury: jest.fn(),
  isSelfOwnedPlayer: jest.fn(),
};

type SelfCheck = (req: Request, userId: number) => Promise<boolean>;
const guardOrSelf = (
  perm: (role: string, coachingRole?: string | null, deptCategories?: string[]) => boolean,
  selfCheck: SelfCheck,
) => async (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user!;
  if (perm(user.role, user.coachingRole, user.departmentCategories)) return next();
  try {
    if (await selfCheck(req, user.id)) return next();
  } catch (err) {
    return next(err);
  }
  next(new AppError(403, "FORBIDDEN"));
};

function buildApp(user: Express.User | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) req.user = user;
    next();
  });
  const okHandler = (_req: Request, res: Response) => res.status(200).json({ ok: true });
  app.get(
    "/injuries/:id/assessment",
    guardOrSelf(canReadInjuryReport, (req, uid) =>
      mockService.isSelfOwnedInjury(Number(req.params["id"]), uid),
    ),
    okHandler,
  );
  app.get(
    "/injuries/:id/external-reports",
    guardOrSelf(canReadInjuryReport, (req, uid) =>
      mockService.isSelfOwnedInjury(Number(req.params["id"]), uid),
    ),
    okHandler,
  );
  app.get(
    "/injuries/:id",
    guardOrSelf(canReadActiveInjury, (req, uid) =>
      mockService.isSelfOwnedInjury(Number(req.params["id"]), uid),
    ),
    okHandler,
  );
  app.get(
    "/injuries/player/:playerId",
    guardOrSelf(canReadActiveInjury, (req, uid) =>
      mockService.isSelfOwnedPlayer(String(req.params["playerId"]), uid),
    ),
    okHandler,
  );
  app.use(errorHandler);
  return app;
}

const asPlayer = { id: 42, role: "PLAYER", coachingRole: null, frontOfficeRole: null } as any;
const asMedical = { id: 7, role: "COACHING_STAFF", coachingRole: "MEDICAL", frontOfficeRole: null } as any;
const asAsset = { id: 8, role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "ASSET_MANAGER" } as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("#584: /injuries/:id/assessment — PLAYER self-scope", () => {
  test("PLAYER 본인 부상 → 200", async () => {
    mockService.isSelfOwnedInjury.mockResolvedValue(true);
    const res = await (request as any).default(buildApp(asPlayer)).get("/injuries/99/assessment");
    expect(res.status).toBe(200);
    expect(mockService.isSelfOwnedInjury).toHaveBeenCalledWith(99, 42);
  });

  test("PLAYER 타인 부상 → 403", async () => {
    mockService.isSelfOwnedInjury.mockResolvedValue(false);
    const res = await (request as any).default(buildApp(asPlayer)).get("/injuries/99/assessment");
    expect(res.status).toBe(403);
  });

  test("MEDICAL 통과 → self-check 불호출", async () => {
    const res = await (request as any).default(buildApp(asMedical)).get("/injuries/99/assessment");
    expect(res.status).toBe(200);
    expect(mockService.isSelfOwnedInjury).not.toHaveBeenCalled();
  });

  test("ASSET_MANAGER + 본인 아님 → 403 (self-check fail 시 FO fallback 없음)", async () => {
    mockService.isSelfOwnedInjury.mockResolvedValue(false);
    const res = await (request as any).default(buildApp(asAsset)).get("/injuries/99/assessment");
    expect(res.status).toBe(403);
  });
});

describe("#584: /injuries/:id/external-reports — PLAYER self-scope", () => {
  test("PLAYER 본인 → 200", async () => {
    mockService.isSelfOwnedInjury.mockResolvedValue(true);
    const res = await (request as any).default(buildApp(asPlayer)).get("/injuries/12/external-reports");
    expect(res.status).toBe(200);
  });

  test("PLAYER 타인 → 403", async () => {
    mockService.isSelfOwnedInjury.mockResolvedValue(false);
    const res = await (request as any).default(buildApp(asPlayer)).get("/injuries/12/external-reports");
    expect(res.status).toBe(403);
  });
});

describe("#584: /injuries/:id detail — PLAYER self-scope", () => {
  test("PLAYER 본인 → 200", async () => {
    mockService.isSelfOwnedInjury.mockResolvedValue(true);
    const res = await (request as any).default(buildApp(asPlayer)).get("/injuries/5");
    expect(res.status).toBe(200);
  });

  test("PLAYER 타인 → 403", async () => {
    mockService.isSelfOwnedInjury.mockResolvedValue(false);
    const res = await (request as any).default(buildApp(asPlayer)).get("/injuries/5");
    expect(res.status).toBe(403);
  });
});

describe("#584: /injuries/player/:playerId — PLAYER self-scope", () => {
  test("PLAYER 본인 playerId → 200", async () => {
    mockService.isSelfOwnedPlayer.mockResolvedValue(true);
    const res = await (request as any).default(buildApp(asPlayer)).get("/injuries/player/abc-123");
    expect(res.status).toBe(200);
    expect(mockService.isSelfOwnedPlayer).toHaveBeenCalledWith("abc-123", 42);
  });

  test("PLAYER 타인 playerId → 403", async () => {
    mockService.isSelfOwnedPlayer.mockResolvedValue(false);
    const res = await (request as any).default(buildApp(asPlayer)).get("/injuries/player/xyz-999");
    expect(res.status).toBe(403);
  });
});
