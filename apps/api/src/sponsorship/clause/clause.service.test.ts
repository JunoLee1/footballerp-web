import { ClauseService } from "./clause.service";
import { AppError } from "../../lib/appError";
import type { ClauseRepository } from "./clause.repo";

const makeClause = (overrides: Record<string, unknown> = {}) => ({
  id: 1, sponsorshipId: "cmxtestspons0000000000001", type: "DISCOUNT", condition: "팬 도달 10만 초과 시",
  rate: 0.05, fixedAmount: null, status: "PENDING", createdAt: new Date(), ...overrides,
});

const makeRepo = (overrides: Partial<ClauseRepository> = {}): ClauseRepository => ({
  create: jest.fn().mockResolvedValue(makeClause()),
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  updateStatus: jest.fn(),
  copyPendingFrom: jest.fn().mockResolvedValue(0),
  ...overrides,
} as unknown as ClauseRepository);

const makeService = (repo: ClauseRepository) => new ClauseService(repo);

describe("ClauseService.applyClause", () => {
  it("throws 404 when clause not found", async () => {
    await expect(makeService(makeRepo()).applyClause(99, "cmxtestspons0000000000001")).rejects.toThrow(new AppError(404, "CLAUSE_NOT_FOUND"));
  });
  it("throws 404 when clause belongs to different sponsorship", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeClause({ sponsorshipId: "cmxtestspons0000000000001" })) });
    await expect(makeService(repo).applyClause(1, "cmxtestspons0000000000001")).rejects.toThrow(new AppError(404, "CLAUSE_NOT_FOUND"));
  });
  it("throws 400 when already APPLIED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeClause({ status: "APPLIED" })) });
    await expect(makeService(repo).applyClause(1, "cmxtestspons0000000000001")).rejects.toThrow(new AppError(400, "CLAUSE_ALREADY_APPLIED"));
  });
  it("throws 400 when WAIVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeClause({ status: "WAIVED" })) });
    await expect(makeService(repo).applyClause(1, "cmxtestspons0000000000001")).rejects.toThrow(new AppError(400, "CLAUSE_ALREADY_APPLIED"));
  });
  it("calls updateStatus to APPLIED when valid", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeClause({ status: "PENDING" })),
      updateStatus: jest.fn().mockResolvedValue(makeClause({ status: "APPLIED" })),
    });
    await makeService(repo).applyClause(1, "cmxtestspons0000000000001");
    expect(repo.updateStatus).toHaveBeenCalledWith(1, "APPLIED");
  });
});

describe("ClauseService.waiveClause", () => {
  it("throws 404 when clause not found", async () => {
    await expect(makeService(makeRepo()).waiveClause(99, "cmxtestspons0000000000001")).rejects.toThrow(new AppError(404, "CLAUSE_NOT_FOUND"));
  });
  it("throws 404 when clause belongs to different sponsorship", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeClause({ sponsorshipId: "cmxtestspons0000000000001" })) });
    await expect(makeService(repo).waiveClause(1, "cmxtestspons0000000000001")).rejects.toThrow(new AppError(404, "CLAUSE_NOT_FOUND"));
  });
  it("throws 400 when not PENDING", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeClause({ status: "APPLIED" })) });
    await expect(makeService(repo).waiveClause(1, "cmxtestspons0000000000001")).rejects.toThrow(new AppError(400, "CLAUSE_NOT_PENDING"));
  });
  it("calls updateStatus to WAIVED when valid", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeClause({ status: "PENDING" })),
      updateStatus: jest.fn().mockResolvedValue(makeClause({ status: "WAIVED" })),
    });
    await makeService(repo).waiveClause(1, "cmxtestspons0000000000001");
    expect(repo.updateStatus).toHaveBeenCalledWith(1, "WAIVED");
  });
});

describe("ClauseService.copyFrom", () => {
  it("throws 400 when source and target are the same", async () => {
    await expect(makeService(makeRepo()).copyFrom("cmxtestspons0000000000001", "cmxtestspons0000000000001")).rejects.toThrow(new AppError(400, "SAME_SPONSORSHIP"));
  });

  it("returns copied count of 0 when source has no pending clauses", async () => {
    const result = await makeService(makeRepo()).copyFrom("cmxtestspons0000000000001", "cmxtestspons0000000000002");
    expect(result).toEqual({ copied: 0 });
  });

  it("calls copyPendingFrom and returns count", async () => {
    const repo = makeRepo({ copyPendingFrom: jest.fn().mockResolvedValue(3) });
    const result = await makeService(repo).copyFrom("cmxtestspons0000000000001", "cmxtestspons0000000000002");
    expect(repo.copyPendingFrom).toHaveBeenCalledWith("cmxtestspons0000000000002", "cmxtestspons0000000000001");
    expect(result).toEqual({ copied: 3 });
  });
});
