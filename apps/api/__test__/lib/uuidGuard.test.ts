import { describe, test, expect } from "@jest/globals";
import { isUuid, requireUuidParam } from "../../src/lib/uuidGuard";
import { Request, Response, NextFunction } from "express";

describe("isUuid", () => {
  test.each([
    ["d312b494-bfa7-441c-8d62-647a71a9fa9b", true],
    ["D312B494-BFA7-441C-8D62-647A71A9FA9B", true],
    ["1", false],
    ["abc", false],
    ["", false],
    [1, false],
    [null, false],
    [undefined, false],
    ["d312b494-bfa7-441c-8d62-647a71a9fa9z", false], // z is not hex
    ["d312b494bfa7441c8d62647a71a9fa9b", false], // no dashes
  ])("isUuid(%p) === %p", (input, expected) => {
    expect(isUuid(input)).toBe(expected);
  });
});

describe("requireUuidParam middleware", () => {
  const mockRes = () => ({} as Response);
  const mockNext = () => {
    const calls: unknown[][] = [];
    const fn = ((...args: unknown[]) => { calls.push(args); }) as NextFunction;
    return Object.assign(fn, { calls });
  };

  test("valid UUID → next()", () => {
    const req = { params: { id: "d312b494-bfa7-441c-8d62-647a71a9fa9b" } } as unknown as Request;
    const next = mockNext();
    requireUuidParam("id")(req, mockRes(), next);
    expect(next.calls).toEqual([[]]);
  });

  test("integer-형 param → 400 INVALID_UUID (enumeration 차단)", () => {
    const req = { params: { id: "1" } } as unknown as Request;
    const next = mockNext();
    requireUuidParam("id")(req, mockRes(), next);
    expect(next.calls.length).toBe(1);
    const err = next.calls[0]![0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("INVALID_UUID");
  });

  test("garbage param → 400 INVALID_UUID", () => {
    const req = { params: { id: "abc-def-not-uuid" } } as unknown as Request;
    const next = mockNext();
    requireUuidParam("id")(req, mockRes(), next);
    const err = next.calls[0]![0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("INVALID_UUID");
  });

  test("missing param → 400", () => {
    const req = { params: {} } as unknown as Request;
    const next = mockNext();
    requireUuidParam("id")(req, mockRes(), next);
    const err = next.calls[0]![0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(400);
  });
});
