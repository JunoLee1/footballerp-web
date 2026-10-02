import { CertificationService } from "../../src/certification/certification.service";
import { AppError } from "../../src/lib/appError";
import type { CertificationRepository } from "../../src/certification/certification.repo";

const makeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  certType: "PLAYER_HEALTH_CHECK",
  entityType: "PLAYER",
  status: "DRAFT",
  isLocked: false,
  reminderDays: [90, 60, 30],
  reminders: [],
  ...overrides,
});

const makeRepo = (overrides: Partial<CertificationRepository> = {}): CertificationRepository => ({
  findAll:    jest.fn().mockResolvedValue([]),
  findById:   jest.fn().mockResolvedValue(null),
  create:     jest.fn(),
  update:     jest.fn(),
  submit:     jest.fn(),
  resubmit:   jest.fn(),
  approve:    jest.fn(),
  gmApprove:  jest.fn(),
  reject:     jest.fn(),
  suspend:    jest.fn(),
  cancel:     jest.fn(),
  ...overrides,
} as unknown as CertificationRepository);

const makeService = (repo: CertificationRepository) => new CertificationService(repo);

describe("CertificationService.submit", () => {
  it("throws 404 when cert not found", async () => {
    await expect(makeService(makeRepo()).submit(1))
      .rejects.toThrow(new AppError(404, "CERTIFICATION_NOT_FOUND"));
  });

  it("throws 409 when status is PENDING_REVIEW", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ status: "PENDING_REVIEW" })) });
    await expect(makeService(repo).submit(1))
      .rejects.toThrow(new AppError(409, "CERTIFICATION_NOT_SUBMITTABLE"));
  });

  it("calls resubmit when status is REJECTED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ status: "REJECTED" })),
      resubmit: jest.fn().mockResolvedValue(makeRecord({ status: "PENDING_REVIEW" })),
    });
    await makeService(repo).submit(1);
    expect(repo.resubmit).toHaveBeenCalledWith(1);
  });

  it("calls submit when status is DRAFT", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ status: "DRAFT" })),
      submit:   jest.fn().mockResolvedValue(makeRecord({ status: "PENDING_REVIEW" })),
    });
    await makeService(repo).submit(1);
    expect(repo.submit).toHaveBeenCalledWith(1);
  });
});

describe("CertificationService.approve", () => {
  const APPROVER_ID = "22222222-2222-2222-2222-222222222222";

  it("throws 404 when cert not found", async () => {
    await expect(makeService(makeRepo()).approve(1, APPROVER_ID))
      .rejects.toThrow(new AppError(404, "CERTIFICATION_NOT_FOUND"));
  });

  it("throws 409 when not in PENDING_REVIEW", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ status: "DRAFT" })) });
    await expect(makeService(repo).approve(1, APPROVER_ID))
      .rejects.toThrow(new AppError(409, "CERTIFICATION_NOT_PENDING"));
  });

  it("approves when status is PENDING_REVIEW", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ status: "PENDING_REVIEW" })),
      approve:  jest.fn().mockResolvedValue(makeRecord({ status: "FM_APPROVED" })),
    });
    await makeService(repo).approve(1, APPROVER_ID);
    expect(repo.approve).toHaveBeenCalledWith(1, APPROVER_ID);
  });
});

describe("CertificationService.gmApprove", () => {
  const GM_APPROVER_ID = "33333333-3333-3333-3333-333333333333";

  it("throws 409 when not FM_APPROVED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ status: "PENDING_REVIEW" })) });
    await expect(makeService(repo).gmApprove(1, GM_APPROVER_ID))
      .rejects.toThrow(new AppError(409, "CERTIFICATION_NOT_FM_APPROVED"));
  });

  it("gmApproves when status is FM_APPROVED", async () => {
    const repo = makeRepo({
      findById:  jest.fn().mockResolvedValue(makeRecord({ status: "FM_APPROVED" })),
      gmApprove: jest.fn().mockResolvedValue(makeRecord({ status: "VALID", isLocked: true })),
    });
    await makeService(repo).gmApprove(1, GM_APPROVER_ID);
    expect(repo.gmApprove).toHaveBeenCalledWith(1, GM_APPROVER_ID);
  });
});

describe("CertificationService.reject", () => {
  it("throws 409 when status is DRAFT", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ status: "DRAFT" })) });
    await expect(makeService(repo).reject(1, { reason: "invalid" }))
      .rejects.toThrow(new AppError(409, "CERTIFICATION_NOT_REJECTABLE"));
  });

  it("rejects when status is PENDING_REVIEW", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ status: "PENDING_REVIEW" })),
      reject:   jest.fn().mockResolvedValue(makeRecord({ status: "REJECTED" })),
    });
    await makeService(repo).reject(1, { reason: "docs invalid" });
    expect(repo.reject).toHaveBeenCalledWith(1, "docs invalid");
  });
});

describe("CertificationService.update", () => {
  it("throws 400 when cert is locked", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ isLocked: true })) });
    await expect(makeService(repo).update(1, {}))
      .rejects.toThrow(new AppError(400, "CERTIFICATION_LOCKED"));
  });

  it("throws 409 when status is VALID", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ status: "VALID" })) });
    await expect(makeService(repo).update(1, {}))
      .rejects.toThrow(new AppError(409, "CERTIFICATION_NOT_EDITABLE"));
  });

  it("updates when status is DRAFT", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeRecord({ status: "DRAFT" })),
      update:   jest.fn().mockResolvedValue(makeRecord({ issuingBody: "새 기관" })),
    });
    await makeService(repo).update(1, { issuingBody: "새 기관" });
    expect(repo.update).toHaveBeenCalledWith(1, { issuingBody: "새 기관" });
  });
});

describe("CertificationService.suspend", () => {
  it("throws 409 when already SUSPENDED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ status: "SUSPENDED" })) });
    await expect(makeService(repo).suspend(1))
      .rejects.toThrow(new AppError(409, "CERTIFICATION_ALREADY_INACTIVE"));
  });
});

describe("CertificationService.cancel", () => {
  it("throws 409 when already CANCELLED", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeRecord({ status: "CANCELLED" })) });
    await expect(makeService(repo).cancel(1))
      .rejects.toThrow(new AppError(409, "CERTIFICATION_ALREADY_CANCELLED"));
  });
});
