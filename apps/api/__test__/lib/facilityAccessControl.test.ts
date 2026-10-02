import { canAccessZone } from "../../src/lib/facilityAccessControl";

describe("canAccessZone", () => {
  describe("FRONT_OFFICE — 일반 (frontOfficeRole 없음)", () => {
    it("GROUND 허용", () => {
      expect(canAccessZone("FRONT_OFFICE", "GROUND")).toBe(true);
    });
    it("SAFETY 허용", () => {
      expect(canAccessZone("FRONT_OFFICE", "SAFETY")).toBe(true);
    });
    it("OPERATIONS 허용", () => {
      expect(canAccessZone("FRONT_OFFICE", "OPERATIONS")).toBe(true);
    });
    it("MECHANICAL 거부 (ASSET_MANAGER만 가능)", () => {
      expect(canAccessZone("FRONT_OFFICE", "MECHANICAL")).toBe(false);
    });
    it("STRUCTURAL 거부 (ASSET_MANAGER만 가능)", () => {
      expect(canAccessZone("FRONT_OFFICE", "STRUCTURAL")).toBe(false);
    });
    it("SANITATION 거부 (ASSET_MANAGER만 가능)", () => {
      expect(canAccessZone("FRONT_OFFICE", "SANITATION")).toBe(false);
    });
  });

  describe("FRONT_OFFICE — ASSET_MANAGER", () => {
    it("MECHANICAL 허용", () => {
      expect(canAccessZone("FRONT_OFFICE", "MECHANICAL", "ASSET_MANAGER")).toBe(true);
    });
    it("STRUCTURAL 허용", () => {
      expect(canAccessZone("FRONT_OFFICE", "STRUCTURAL", "ASSET_MANAGER")).toBe(true);
    });
    it("SANITATION 허용", () => {
      expect(canAccessZone("FRONT_OFFICE", "SANITATION", "ASSET_MANAGER")).toBe(true);
    });
    it("LOCKER_ROOM 거부 (COACHING_STAFF·PLAYER만)", () => {
      expect(canAccessZone("FRONT_OFFICE", "LOCKER_ROOM", "ASSET_MANAGER")).toBe(false);
    });
    it("MEDICAL_ROOM 거부 (COACHING_STAFF만)", () => {
      expect(canAccessZone("FRONT_OFFICE", "MEDICAL_ROOM", "ASSET_MANAGER")).toBe(false);
    });
  });

  describe("다른 역할", () => {
    it("ADMIN은 모든 구역 허용", () => {
      expect(canAccessZone("ADMIN", "LOCKER_ROOM")).toBe(true);
      expect(canAccessZone("ADMIN", "MEDICAL_ROOM")).toBe(true);
    });
    it("PLAYER는 LOCKER_ROOM 허용, MECHANICAL 거부", () => {
      expect(canAccessZone("PLAYER", "LOCKER_ROOM")).toBe(true);
      expect(canAccessZone("PLAYER", "MECHANICAL")).toBe(false);
    });
    it("COACHING_STAFF는 MEDICAL_ROOM 허용, SANITATION 거부", () => {
      expect(canAccessZone("COACHING_STAFF", "MEDICAL_ROOM")).toBe(true);
      expect(canAccessZone("COACHING_STAFF", "SANITATION")).toBe(false);
    });
  });
});
