import { describe, test, expect } from "@jest/globals";
import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";
import { AppError } from "../../src/lib/appError";

// #572: express.json({ limit: '1mb' }) + entity.too.large → 413 PAYLOAD_TOO_LARGE
// server.ts 의 에러 핸들러 로직만 인라인으로 재현 (Sentry/실 라우터 없이 격리 검증).
function makeApp(limit: string) {
  const app = express();
  app.use(express.json({ limit }));
  app.post("/echo", (req: Request, res: Response) => {
    res.status(201).json({ received: Object.keys(req.body).length });
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ code: err.code });
      return;
    }
    if (typeof err === "object" && err !== null && "type" in err && (err as { type: string }).type === "entity.parse.failed") {
      res.status(400).json({ code: "INVALID_REQUEST" });
      return;
    }
    if (typeof err === "object" && err !== null && "type" in err && (err as { type: string }).type === "entity.too.large") {
      res.status(413).json({ code: "PAYLOAD_TOO_LARGE" });
      return;
    }
    if (err instanceof MulterError) {
      res.status(413).json({ code: "FILE_TOO_LARGE" });
      return;
    }
    res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
  });
  return app;
}

describe("payload size limit (#572)", () => {
  test("1mb 이하 body 는 201", async () => {
    const app = makeApp("1mb");
    const smallBody = { name: "a".repeat(100) };
    const res = await request(app).post("/echo").send(smallBody);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: 1 });
  });

  test("1mb 초과 body 는 413 PAYLOAD_TOO_LARGE (500 아님)", async () => {
    const app = makeApp("1mb");
    // 2MB 문자열
    const bigBody = { name: "A".repeat(2 * 1024 * 1024) };
    const res = await request(app).post("/echo").send(bigBody);
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ code: "PAYLOAD_TOO_LARGE" });
  });

  test("잘못된 JSON 은 400 INVALID_REQUEST (413 과 분리)", async () => {
    const app = makeApp("1mb");
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send("{ not: valid json }");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: "INVALID_REQUEST" });
  });
});
