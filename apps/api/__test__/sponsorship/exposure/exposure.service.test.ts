import { ExposureService } from "../../../src/sponsorship/exposure/exposure.service";
import { AppError } from "../../../src/lib/appError";
import type { ExposureRepository } from "../../../src/sponsorship/exposure/exposure.repo";

const makeEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 1, sponsorshipId: "cmxtestspons0000000000001", channel: "SNS",
  occurredAt: new Date("2026-08-17"), exposureCount: 5000,
  fanReach: 12000, mediaValue: "600000", notes: null,
  createdById: "55555555-5555-5555-5555-555555555555", createdAt: new Date(), ...overrides,
});

const makeRepo = (overrides: Partial<ExposureRepository> = {}): ExposureRepository => ({
  create: jest.fn().mockResolvedValue(makeEvent()),
  findAll: jest.fn().mockResolvedValue([]),
  ...overrides,
} as unknown as ExposureRepository);

const makeService = (repo: ExposureRepository) => new ExposureService(repo);

describe("ExposureService.create", () => {
  it("throws 400 when no metric provided", async () => {
    await expect(
      makeService(makeRepo()).create("cmxtestspons0000000000001", { channel: "TV", occurredAt: "2026-08-17" }, "55555555-5555-5555-5555-555555555555"),
    ).rejects.toThrow(new AppError(400, "EXPOSURE_METRIC_REQUIRED"));
  });

  it("creates event when valid", async () => {
    const repo = makeRepo({ create: jest.fn().mockResolvedValue(makeEvent()) });
    await makeService(repo).create("cmxtestspons0000000000001", { channel: "SNS", occurredAt: "2026-08-17", exposureCount: 5000 }, "55555555-5555-5555-5555-555555555555");
    expect(repo.create).toHaveBeenCalledWith("cmxtestspons0000000000001", expect.objectContaining({ channel: "SNS", createdById: "55555555-5555-5555-5555-555555555555" }));
  });

  it("does not throw when exposureCount is 0", async () => {
    const repo = makeRepo({ create: jest.fn().mockResolvedValue(makeEvent({ exposureCount: 0 })) });
    await expect(
      makeService(repo).create("cmxtestspons0000000000001", { channel: "SNS", occurredAt: "2026-08-17", exposureCount: 0 }, "55555555-5555-5555-5555-555555555555"),
    ).resolves.toBeDefined();
  });
});

describe("ExposureService.list", () => {
  it("returns empty array when no events", async () => {
    const result = await makeService(makeRepo()).list("cmxtestspons0000000000001");
    expect(result).toEqual([]);
  });

  it("returns events", async () => {
    const repo = makeRepo({ findAll: jest.fn().mockResolvedValue([makeEvent()]) });
    const result = await makeService(repo).list("cmxtestspons0000000000001");
    expect(result).toHaveLength(1);
  });
});
