import { canReadPayroll, canWritePayroll } from "../../src/lib/permissions";

describe("canReadPayroll", () => {
  it("ADMIN 통과", () => {
    expect(canReadPayroll("ADMIN", null, [])).toBe(true);
  });
  it("SUPER_ADMIN 통과", () => {
    expect(canReadPayroll("SUPER_ADMIN", null, [])).toBe(true);
  });
  it("GM 통과", () => {
    expect(canReadPayroll("GM", null, [])).toBe(true);
  });
  it("FRONT_OFFICE + FINANCE_MANAGER 통과", () => {
    expect(canReadPayroll("FRONT_OFFICE", "FINANCE_MANAGER", [])).toBe(true);
  });
  it("FRONT_OFFICE + FINANCE_STAFF 통과 (canReadFinance)", () => {
    expect(canReadPayroll("FRONT_OFFICE", "FINANCE_STAFF", [])).toBe(true);
  });
  it("FRONT_OFFICE + HR_MANAGER 통과", () => {
    expect(canReadPayroll("FRONT_OFFICE", "HR_MANAGER", [])).toBe(true);
  });
  it("FRONT_OFFICE + HR_STAFF 통과", () => {
    expect(canReadPayroll("FRONT_OFFICE", "HR_STAFF", [])).toBe(true);
  });
  it("deptCategories 에 FINANCE 포함 → 통과", () => {
    expect(canReadPayroll("COACHING_STAFF", null, ["FINANCE"])).toBe(true);
  });
  it("deptCategories 에 HR 포함 → 통과", () => {
    expect(canReadPayroll("COACHING_STAFF", null, ["HR"])).toBe(true);
  });
  it("PLAYER 차단", () => {
    expect(canReadPayroll("PLAYER", null, [])).toBe(false);
  });
  it("FRONT_OFFICE + ASSET_MANAGER 차단", () => {
    expect(canReadPayroll("FRONT_OFFICE", "ASSET_MANAGER", [])).toBe(false);
  });
  it("COACHING_STAFF (dept 없음) 차단", () => {
    expect(canReadPayroll("COACHING_STAFF", null, [])).toBe(false);
  });
});

describe("canWritePayroll", () => {
  it("ADMIN 통과", () => {
    expect(canWritePayroll("ADMIN", null, [])).toBe(true);
  });
  it("GM 통과", () => {
    expect(canWritePayroll("GM", null, [])).toBe(true);
  });
  it("FRONT_OFFICE + FINANCE_MANAGER 통과", () => {
    expect(canWritePayroll("FRONT_OFFICE", "FINANCE_MANAGER", [])).toBe(true);
  });
  it("FRONT_OFFICE + HR_MANAGER 통과", () => {
    expect(canWritePayroll("FRONT_OFFICE", "HR_MANAGER", [])).toBe(true);
  });
  it("FRONT_OFFICE + FINANCE_STAFF 차단 (canWriteFinance 는 MANAGER 만)", () => {
    expect(canWritePayroll("FRONT_OFFICE", "FINANCE_STAFF", [])).toBe(false);
  });
  it("FRONT_OFFICE + HR_STAFF 차단 (canWriteHR 은 MANAGER 만)", () => {
    expect(canWritePayroll("FRONT_OFFICE", "HR_STAFF", [])).toBe(false);
  });
  it("PLAYER 차단", () => {
    expect(canWritePayroll("PLAYER", null, [])).toBe(false);
  });
});
