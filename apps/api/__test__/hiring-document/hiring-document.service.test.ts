import { HiringDocumentService } from "../../src/hiring-document/hiring-document.service";
import { AppError } from "../../src/lib/appError";
import type { HiringDocumentRepository } from "../../src/hiring-document/hiring-document.repo";
import type { PrismaClient } from "../../src/generated/client";

jest.mock("../../src/lib/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const HR_ID = "00000000-0000-4000-8000-000000000100";
const APPLICATION_ID = 555;
const DISPATCH_ID = 777;

const fakeFile = {
  path: "/tmp/xyz",
  filename: "1735-scan.pdf",
  originalname: "신분증.pdf",
  size: 12345,
  gcsUrl: "/uploads/hiring-documents/1735-scan.pdf",
} as any;

const makeDoc = (overrides: Partial<any> = {}) => ({
  id: 1,
  applicationId: APPLICATION_ID,
  hiringDispatchId: null,
  docType: "신분증",
  fileUrl: "/uploads/hiring-documents/1735-scan.pdf",
  fileName: "신분증.pdf",
  fileSize: 12345,
  status: "PENDING",
  uploadedById: HR_ID,
  uploadedAt: new Date(),
  reviewedById: null,
  reviewedAt: null,
  reviewNotes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  uploadedBy: { id: HR_ID, username: "hr", nickname: "HR" },
  reviewedBy: null,
  ...overrides,
});

const makeRepo = (overrides: Partial<HiringDocumentRepository> = {}): HiringDocumentRepository =>
  ({
    create: jest.fn().mockImplementation(async (data: any) =>
      makeDoc({
        applicationId: data.applicationId ?? null,
        hiringDispatchId: data.hiringDispatchId ?? null,
        docType: data.docType,
        uploadedById: data.uploadedById,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileUrl: data.fileUrl,
      }),
    ),
    findById: jest.fn().mockResolvedValue(null),
    updateReview: jest.fn().mockImplementation(async (id: number, data: any) =>
      makeDoc({
        id,
        status: data.status,
        reviewedById: data.reviewerId,
        reviewedAt: new Date(),
        reviewNotes: data.reviewNotes,
      }),
    ),
    findAllByTarget: jest.fn().mockResolvedValue([]),
    findHistoryByDocType: jest.fn().mockResolvedValue([]),
    findLatestPerDocType: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as HiringDocumentRepository);

const makePrisma = (overrides: any = {}): PrismaClient =>
  ({
    jobApplication: {
      findUnique: jest.fn().mockResolvedValue({ id: APPLICATION_ID }),
    },
    hiringDispatch: {
      findUnique: jest.fn().mockResolvedValue({ id: DISPATCH_ID }),
    },
    ...overrides,
  } as unknown as PrismaClient);

const makeService = (repo = makeRepo(), prisma = makePrisma()) =>
  new HiringDocumentService(repo, prisma);

// ────────────────────────────────────────────
// upload
// ────────────────────────────────────────────

describe("HiringDocumentService.upload", () => {
  it("creates PENDING row when target = application", async () => {
    const repo = makeRepo();
    const result = await makeService(repo).upload(
      { applicationId: APPLICATION_ID, docType: "신분증" },
      fakeFile,
      HR_ID,
    );
    expect(result.status).toBe("PENDING");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: APPLICATION_ID,
        docType: "신분증",
        fileUrl: "/uploads/hiring-documents/1735-scan.pdf",
        fileName: "신분증.pdf",
        fileSize: 12345,
        uploadedById: HR_ID,
      }),
    );
  });

  it("creates PENDING row when target = dispatch (Application-free)", async () => {
    const repo = makeRepo();
    const result = await makeService(repo).upload(
      { hiringDispatchId: DISPATCH_ID, docType: "통장사본" },
      fakeFile,
      HR_ID,
    );
    expect(result.hiringDispatchId).toBe(DISPATCH_ID);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ hiringDispatchId: DISPATCH_ID, docType: "통장사본" }),
    );
  });

  it("trims docType before persisting (Q10)", async () => {
    const repo = makeRepo();
    await makeService(repo).upload(
      { applicationId: APPLICATION_ID, docType: "  신분증  " },
      fakeFile,
      HR_ID,
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ docType: "신분증" }),
    );
  });

  it("throws XOR_TARGET_REQUIRED when neither target given", async () => {
    await expect(
      makeService().upload({ docType: "신분증" }, fakeFile, HR_ID),
    ).rejects.toThrow(new AppError(400, "XOR_TARGET_REQUIRED"));
  });

  it("throws XOR_TARGET_REQUIRED when both targets given", async () => {
    await expect(
      makeService().upload(
        { applicationId: APPLICATION_ID, hiringDispatchId: DISPATCH_ID, docType: "신분증" },
        fakeFile,
        HR_ID,
      ),
    ).rejects.toThrow(new AppError(400, "XOR_TARGET_REQUIRED"));
  });

  it("throws DOC_TYPE_REQUIRED when docType is whitespace-only", async () => {
    await expect(
      makeService().upload({ applicationId: APPLICATION_ID, docType: "   " }, fakeFile, HR_ID),
    ).rejects.toThrow(new AppError(400, "DOC_TYPE_REQUIRED"));
  });

  it("throws APPLICATION_NOT_FOUND when application missing", async () => {
    const prisma = makePrisma({
      jobApplication: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      makeService(makeRepo(), prisma).upload(
        { applicationId: APPLICATION_ID, docType: "신분증" },
        fakeFile,
        HR_ID,
      ),
    ).rejects.toThrow(new AppError(404, "APPLICATION_NOT_FOUND"));
  });

  it("throws DISPATCH_NOT_FOUND when dispatch missing", async () => {
    const prisma = makePrisma({
      hiringDispatch: { findUnique: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      makeService(makeRepo(), prisma).upload(
        { hiringDispatchId: DISPATCH_ID, docType: "신분증" },
        fakeFile,
        HR_ID,
      ),
    ).rejects.toThrow(new AppError(404, "DISPATCH_NOT_FOUND"));
  });
});

// ────────────────────────────────────────────
// review
// ────────────────────────────────────────────

describe("HiringDocumentService.review", () => {
  it("PENDING → APPROVED writes reviewer + timestamp", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeDoc({ status: "PENDING" })),
    });
    const result = await makeService(repo).review(1, { status: "APPROVED" }, "00000000-0000-4000-8000-000000000200");
    expect(result.status).toBe("APPROVED");
    expect(repo.updateReview).toHaveBeenCalledWith(1, {
      status: "APPROVED",
      reviewerId: "00000000-0000-4000-8000-000000000200",
      reviewNotes: null,
    });
  });

  it("PENDING → REJECTED requires reviewNotes", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeDoc({ status: "PENDING" })),
    });
    await expect(
      makeService(repo).review(1, { status: "REJECTED" }, "00000000-0000-4000-8000-000000000200"),
    ).rejects.toThrow(new AppError(400, "REVIEW_NOTES_REQUIRED"));
    await expect(
      makeService(repo).review(1, { status: "REJECTED", reviewNotes: "   " }, "00000000-0000-4000-8000-000000000200"),
    ).rejects.toThrow(new AppError(400, "REVIEW_NOTES_REQUIRED"));
  });

  it("REJECTED with notes succeeds and stores trimmed notes", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeDoc({ status: "PENDING" })),
    });
    await makeService(repo).review(
      1,
      { status: "REJECTED", reviewNotes: "  잘못된 문서  " },
      "00000000-0000-4000-8000-000000000200",
    );
    expect(repo.updateReview).toHaveBeenCalledWith(1, {
      status: "REJECTED",
      reviewerId: "00000000-0000-4000-8000-000000000200",
      reviewNotes: "잘못된 문서",
    });
  });

  it("throws DOCUMENT_NOT_FOUND when doc missing", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    await expect(
      makeService(repo).review(999, { status: "APPROVED" }, "00000000-0000-4000-8000-000000000200"),
    ).rejects.toThrow(new AppError(404, "DOCUMENT_NOT_FOUND"));
  });

  it("throws DOCUMENT_NOT_PENDING for a settled row (idempotency)", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(makeDoc({ status: "APPROVED" })),
    });
    await expect(
      makeService(repo).review(1, { status: "REJECTED", reviewNotes: "재검토" }, "00000000-0000-4000-8000-000000000200"),
    ).rejects.toThrow(new AppError(409, "DOCUMENT_NOT_PENDING"));
  });

  it("throws INVALID_REVIEW_STATUS when status is neither APPROVED nor REJECTED", async () => {
    await expect(
      makeService().review(1, { status: "PENDING" as any }, "00000000-0000-4000-8000-000000000200"),
    ).rejects.toThrow(new AppError(400, "INVALID_REVIEW_STATUS"));
  });

  it("throws REVIEW_NOTES_TOO_LONG when notes exceed 2000 chars", async () => {
    await expect(
      makeService().review(1, { status: "APPROVED", reviewNotes: "x".repeat(2001) }, "00000000-0000-4000-8000-000000000200"),
    ).rejects.toThrow(new AppError(400, "REVIEW_NOTES_TOO_LONG"));
  });
});

// ────────────────────────────────────────────
// list
// ────────────────────────────────────────────

describe("HiringDocumentService.listCurrent", () => {
  it("delegates to repo.findLatestPerDocType", async () => {
    const rows = [makeDoc({ docType: "신분증", status: "APPROVED" })];
    const repo = makeRepo({ findLatestPerDocType: jest.fn().mockResolvedValue(rows) });
    const result = await makeService(repo).listCurrent({ applicationId: APPLICATION_ID });
    expect(result).toBe(rows);
    expect(repo.findLatestPerDocType).toHaveBeenCalledWith({ applicationId: APPLICATION_ID });
  });

  it("throws XOR_TARGET_REQUIRED when both/neither target given", async () => {
    await expect(makeService().listCurrent({})).rejects.toThrow(
      new AppError(400, "XOR_TARGET_REQUIRED"),
    );
  });
});

describe("HiringDocumentService.listHistory", () => {
  it("trims docType before lookup", async () => {
    const repo = makeRepo();
    await makeService(repo).listHistory({ applicationId: APPLICATION_ID }, "  통장사본  ");
    expect(repo.findHistoryByDocType).toHaveBeenCalledWith(
      { applicationId: APPLICATION_ID },
      "통장사본",
    );
  });

  it("throws DOC_TYPE_REQUIRED for empty docType", async () => {
    await expect(
      makeService().listHistory({ applicationId: APPLICATION_ID }, "   "),
    ).rejects.toThrow(new AppError(400, "DOC_TYPE_REQUIRED"));
  });
});

// ────────────────────────────────────────────
// assertRequiredDocsApproved (the EXECUTION gate)
// ────────────────────────────────────────────

describe("HiringDocumentService.assertRequiredDocsApproved", () => {
  it("no-op when required is empty (empty list = no gate)", async () => {
    const repo = makeRepo({ findLatestPerDocType: jest.fn() });
    await makeService(repo).assertRequiredDocsApproved(
      { applicationId: APPLICATION_ID },
      [],
    );
    expect(repo.findLatestPerDocType).not.toHaveBeenCalled();
  });

  it("no-op when required is all-whitespace (defensive trim)", async () => {
    const repo = makeRepo({ findLatestPerDocType: jest.fn() });
    await makeService(repo).assertRequiredDocsApproved(
      { applicationId: APPLICATION_ID },
      ["  ", ""],
    );
    expect(repo.findLatestPerDocType).not.toHaveBeenCalled();
  });

  it("passes when every required docType has a latest APPROVED row", async () => {
    const repo = makeRepo({
      findLatestPerDocType: jest.fn().mockResolvedValue([
        makeDoc({ docType: "신분증", status: "APPROVED" }),
        makeDoc({ docType: "통장사본", status: "APPROVED", id: 2 }),
      ]),
    });
    await expect(
      makeService(repo).assertRequiredDocsApproved(
        { applicationId: APPLICATION_ID },
        ["신분증", "통장사본"],
      ),
    ).resolves.toBeUndefined();
  });

  it("throws MISSING_APPROVED_DOCS when one required doc has no row at all", async () => {
    const repo = makeRepo({
      findLatestPerDocType: jest.fn().mockResolvedValue([
        makeDoc({ docType: "신분증", status: "APPROVED" }),
      ]),
    });
    await expect(
      makeService(repo).assertRequiredDocsApproved(
        { applicationId: APPLICATION_ID },
        ["신분증", "통장사본"],
      ),
    ).rejects.toThrow(/MISSING_APPROVED_DOCS.*통장사본/);
  });

  it("throws when the latest row is PENDING (not yet approved)", async () => {
    const repo = makeRepo({
      findLatestPerDocType: jest.fn().mockResolvedValue([
        makeDoc({ docType: "신분증", status: "PENDING" }),
      ]),
    });
    await expect(
      makeService(repo).assertRequiredDocsApproved(
        { applicationId: APPLICATION_ID },
        ["신분증"],
      ),
    ).rejects.toThrow(/MISSING_APPROVED_DOCS.*신분증/);
  });

  it("throws when the latest row is REJECTED (append-only latest wins)", async () => {
    const repo = makeRepo({
      findLatestPerDocType: jest.fn().mockResolvedValue([
        makeDoc({ docType: "신분증", status: "REJECTED" }),
      ]),
    });
    await expect(
      makeService(repo).assertRequiredDocsApproved(
        { applicationId: APPLICATION_ID },
        ["신분증"],
      ),
    ).rejects.toThrow(/MISSING_APPROVED_DOCS.*신분증/);
  });

  it("passes when a REJECTED row was replaced by a newer APPROVED row (append-only)", async () => {
    // findLatestPerDocType already returns the *latest* per docType — service
    // just filters to APPROVED. Simulating the "latest APPROVED wins" case.
    const repo = makeRepo({
      findLatestPerDocType: jest.fn().mockResolvedValue([
        makeDoc({ docType: "신분증", status: "APPROVED", id: 2 }),
      ]),
    });
    await expect(
      makeService(repo).assertRequiredDocsApproved(
        { applicationId: APPLICATION_ID },
        ["신분증"],
      ),
    ).resolves.toBeUndefined();
  });

  it("trim-normalizes both required and stored docType (defensive Q10 subset check)", async () => {
    const repo = makeRepo({
      findLatestPerDocType: jest.fn().mockResolvedValue([
        makeDoc({ docType: "신분증 ", status: "APPROVED" }),
      ]),
    });
    await expect(
      makeService(repo).assertRequiredDocsApproved(
        { applicationId: APPLICATION_ID },
        [" 신분증"],
      ),
    ).resolves.toBeUndefined();
  });

  it("uses dispatch target for Application-free path", async () => {
    const repo = makeRepo({
      findLatestPerDocType: jest.fn().mockResolvedValue([
        makeDoc({ docType: "신분증", status: "APPROVED", hiringDispatchId: DISPATCH_ID }),
      ]),
    });
    await makeService(repo).assertRequiredDocsApproved(
      { hiringDispatchId: DISPATCH_ID },
      ["신분증"],
    );
    expect(repo.findLatestPerDocType).toHaveBeenCalledWith({ hiringDispatchId: DISPATCH_ID });
  });
});
