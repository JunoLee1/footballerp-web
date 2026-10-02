import { PreventiveScheduleService } from "../../../src/facility/preventive-schedule/preventive-schedule.service";
import { AppError } from "../../../src/lib/appError";
import type { PreventiveScheduleRepository } from "../../../src/facility/preventive-schedule/preventive-schedule.repo";

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  facilityZone: "GROUND",
  title: "잔디 점검",
  intervalDays: 30,
  priority: "NORMAL",
  isActive: true,
  partnerId: null,
  lastGeneratedAt: null,
  ...overrides,
});

const makeRepo = (overrides: Partial<PreventiveScheduleRepository> = {}): PreventiveScheduleRepository => ({
  findAll:    jest.fn().mockResolvedValue([]),
  findById:   jest.fn().mockResolvedValue(null),
  create:     jest.fn(),
  update:     jest.fn(),
  deactivate: jest.fn(),
  findAllActive: jest.fn().mockResolvedValue([]),
  updateLastGeneratedAt: jest.fn(),
  ...overrides,
} as unknown as PreventiveScheduleRepository);

const makeService = (repo: PreventiveScheduleRepository) => new PreventiveScheduleService(repo);

describe("PreventiveScheduleService.get", () => {
  it("throws 404 when not found", async () => {
    await expect(makeService(makeRepo()).get(1))
      .rejects.toThrow(new AppError(404, "PREVENTIVE_SCHEDULE_NOT_FOUND"));
  });

  it("returns record when found", async () => {
    const record = makeRecord();
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(record) });
    const result = await makeService(repo).get(1);
    expect(result).toEqual(record);
  });
});

describe("PreventiveScheduleService.deactivate", () => {
  it("throws 404 when not found", async () => {
    await expect(makeService(makeRepo()).deactivate(99))
      .rejects.toThrow(new AppError(404, "PREVENTIVE_SCHEDULE_NOT_FOUND"));
  });

  it("throws 400 when already inactive", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ isActive: false })) });
    await expect(makeService(repo).deactivate(1))
      .rejects.toThrow(new AppError(400, "SCHEDULE_ALREADY_INACTIVE"));
  });

  it("calls repo.deactivate when valid", async () => {
    const repo = makeRepo({
      findById:   jest.fn().mockResolvedValue(makeRecord({ isActive: true })),
      deactivate: jest.fn().mockResolvedValue(makeRecord({ isActive: false })),
    });
    await makeService(repo).deactivate(1);
    expect(repo.deactivate).toHaveBeenCalledWith(1);
  });
});
