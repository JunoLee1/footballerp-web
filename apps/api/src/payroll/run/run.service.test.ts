import { RunService } from "./run.service";
import { AppError } from "../../lib/appError";
import type { RunRepository } from "./run.repo";
import type { PrismaClient } from "../../generated/client";

const makeRepo = (overrides: Partial<RunRepository> = {}): RunRepository => ({
  findById: jest.fn().mockResolvedValue(null),
  ...overrides,
} as unknown as RunRepository);

const makePrisma = (overrides: Partial<PrismaClient> = {}): PrismaClient =>
  overrides as unknown as PrismaClient;

const APPROVER_ID = "99999999-9999-9999-9999-999999999999";
const OTHER_ID = "55555555-5555-5555-5555-555555555555";

describe("RunService.secondApproveRun", () => {
  it("throws 404 when run is not found", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new RunService(repo, undefined as any, undefined as any, undefined as any);
    await expect(service.secondApproveRun("salary-cuid-10", "run-cuid-01", APPROVER_ID))
      .rejects.toThrow(new AppError(404, "PAYROLL_RUN_NOT_FOUND"));
  });

  it("throws 400 when run is already locked", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue({ id: "run-cuid-01", staffSalaryId: "salary-cuid-10", status: "CONFIRMED", isLocked: true }),
    });
    const service = new RunService(repo, undefined as any, undefined as any, undefined as any);
    await expect(service.secondApproveRun("salary-cuid-10", "run-cuid-01", APPROVER_ID))
      .rejects.toThrow(new AppError(400, "PAYROLL_RUN_ALREADY_LOCKED"));
  });

  it("throws 400 when status is not CONFIRMED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue({ id: "run-cuid-01", staffSalaryId: "salary-cuid-10", status: "DRAFT", isLocked: false }),
    });
    const service = new RunService(repo, undefined as any, undefined as any, undefined as any);
    await expect(service.secondApproveRun("salary-cuid-10", "run-cuid-01", APPROVER_ID))
      .rejects.toThrow(new AppError(400, "PAYROLL_RUN_NOT_CONFIRMED"));
  });

  it("throws 403 when approver is the same as confirmer", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue({
        id: "run-cuid-01", staffSalaryId: "salary-cuid-10", status: "CONFIRMED", isLocked: false, confirmedById: APPROVER_ID,
      }),
    });
    const service = new RunService(repo, undefined as any, undefined as any, undefined as any);
    await expect(service.secondApproveRun("salary-cuid-10", "run-cuid-01", APPROVER_ID))
      .rejects.toThrow(new AppError(403, "CANNOT_SECOND_APPROVE_OWN_CONFIRMATION"));
  });

  it("atomically locks the run and creates a SALARY ledger entry with grossPay", async () => {
    const payrollUpdate = jest.fn().mockResolvedValue({
      id: 1, isLocked: true, secondApprovedById: APPROVER_ID, grossPay: 5_000_000,
    });
    const ledgerCreate = jest.fn().mockResolvedValue({ id: 10 });
    const mockTx = {
      payrollRun: { update: payrollUpdate },
      ledgerEntry: { create: ledgerCreate },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn: any) => fn(mockTx)),
    } as any);
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue({
        id: "run-cuid-01", staffSalaryId: "salary-cuid-10", status: "CONFIRMED", isLocked: false,
        confirmedById: OTHER_ID, grossPay: 5_000_000,
      }),
    });
    const service = new RunService(repo, undefined as any, undefined as any, prisma);
    const result = await service.secondApproveRun("salary-cuid-10", "run-cuid-01", APPROVER_ID);

    expect(payrollUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "run-cuid-01" },
      data: expect.objectContaining({ isLocked: true, secondApprovedById: APPROVER_ID }),
    }));
    expect(ledgerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        category: "SALARY",
        amount: 5_000_000,
        amountKrw: 5_000_000,
        type: "EXPENSE",
      }),
    }));
    expect(result.isLocked).toBe(true);
  });
});
