import { describe, test, expect } from "@jest/globals";
import request from "supertest";
import express, { Request, Response } from "express";
import { createWriteRateLimit } from "../../src/lib/writeRateLimit";

// #573: write endpoint 에 대한 IP 기반 rate-limit 검증.
// - POST/PATCH/PUT/DELETE 는 60/min 상한 (IP 당)
// - GET/HEAD/OPTIONS 는 skip (제한 없음)
// - 초과 시 429 { code: "TOO_MANY_REQUESTS", retryAfterSec }
function makeApp() {
  const app = express();
  app.use(express.json());
  // factory 로 fresh counter store — 각 test 격리
  app.use(createWriteRateLimit());
  app.get("/echo", (_req: Request, res: Response) => res.status(200).json({ ok: true }));
  app.post("/echo", (_req: Request, res: Response) => res.status(201).json({ ok: true }));
  app.delete("/echo/:id", (_req: Request, res: Response) => res.status(204).send());
  return app;
}

describe("write rate-limit (#573)", () => {
  test("GET 은 rate-limit skip — 임의 반복 200", async () => {
    const app = makeApp();
    for (let i = 0; i < 70; i++) {
      const res = await request(app).get("/echo");
      expect(res.status).toBe(200);
    }
  });

  test("POST 60회 이내는 201, 61회째 429", async () => {
    const app = makeApp();
    for (let i = 0; i < 60; i++) {
      const res = await request(app).post("/echo").send({ n: i });
      expect(res.status).toBe(201);
    }
    const rejected = await request(app).post("/echo").send({ n: 61 });
    expect(rejected.status).toBe(429);
    expect(rejected.body).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      retryAfterSec: 60,
    });
    expect(rejected.headers["retry-after"]).toBe("60");
  });

  test("DELETE 도 write 로 rate-limit 적용", async () => {
    const app = makeApp();
    for (let i = 0; i < 60; i++) {
      const res = await request(app).delete(`/echo/${i}`);
      expect(res.status).toBe(204);
    }
    const rejected = await request(app).delete("/echo/61");
    expect(rejected.status).toBe(429);
  });

  test("write 61회 초과 후에도 GET 은 200 (skip 검증)", async () => {
    const app = makeApp();
    for (let i = 0; i < 61; i++) {
      await request(app).post("/echo").send({ n: i });
    }
    const readAfterBlock = await request(app).get("/echo");
    expect(readAfterBlock.status).toBe(200);
  });
});
