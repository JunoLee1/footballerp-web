import { describe, expect, test } from "@jest/globals";
import { assertCuid } from "../../src/lib/cuidGuard";
import { AppError } from "../../src/lib/appError";

describe("assertCuid — 정수 변환 차단", () => {
  test("cuid 형식은 통과", () => {
    expect(assertCuid("cmxtestinjury0000000000005")).toBe("cmxtestinjury0000000000005");
    expect(assertCuid("cmunlu6670000d2qoh4u19snr")).toBe("cmunlu6670000d2qoh4u19snr");
  });

  test("정수 문자열은 400", () => {
    expect(() => assertCuid("1")).toThrow(AppError);
    expect(() => assertCuid("42")).toThrow(AppError);
    expect(() => assertCuid("999999999")).toThrow(AppError);
  });

  test("소수/음수/과학표기 문자열도 400 (Number() 파싱 가능)", () => {
    expect(() => assertCuid("3.14")).toThrow(AppError);
    expect(() => assertCuid("-1")).toThrow(AppError);
    expect(() => assertCuid("1e5")).toThrow(AppError);
  });

  test("빈 문자열 400", () => {
    expect(() => assertCuid("")).toThrow(AppError);
  });

  test("undefined / string[] 400", () => {
    expect(() => assertCuid(undefined)).toThrow(AppError);
    expect(() => assertCuid(["cmxtest0000000000000000001"])).toThrow(AppError);
  });

  test("cuid 형식 아닌 문자열 400 (SQL fuzz / UUID / 특수문자)", () => {
    expect(() => assertCuid("abc")).toThrow(AppError);
    expect(() => assertCuid("00000000-0000-4000-8000-000000000001")).toThrow(AppError);
    expect(() => assertCuid("' OR '1'='1")).toThrow(AppError);
    expect(() => assertCuid("cmXtest_upper_case")).toThrow(AppError); // 대문자 불가
    expect(() => assertCuid("axxxxxxxxxxxxxxxxxxxxxxxx")).toThrow(AppError); // c 로 시작 안 함
  });
});
