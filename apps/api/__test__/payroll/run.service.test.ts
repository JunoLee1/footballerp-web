import { describe, test, expect, jest, beforeEach } from "@jest/globals";
import { RunService, computePayroll } from "../../src/payroll/run/run.service";
import { AppError } from "../../src/lib/appError";

// ── computePayroll 순수 함수 테스트 ──────────────────────────────

describe("computePayroll", () => {
  test("기본 계산: grossPay = baseSalary + allowancesTotal", () => {
    const result = computePayroll(3000000, 500000, []);
    expect(result.grossPay).toBe(3500000);
    expect(result.totalDeductions).toBe(0);
    expect(result.netPay).toBe(3500000);
  });

  test("공제액 = grossPay × 각 요율 합산", () => {
    // KR 예: 국민연금 4.5% + 건강보험 3.545%
    const result = computePayroll(1000000, 0, [
      { employeeRate: 0.045 },
      { employeeRate: 0.03545 },
    ]);
    expect(result.grossPay).toBe(1000000);
    expect(result.totalDeductions).toBeCloseTo(80450, 0);
    expect(result.netPay).toBeCloseTo(919550, 0);
  });

  test("소수점 반올림 처리 — netPay가 toFixed(2) 적용", () => {
    const result = computePayroll(1000001, 0, [{ employeeRate: 0.1 }]);
    expect(result.totalDeductions).toBe(100000.1);
    expect(result.netPay).toBe(900000.9);
  });
});

// ── RunService 테스트 ──────────────────────────────────────────────

const mockRunRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByMonth: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
} as any;

const mockSalaryRepo = {
  findById: jest.fn(),
} as any;

const mockConfigRepo = {
  findActiveForCountry: jest.fn(),
} as any;

const service = new RunService(mockRunRepo, mockSalaryRepo, mockConfigRepo);

beforeEach(() => jest.clearAllMocks());

describe("RunService.list", () => {
  test("salary 없으면 404를 던진다", async () => {
    mockSalaryRepo.findById.mockResolvedValue(null);
    await expect(service.list(99)).rejects.toMatchObject({
      statusCode: 404,
      code: "SALARY_NOT_FOUND",
    });
  });
});

describe("RunService.createRun", () => {
  test("salary 없으면 404를 던진다", async () => {
    mockSalaryRepo.findById.mockResolvedValue(null);
    await expect(service.createRun(99, { month: "2026-08-01" })).rejects.toMatchObject({
      statusCode: 404,
      code: "SALARY_NOT_FOUND",
    });
  });

  test("해당 country에 활성 config 없으면 422를 던진다", async () => {
    mockSalaryRepo.findById.mockResolvedValue({
      id: 1,
      baseSalary: { toNumber: () => 3000000 },
      country: "KR",
      allowances: [],
    });
    mockRunRepo.findByMonth.mockResolvedValue(null);
    mockConfigRepo.findActiveForCountry.mockResolvedValue([]);
    await expect(service.createRun(1, { month: "2026-08-01" })).rejects.toMatchObject({
      statusCode: 422,
      code: "NO_PAYROLL_CONFIG_FOR_COUNTRY",
    });
  });

  test("같은 달 run이 이미 있으면 409를 던진다", async () => {
    mockSalaryRepo.findById.mockResolvedValue({
      id: 1,
      baseSalary: { toNumber: () => 3000000 },
      country: "KR",
      allowances: [],
    });
    mockRunRepo.findByMonth.mockResolvedValue({ id: 7 });
    await expect(service.createRun(1, { month: "2026-08-01" })).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYROLL_RUN_ALREADY_EXISTS",
    });
  });

  test("성공 시 계산된 값으로 run.create를 호출한다", async () => {
    mockSalaryRepo.findById.mockResolvedValue({
      id: 1,
      baseSalary: { toNumber: () => 3000000 },
      country: "KR",
      allowances: [{ amount: { toNumber: () => 500000 } }],
    });
    mockRunRepo.findByMonth.mockResolvedValue(null);
    mockConfigRepo.findActiveForCountry.mockResolvedValue([
      { employeeRate: { toNumber: () => 0.045 } },
    ]);
    mockRunRepo.create.mockResolvedValue({ id: 1 });

    await service.createRun(1, { month: "2026-08-01" });

    expect(mockRunRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        staffSalaryId: 1,
        grossPay: 3500000,
        totalDeductions: 157500,
        netPay: 3342500,
      }),
    );
  });
});

describe("RunService.confirmRun", () => {
  test("run 없으면 404를 던진다", async () => {
    mockSalaryRepo.findById.mockResolvedValue({ id: 1 });
    mockRunRepo.findById.mockResolvedValue(null);
    await expect(service.confirmRun(1, 99, 10)).rejects.toMatchObject({
      statusCode: 404,
      code: "PAYROLL_RUN_NOT_FOUND",
    });
  });

  test("다른 salary 소속 run이면 404를 던진다", async () => {
    mockSalaryRepo.findById.mockResolvedValue({ id: 1 });
    mockRunRepo.findById.mockResolvedValue({ id: 5, staffSalaryId: 99, status: "DRAFT" });
    await expect(service.confirmRun(1, 5, 10)).rejects.toMatchObject({
      statusCode: 404,
      code: "PAYROLL_RUN_NOT_FOUND",
    });
  });

  test("이미 CONFIRMED이면 409를 던진다", async () => {
    mockSalaryRepo.findById.mockResolvedValue({ id: 1 });
    mockRunRepo.findById.mockResolvedValue({ id: 5, staffSalaryId: 1, status: "CONFIRMED" });
    await expect(service.confirmRun(1, 5, 10)).rejects.toMatchObject({
      statusCode: 409,
      code: "ALREADY_CONFIRMED",
    });
  });

  test("성공 시 confirmedById와 confirmedAt을 설정한다", async () => {
    mockSalaryRepo.findById.mockResolvedValue({ id: 1 });
    mockRunRepo.findById.mockResolvedValue({ id: 5, staffSalaryId: 1, status: "DRAFT" });
    mockRunRepo.update.mockResolvedValue({ id: 5, status: "CONFIRMED" });

    await service.confirmRun(1, 5, "00000000-0000-4000-8000-000000000010");

    expect(mockRunRepo.update).toHaveBeenCalledWith(5, {
      status: "CONFIRMED",
      confirmedById: "00000000-0000-4000-8000-000000000010",
      confirmedAt: expect.any(Date),
    });
  });
});
