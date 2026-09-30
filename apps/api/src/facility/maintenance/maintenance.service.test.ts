import { MaintenanceService } from "./maintenance.service";
import { AppError } from "../../lib/appError";
import type { MaintenanceRepository } from "./maintenance.repo";

const makePrisma = (maintenanceCostLimit?: number) => ({
  clubSettings: {
    findUnique: jest.fn().mockResolvedValue(
      maintenanceCostLimit !== undefined ? { maintenanceCostLimit } : null
    ),
  },
} as any);

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: "Test maintenance",
  status: "RESOLVED",
  isLocked: false,
  estimatedCost: null,
  financeSubmittedAt: null,
  ...overrides,
});

const makeRepo = (overrides: Partial<MaintenanceRepository> = {}): MaintenanceRepository => ({
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  approve: jest.fn(),
  gmApprove: jest.fn(),
  reject: jest.fn(),
  lock: jest.fn().mockResolvedValue(makeRecord({ isLocked: true })),
  submitToFinance: jest.fn().mockResolvedValue(makeRecord({ financeSubmittedAt: new Date() })),
  ...overrides,
} as unknown as MaintenanceRepository);

describe("MaintenanceService.lock", () => {
  it("throws 404 when maintenance request is not found", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new MaintenanceService(repo, undefined as any, undefined as any, undefined as any);
    await expect(service.lock(1)).rejects.toThrow(new AppError(404, "MAINTENANCE_NOT_FOUND"));
  });

  it("throws 400 when locking an unresolved maintenance request", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ status: "IN_PROGRESS", isLocked: false })),
    });
    const service = new MaintenanceService(repo, undefined as any, undefined as any, undefined as any);
    await expect(service.lock(1)).rejects.toThrow(new AppError(400, "CANNOT_LOCK_UNRESOLVED"));
  });

  it("throws 400 when maintenance request is already locked", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ status: "RESOLVED", isLocked: true })),
    });
    const service = new MaintenanceService(repo, undefined as any, undefined as any, undefined as any);
    await expect(service.lock(1)).rejects.toThrow(new AppError(400, "MAINTENANCE_ALREADY_LOCKED"));
  });

  it("locks a resolved request successfully", async () => {
    const lockFn = jest.fn().mockResolvedValue(makeRecord({ isLocked: true }));
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ status: "RESOLVED", isLocked: false })),
      lock: lockFn,
    });
    const service = new MaintenanceService(repo, undefined as any, undefined as any, undefined as any);
    const result = await service.lock(1);
    expect(lockFn).toHaveBeenCalledWith(1);
    expect(result.isLocked).toBe(true);
  });
});

describe("MaintenanceService.submitToFinance", () => {
  it("throws 404 when maintenance request is not found", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new MaintenanceService(repo, undefined as any, undefined as any, makePrisma(1000000));
    await expect(service.submitToFinance(1, "55555555-5555-5555-5555-555555555555")).rejects.toThrow(new AppError(404, "MAINTENANCE_NOT_FOUND"));
  });

  it("throws 400 when submit-finance called with cost below threshold from ClubSettings", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ estimatedCost: 500000, financeSubmittedAt: null })),
    });
    const service = new MaintenanceService(repo, undefined as any, undefined as any, makePrisma(1000000));
    await expect(service.submitToFinance(1, "55555555-5555-5555-5555-555555555555")).rejects.toThrow(new AppError(400, "COST_BELOW_THRESHOLD"));
  });

  it("uses 1,000,000 as fallback limit when ClubSettings not found", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ estimatedCost: 500000, financeSubmittedAt: null })),
    });
    const service = new MaintenanceService(repo, undefined as any, undefined as any, makePrisma());
    await expect(service.submitToFinance(1, "55555555-5555-5555-5555-555555555555")).rejects.toThrow(new AppError(400, "COST_BELOW_THRESHOLD"));
  });

  it("throws 400 when already submitted to finance", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ estimatedCost: 2000000, financeSubmittedAt: new Date() })),
    });
    const service = new MaintenanceService(repo, undefined as any, undefined as any, makePrisma(1000000));
    await expect(service.submitToFinance(1, "55555555-5555-5555-5555-555555555555")).rejects.toThrow(new AppError(400, "ALREADY_SUBMITTED_TO_FINANCE"));
  });

  it("submits to finance and sends notification", async () => {
    const submitFn = jest.fn().mockResolvedValue(makeRecord({ financeSubmittedAt: new Date() }));
    const notifyFn = jest.fn().mockResolvedValue(undefined);
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ estimatedCost: 1500000, financeSubmittedAt: null })),
      submitToFinance: submitFn,
    });
    const notifications = { notifyFacilityFinanceSubmit: notifyFn } as any;
    const service = new MaintenanceService(repo, notifications, undefined as any, makePrisma(1000000));
    const result = await service.submitToFinance(1, "55555555-5555-5555-5555-555555555555");
    expect(submitFn).toHaveBeenCalledWith(1);
    expect(result.financeSubmittedAt).toBeDefined();
  });
});
