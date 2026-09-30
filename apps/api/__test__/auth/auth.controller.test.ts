import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { Request, Response, NextFunction } from "express";
import { AuthController } from "../../src/auth/auth.controller";

const authService = {
  login: jest.fn(),
  createUser: jest.fn(),
  createInvite: jest.fn(),
  getInvite: jest.fn(),
  acceptInvite: jest.fn(),
  listInvites: jest.fn(),
  me: jest.fn(),
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn(),
  gdprErasure: jest.fn(),
  gdprExport: jest.fn(),
} as any;

const authRepo = {
  createLoginHistory: jest.fn().mockResolvedValue(undefined),
  listLoginHistory: jest.fn(),
  listAllLoginHistory: jest.fn(),
  updateLanguage: jest.fn(),
} as any;

const controller = new AuthController(authService, authRepo);

describe("AuthController - login", () => {
  beforeEach(() => jest.clearAllMocks());

  test("로그인 성공시 200 반환", async () => {
    const req = {
      body: { email: "test@test.com", password: "12345" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      get: jest.fn().mockReturnValue("test-agent"),
      cookies: {},
    } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    authService.login.mockResolvedValue({ accessToken: "acc", refreshToken: "ref", userId: "00000000-0000-4000-8000-000000000001", teamId: 1 });

    await controller.login(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("로그인 실패시 next(err) 호출", async () => {
    const req = {
      body: { email: "test@test.com", password: "wrong" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      get: jest.fn().mockReturnValue("test-agent"),
      cookies: {},
    } as unknown as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    authService.login.mockRejectedValue(new Error("INVALID_CREDENTIALS"));
    await controller.login(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("AuthController - me", () => {
  beforeEach(() => jest.clearAllMocks());

  test("인증 없으면 401", async () => {
    const req = { user: null } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await controller.me(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test("인증된 유저면 200과 유저 정보 반환", async () => {
    const req = {
      user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN" },
    } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    authService.me.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001", email: "a@test.com", role: "ADMIN" });
    await controller.me(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "00000000-0000-4000-8000-000000000001" }));
  });
});

describe("AuthController - createUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("인증 없으면 401", async () => {
    const req = { user: null } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await controller.createUser(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test("ADMIN이 아니면 403", async () => {
    const req = { user: { id: "00000000-0000-4000-8000-000000000001", role: "PLAYER" }, body: {} } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await controller.createUser(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test("성공시 201 반환", async () => {
    const req = {
      user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN" },
      body: { email: "new@test.com", role: "PLAYER" },
    } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    authService.createUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", email: "new@test.com" });
    await controller.createUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe("AuthController - logout", () => {
  beforeEach(() => jest.clearAllMocks());

  test("로그아웃 성공시 200", async () => {
    const req = {
      cookies: {},
    } as unknown as Request;
    const res = {
      clearCookie: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    await controller.logout(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("AuthController - gdprErasure", () => {
  beforeEach(() => jest.clearAllMocks());

  test("인증 없으면 401", async () => {
    const req = { user: null, params: { id: "2" } } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await controller.gdprErasure(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test("ADMIN이 아니면 403", async () => {
    const req = { user: { id: "00000000-0000-4000-8000-000000000001", role: "PLAYER" }, params: { id: "2" } } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    await controller.gdprErasure(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test("성공시 결과 반환", async () => {
    const req = { user: { id: "00000000-0000-4000-8000-000000000001", role: "ADMIN" }, params: { id: "2" } } as unknown as Request;
    const res = { json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    authService.gdprErasure.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", email: "anon" });
    await controller.gdprErasure(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "00000000-0000-4000-8000-000000000002" }));
  });
});
