import { describe, test, expect } from "@jest/globals";
import { hasPermission, Permission } from "../../src/lib/permissions";

describe("GUARDIAN permissions", () => {
  test("GUARDIAN has no special permissions", () => {
    expect(hasPermission("GUARDIAN", Permission.SYSTEM_MANAGE)).toBe(false);
    expect(hasPermission("GUARDIAN", Permission.FINANCE_APPROVE)).toBe(false);
    expect(hasPermission("GUARDIAN", Permission.VIEW_TEAM_RANKING)).toBe(false);
  });

  test("existing roles unaffected", () => {
    expect(hasPermission("ADMIN", Permission.SYSTEM_MANAGE)).toBe(true);
    expect(hasPermission("PLAYER", Permission.VIEW_TEAM_RANKING)).toBe(true);
  });
});

describe("requireSuperAdmin", () => {
  const { requireSuperAdmin } = require("../../src/lib/permissions");
  const { AppError } = require("../../src/lib/appError");

  test("SUPER_ADMIN이면 throw 없음", () => {
    expect(() => requireSuperAdmin({ user: { role: "SUPER_ADMIN" } } as any)).not.toThrow();
  });

  test("ADMIN이면 403", () => {
    expect(() => requireSuperAdmin({ user: { role: "ADMIN" } } as any)).toThrow(AppError);
  });

  test("user 없으면 403", () => {
    expect(() => requireSuperAdmin({} as any)).toThrow(AppError);
  });
});

describe("canReadFinance", () => {
  const { canReadFinance } = require("../../src/lib/permissions");

  test("ADMIN → true", () => expect(canReadFinance("ADMIN", null)).toBe(true));
  test("SUPER_ADMIN → true", () => expect(canReadFinance("SUPER_ADMIN", null)).toBe(true));
  test("GM → true", () => expect(canReadFinance("GM", null)).toBe(true));
  test("FRONT_OFFICE + FINANCE_MANAGER → true", () => expect(canReadFinance("FRONT_OFFICE", "FINANCE_MANAGER")).toBe(true));
  test("FRONT_OFFICE + FINANCE_STAFF → true", () => expect(canReadFinance("FRONT_OFFICE", "FINANCE_STAFF")).toBe(true));
  test("FRONT_OFFICE + TD → false", () => expect(canReadFinance("FRONT_OFFICE", "TD")).toBe(false));
  test("COACHING_STAFF → false", () => expect(canReadFinance("COACHING_STAFF", null)).toBe(false));
});

describe("canWriteFinance", () => {
  const { canWriteFinance } = require("../../src/lib/permissions");

  test("ADMIN → true", () => expect(canWriteFinance("ADMIN", null)).toBe(true));
  test("SUPER_ADMIN → true", () => expect(canWriteFinance("SUPER_ADMIN", null)).toBe(true));
  test("GM → true", () => expect(canWriteFinance("GM", null)).toBe(true));
  test("FRONT_OFFICE + FINANCE_MANAGER → true", () => expect(canWriteFinance("FRONT_OFFICE", "FINANCE_MANAGER")).toBe(true));
  test("FRONT_OFFICE + FINANCE_STAFF → false", () => expect(canWriteFinance("FRONT_OFFICE", "FINANCE_STAFF")).toBe(false));
  test("FRONT_OFFICE + TD → false", () => expect(canWriteFinance("FRONT_OFFICE", "TD")).toBe(false));
});

describe("canReadHR", () => {
  const { canReadHR } = require("../../src/lib/permissions");

  test("ADMIN → true", () => expect(canReadHR("ADMIN", null)).toBe(true));
  test("GM → true", () => expect(canReadHR("GM", null)).toBe(true));
  test("FRONT_OFFICE + HR_MANAGER → true", () => expect(canReadHR("FRONT_OFFICE", "HR_MANAGER")).toBe(true));
  test("FRONT_OFFICE + HR_STAFF → true", () => expect(canReadHR("FRONT_OFFICE", "HR_STAFF")).toBe(true));
  test("FRONT_OFFICE + TD → false", () => expect(canReadHR("FRONT_OFFICE", "TD")).toBe(false));
  test("PLAYER → false", () => expect(canReadHR("PLAYER", null)).toBe(false));
});

describe("canWriteHR", () => {
  const { canWriteHR } = require("../../src/lib/permissions");

  test("ADMIN → true", () => expect(canWriteHR("ADMIN", null)).toBe(true));
  test("GM → true", () => expect(canWriteHR("GM", null)).toBe(true));
  test("FRONT_OFFICE + HR_MANAGER → true", () => expect(canWriteHR("FRONT_OFFICE", "HR_MANAGER")).toBe(true));
  test("FRONT_OFFICE + HR_STAFF → false", () => expect(canWriteHR("FRONT_OFFICE", "HR_STAFF")).toBe(false));
});

describe("canManageTD", () => {
  const { canManageTD } = require("../../src/lib/permissions");

  test("ADMIN → true", () => expect(canManageTD("ADMIN", null)).toBe(true));
  test("GM → true", () => expect(canManageTD("GM", null)).toBe(true));
  test("FRONT_OFFICE + TD → true", () => expect(canManageTD("FRONT_OFFICE", "TD")).toBe(true));
  test("FRONT_OFFICE + HR_MANAGER → false", () => expect(canManageTD("FRONT_OFFICE", "HR_MANAGER")).toBe(false));
  test("COACHING_STAFF → false", () => expect(canManageTD("COACHING_STAFF", null)).toBe(false));
});

describe("assertClubAccess", () => {
  const { assertClubAccess } = require("../../src/lib/permissions");
  const { AppError } = require("../../src/lib/appError");

  function makeReq(role: string, clubId: number | null | undefined) {
    return { user: { role, clubId } } as any;
  }

  test("SUPER_ADMIN은 targetClubId 무관 통과", () => {
    expect(() => assertClubAccess(makeReq("SUPER_ADMIN", 1), 99)).not.toThrow();
    expect(() => assertClubAccess(makeReq("SUPER_ADMIN", null), null)).not.toThrow();
  });

  test("user.clubId 없으면 모든 역할 bypass", () => {
    expect(() => assertClubAccess(makeReq("ADMIN", null), 1)).not.toThrow();
    expect(() => assertClubAccess(makeReq("FRONT_OFFICE", undefined), 1)).not.toThrow();
  });

  test("clubId 일치하면 통과", () => {
    expect(() => assertClubAccess(makeReq("ADMIN", 1), 1)).not.toThrow();
    expect(() => assertClubAccess(makeReq("COACHING_STAFF", 2), 2)).not.toThrow();
  });

  test("clubId 불일치 → 404 NOT_FOUND", () => {
    expect(() => assertClubAccess(makeReq("ADMIN", 1), 2)).toThrow(
      expect.objectContaining({ statusCode: 404, code: "NOT_FOUND" })
    );
  });

  test("targetClubId null → 404 NOT_FOUND (정보 노출 방지)", () => {
    expect(() => assertClubAccess(makeReq("ADMIN", 1), null)).toThrow(
      expect.objectContaining({ statusCode: 404, code: "NOT_FOUND" })
    );
  });
});

describe("requireClubScope (Phase 2.5)", () => {
  const { requireClubScope } = require("../../src/lib/permissions");
  const { AppError } = require("../../src/lib/appError");

  const mkUser = (role: string, clubId: number | null) =>
    ({ id: 1, role, clubId } as any);

  test("clubId 있으면 그 값 반환", () => {
    expect(requireClubScope(mkUser("ADMIN", 7))).toBe(7);
  });

  test("SUPER_ADMIN + clubId=null → undefined (전 클럽 허용)", () => {
    expect(requireClubScope(mkUser("SUPER_ADMIN", null))).toBeUndefined();
  });

  test("SUPER_ADMIN + clubId 있으면 그 값 반환", () => {
    expect(requireClubScope(mkUser("SUPER_ADMIN", 3))).toBe(3);
  });

  test("일반 유저 + clubId=null → 403 CLUB_SCOPE_REQUIRED (bypass 차단)", () => {
    expect(() => requireClubScope(mkUser("PLAYER", null))).toThrow(
      expect.objectContaining({ statusCode: 403, code: "CLUB_SCOPE_REQUIRED" })
    );
  });

  test("ADMIN + clubId=null → 403 (ADMIN도 클럽 필수)", () => {
    expect(() => requireClubScope(mkUser("ADMIN", null))).toThrow(AppError);
  });
});
