import { EmployeeContractService } from "../../src/employee-contract/employee-contract.service";
import { AppError } from "../../src/lib/appError";
import type { EmployeeContractRepository } from "../../src/employee-contract/employee-contract.repo";
import type { PrismaClient } from "../../src/generated/client";

jest.mock("../../src/lib/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const HR_ID = "00000000-0000-4000-8000-000000000100";
const DISPATCH_ID = 777;
const CONTRACT_ID = 42;

const fakeFile = {
  path: "/tmp/xyz",
  filename: "1735-contract.pdf",
  originalname: "근로계약서.pdf",
  size: 12345,
  gcsUrl: "/uploads/employee-contracts/1735-contract.pdf",
} as any;

const makeContract = (overrides: Partial<any> = {}) => ({
  id: CONTRACT_ID,
  hiringDispatchId: DISPATCH_ID,
  status: "DRAFT" as const,
  fileUrl: null,
  fileName: null,
  signedFileUrl: null,
  signedFileName: null,
  createdById: HR_ID,
  issuedById: null,
  issuedAt: null,
  signedAt: null,
  signedConfirmedById: null,
  signedConfirmedAt: null,
  cancelledById: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: new Date("2026-08-28T00:00:00Z"),
  updatedAt: new Date("2026-08-28T00:00:00Z"),
  createdBy: { id: HR_ID, username: "hr", nickname: "HR" },
  issuedBy: null,
  signedConfirmedBy: null,
  cancelledBy: null,
  ...overrides,
});

const makeRepo = (overrides: Partial<EmployeeContractRepository> = {}): EmployeeContractRepository =>
  ({
    createDraft: jest.fn().mockImplementation(async (data: any) =>
      makeContract({
        hiringDispatchId: data.hiringDispatchId,
        createdById: data.createdById,
      }),
    ),
    findById: jest.fn().mockResolvedValue(null),
    findLatestActiveByDispatch: jest.fn().mockResolvedValue(null),
    findAllByDispatch: jest.fn().mockResolvedValue([]),
    applyIssue: jest.fn().mockImplementation(async (id: number, data: any) =>
      makeContract({
        id,
        status: "ISSUED",
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        issuedById: data.issuedById,
        issuedAt: new Date(),
      }),
    ),
    applySign: jest.fn().mockImplementation(async (id: number, data: any) =>
      makeContract({
        id,
        status: "SIGNED",
        signedFileUrl: data.signedFileUrl,
        signedFileName: data.signedFileName,
        signedAt: data.signedAt,
        signedConfirmedById: data.signedConfirmedById,
        signedConfirmedAt: new Date(),
      }),
    ),
    applyCancel: jest.fn().mockImplementation(async (id: number, data: any) =>
      makeContract({
        id,
        status: "CANCELLED",
        cancelReason: data.cancelReason,
        cancelledById: data.cancelledById,
        cancelledAt: new Date(),
      }),
    ),
    ...overrides,
  } as unknown as EmployeeContractRepository);

const makePrisma = (overrides: any = {}): PrismaClient =>
  ({
    hiringDispatch: {
      findUnique: jest.fn().mockResolvedValue({ id: DISPATCH_ID }),
    },
    ...overrides,
  } as unknown as PrismaClient);

const makeService = (repo = makeRepo(), prisma = makePrisma()) =>
  new EmployeeContractService(repo, prisma);

// ────────────────────────────────────────────
// createDraft
// ────────────────────────────────────────────

describe("EmployeeContractService.createDraft", () => {
  it("creates a DRAFT row with createdById set", async () => {
    const repo = makeRepo();
    const result = await makeService(repo).createDraft(DISPATCH_ID, HR_ID);
    expect(result.status).toBe("DRAFT");
    expect(result.createdById).toBe(HR_ID);
    expect(repo.createDraft).toHaveBeenCalledWith({
      hiringDispatchId: DISPATCH_ID,
      createdById: HR_ID,
    });
  });

  it("rejects invalid dispatchId", async () => {
    await expect(makeService().createDraft(0, HR_ID)).rejects.toThrow(
      new AppError(400, "INVALID_DISPATCH_ID"),
    );
    await expect(makeService().createDraft(-1, HR_ID)).rejects.toThrow(
      new AppError(400, "INVALID_DISPATCH_ID"),
    );
  });

  it("rejects when dispatch not found", async () => {
    const prisma = makePrisma({
      hiringDispatch: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(makeService(makeRepo(), prisma).createDraft(999, HR_ID)).rejects.toThrow(
      new AppError(404, "DISPATCH_NOT_FOUND"),
    );
  });
});

// ────────────────────────────────────────────
// issue (DRAFT → ISSUED)
// ────────────────────────────────────────────

describe("EmployeeContractService.issue", () => {
  it("transitions DRAFT → ISSUED and stores file URL", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "DRAFT" })),
    });
    const result = await makeService(repo).issue(CONTRACT_ID, fakeFile, HR_ID);
    expect(result.status).toBe("ISSUED");
    expect(repo.applyIssue).toHaveBeenCalledWith(
      CONTRACT_ID,
      expect.objectContaining({
        fileUrl: `/uploads/employee-contracts/${fakeFile.filename}`,
        fileName: fakeFile.originalname,
        issuedById: HR_ID,
      }),
    );
  });

  it("throws 404 when contract not found", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    await expect(makeService(repo).issue(CONTRACT_ID, fakeFile, HR_ID)).rejects.toThrow(
      new AppError(404, "CONTRACT_NOT_FOUND"),
    );
  });

  it("throws INVALID_STATE_TRANSITION when contract is already ISSUED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "ISSUED" })),
    });
    await expect(
      makeService(repo).issue(CONTRACT_ID, fakeFile, HR_ID),
    ).rejects.toThrow(/INVALID_STATE_TRANSITION:ISSUED->ISSUED/);
  });

  it("throws INVALID_STATE_TRANSITION when contract is SIGNED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "SIGNED" })),
    });
    await expect(
      makeService(repo).issue(CONTRACT_ID, fakeFile, HR_ID),
    ).rejects.toThrow(/INVALID_STATE_TRANSITION:SIGNED->ISSUED/);
  });

  it("throws INVALID_STATE_TRANSITION when contract is CANCELLED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "CANCELLED" })),
    });
    await expect(
      makeService(repo).issue(CONTRACT_ID, fakeFile, HR_ID),
    ).rejects.toThrow(/INVALID_STATE_TRANSITION:CANCELLED->ISSUED/);
  });
});

// ────────────────────────────────────────────
// sign (ISSUED → SIGNED)
// ────────────────────────────────────────────

describe("EmployeeContractService.sign", () => {
  const signedAt = "2026-08-27T10:00:00Z";

  it("transitions ISSUED → SIGNED and stores signedFileUrl + signedAt", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "ISSUED" })),
    });
    const result = await makeService(repo).sign(CONTRACT_ID, fakeFile, { signedAt }, HR_ID);
    expect(result.status).toBe("SIGNED");
    expect(repo.applySign).toHaveBeenCalledWith(
      CONTRACT_ID,
      expect.objectContaining({
        signedFileUrl: `/uploads/employee-contracts/${fakeFile.filename}`,
        signedFileName: fakeFile.originalname,
        signedAt: new Date(signedAt),
        signedConfirmedById: HR_ID,
      }),
    );
  });

  it("throws SIGNED_AT_REQUIRED when signedAt is missing", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "ISSUED" })),
    });
    await expect(
      makeService(repo).sign(CONTRACT_ID, fakeFile, { signedAt: "" }, HR_ID),
    ).rejects.toThrow(new AppError(400, "SIGNED_AT_REQUIRED"));
    await expect(
      makeService(repo).sign(CONTRACT_ID, fakeFile, { signedAt: "   " }, HR_ID),
    ).rejects.toThrow(new AppError(400, "SIGNED_AT_REQUIRED"));
  });

  it("throws INVALID_SIGNED_AT when signedAt is unparseable", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "ISSUED" })),
    });
    await expect(
      makeService(repo).sign(CONTRACT_ID, fakeFile, { signedAt: "not-a-date" }, HR_ID),
    ).rejects.toThrow(new AppError(400, "INVALID_SIGNED_AT"));
  });

  it("throws INVALID_STATE_TRANSITION when contract is still DRAFT", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "DRAFT" })),
    });
    await expect(
      makeService(repo).sign(CONTRACT_ID, fakeFile, { signedAt }, HR_ID),
    ).rejects.toThrow(/INVALID_STATE_TRANSITION:DRAFT->SIGNED/);
  });

  it("throws INVALID_STATE_TRANSITION when contract already SIGNED", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "SIGNED" })),
    });
    await expect(
      makeService(repo).sign(CONTRACT_ID, fakeFile, { signedAt }, HR_ID),
    ).rejects.toThrow(/INVALID_STATE_TRANSITION:SIGNED->SIGNED/);
  });
});

// ────────────────────────────────────────────
// cancel (any → CANCELLED, non-CANCELLED start states)
// ────────────────────────────────────────────

describe("EmployeeContractService.cancel", () => {
  it("cancels a DRAFT contract with a reason", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "DRAFT" })),
    });
    const result = await makeService(repo).cancel(
      CONTRACT_ID,
      { cancelReason: "지원자 사퇴" },
      HR_ID,
    );
    expect(result.status).toBe("CANCELLED");
    expect(repo.applyCancel).toHaveBeenCalledWith(
      CONTRACT_ID,
      expect.objectContaining({ cancelReason: "지원자 사퇴", cancelledById: HR_ID }),
    );
  });

  it("cancels an ISSUED contract with a reason", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "ISSUED" })),
    });
    const result = await makeService(repo).cancel(
      CONTRACT_ID,
      { cancelReason: "조건 재협상" },
      HR_ID,
    );
    expect(result.status).toBe("CANCELLED");
  });

  it("cancels a SIGNED contract with a reason", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "SIGNED" })),
    });
    const result = await makeService(repo).cancel(
      CONTRACT_ID,
      { cancelReason: "발령 취소" },
      HR_ID,
    );
    expect(result.status).toBe("CANCELLED");
  });

  it("rejects re-cancel of a CANCELLED contract", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "CANCELLED" })),
    });
    await expect(
      makeService(repo).cancel(CONTRACT_ID, { cancelReason: "again" }, HR_ID),
    ).rejects.toThrow(new AppError(409, "ALREADY_CANCELLED"));
  });

  it("requires a non-empty reason", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "DRAFT" })),
    });
    await expect(
      makeService(repo).cancel(CONTRACT_ID, { cancelReason: "" }, HR_ID),
    ).rejects.toThrow(new AppError(400, "CANCEL_REASON_REQUIRED"));
    await expect(
      makeService(repo).cancel(CONTRACT_ID, { cancelReason: "   " }, HR_ID),
    ).rejects.toThrow(new AppError(400, "CANCEL_REASON_REQUIRED"));
  });

  it("rejects a reason exceeding 2000 chars", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeContract({ status: "DRAFT" })),
    });
    await expect(
      makeService(repo).cancel(CONTRACT_ID, { cancelReason: "a".repeat(2001) }, HR_ID),
    ).rejects.toThrow(new AppError(400, "CANCEL_REASON_TOO_LONG"));
  });

  it("404 when contract not found", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    await expect(
      makeService(repo).cancel(CONTRACT_ID, { cancelReason: "reason" }, HR_ID),
    ).rejects.toThrow(new AppError(404, "CONTRACT_NOT_FOUND"));
  });
});

// ────────────────────────────────────────────
// listByDispatch
// ────────────────────────────────────────────

describe("EmployeeContractService.listByDispatch", () => {
  it("returns rows from repo, newest first", async () => {
    const older = makeContract({ id: 1, createdAt: new Date("2026-08-01") });
    const newer = makeContract({ id: 2, createdAt: new Date("2026-08-20") });
    const repo = makeRepo({
      findAllByDispatch: jest.fn().mockResolvedValue([newer, older]),
    });
    const result = await makeService(repo).listByDispatch(DISPATCH_ID);
    expect(result.map((r: any) => r.id)).toEqual([2, 1]);
  });
});

// ────────────────────────────────────────────
// assertContractSigned — EXECUTION gate helper
// ────────────────────────────────────────────

describe("EmployeeContractService.assertContractSigned", () => {
  it("passes when latest active contract is SIGNED", async () => {
    const repo = makeRepo({
      findLatestActiveByDispatch: jest
        .fn()
        .mockResolvedValue(makeContract({ status: "SIGNED" })),
    });
    await expect(makeService(repo).assertContractSigned(DISPATCH_ID)).resolves.toBeUndefined();
  });

  it("throws CONTRACT_NOT_ISSUED when no active contract exists", async () => {
    const repo = makeRepo({
      findLatestActiveByDispatch: jest.fn().mockResolvedValue(null),
    });
    await expect(makeService(repo).assertContractSigned(DISPATCH_ID)).rejects.toThrow(
      new AppError(400, "CONTRACT_NOT_ISSUED"),
    );
  });

  it("throws CONTRACT_NOT_SIGNED:DRAFT when latest active is DRAFT", async () => {
    const repo = makeRepo({
      findLatestActiveByDispatch: jest
        .fn()
        .mockResolvedValue(makeContract({ status: "DRAFT" })),
    });
    await expect(makeService(repo).assertContractSigned(DISPATCH_ID)).rejects.toThrow(
      /CONTRACT_NOT_SIGNED:DRAFT/,
    );
  });

  it("throws CONTRACT_NOT_SIGNED:ISSUED when latest active is ISSUED", async () => {
    const repo = makeRepo({
      findLatestActiveByDispatch: jest
        .fn()
        .mockResolvedValue(makeContract({ status: "ISSUED" })),
    });
    await expect(makeService(repo).assertContractSigned(DISPATCH_ID)).rejects.toThrow(
      /CONTRACT_NOT_SIGNED:ISSUED/,
    );
  });

  it("error shape: AppError instance, 400, code starts with CONTRACT_NOT_SIGNED:", async () => {
    const repo = makeRepo({
      findLatestActiveByDispatch: jest
        .fn()
        .mockResolvedValue(makeContract({ status: "ISSUED" })),
    });
    try {
      await makeService(repo).assertContractSigned(DISPATCH_ID);
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("CONTRACT_NOT_SIGNED:ISSUED");
    }
  });
});
