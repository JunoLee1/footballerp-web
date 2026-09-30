import { HiringDispatchService } from "../../src/hiring-dispatch/hiring-dispatch.service";
import { HiringDocumentService } from "../../src/hiring-document/hiring-document.service";
import { AppError } from "../../src/lib/appError";
import type { HiringDispatchRepository } from "../../src/hiring-dispatch/hiring-dispatch.repo";
import type { HiringDocumentRepository } from "../../src/hiring-document/hiring-document.repo";
import type { NotificationRepository } from "../../src/notification/notification.repo";
import type { PrismaClient } from "../../src/generated/client";

/**
 * Integration-style test that wires HiringDocumentService into
 * HiringDispatchService and drives `dispatch()` through the required-docs
 * gate. The dispatch mocks copy the shape from
 * `__test__/hiring-dispatch/hiring-dispatch.service.test.ts` — kept in sync
 * so a change there is easy to spot.
 */

jest.mock("../../src/lib/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../src/lib/crypto", () => ({
  encrypt: jest.fn(() => ({ encrypted: "enc", iv: "iv" })),
}));
jest.mock("../../src/lib/hash", () => ({
  hashPassword: jest.fn().mockResolvedValue("hashed"),
}));

const HR_EXEC = "00000000-0000-4000-8000-000000000101";
const DEPT_HEAD = "00000000-0000-4000-8000-000000000050";
const DEPT_ID = 10;
const APPLICATION_ID = 555;
const DISPATCH_ID = 1;
const NEW_USER_ID = "00000000-0000-4000-8000-000000000700";
const PHONE_ID = 800;

const makeDispatch = (overrides: Partial<any> = {}) => ({
  id: DISPATCH_ID,
  applicationId: APPLICATION_ID,
  candidateName: "홍길동",
  candidateEmail: "hong@example.com",
  jobTitle: "SW Engineer",
  jobGrade: "ASSOCIATE",
  employmentType: "FULL_TIME",
  departmentId: DEPT_ID,
  reportsToUserId: null,
  monthlySalary: 5_000_000n,
  startDate: new Date("2026-09-01"),
  targetRole: "FRONT_OFFICE",
  targetFrontOfficeRole: null,
  targetCoachingRole: null,
  permissionNotes: null,
  status: "DISPATCH_APPROVED" as const,
  createdUserId: null,
  createdById: "00000000-0000-4000-8000-000000000999",
  createdAt: new Date(),
  updatedAt: new Date(),
  requiredDocuments: [] as string[],
  application: {
    id: APPLICATION_ID,
    applicantName: "홍길동",
    email: "hong@example.com",
    status: "OFFERED",
    postingId: 40,
    posting: {
      id: 40,
      title: "SW Engineer",
      headcount: 5,
      hiringPlanItemId: 88,
      requiredDocuments: [] as string[],
      hiringPlanItem: { id: 88, roleTitle: "SW Engineer", headcount: 3 },
    },
  },
  department: {
    id: DEPT_ID,
    name: "개발팀",
    headId: DEPT_HEAD,
    parentId: null,
    parent: null,
  },
  createdBy: { id: "00000000-0000-4000-8000-000000000999", username: "hr", nickname: "HR" },
  createdUser: null,
  reportsToUser: null,
  approvals: [],
  onboarding: null,
  ...overrides,
});

const makeDispatchRepo = (overrides: Partial<HiringDispatchRepository> = {}): HiringDispatchRepository =>
  ({
    findById: jest.fn().mockResolvedValue(makeDispatch()),
    updateStatus: jest.fn().mockImplementation(async (id, patch) =>
      makeDispatch({ id, status: patch.status, createdUserId: patch.createdUserId ?? null }),
    ),
    addApproval: jest.fn().mockResolvedValue({}),
    countDeptMembers: jest.fn().mockResolvedValue(0),
    findUserByEmail: jest.fn().mockResolvedValue(null),
    createPhoneNumber: jest.fn().mockResolvedValue({ id: PHONE_ID }),
    createUser: jest.fn().mockResolvedValue({
      id: NEW_USER_ID,
      email: "hong@example.com",
      username: "홍길동",
      nickname: "홍길동#1",
      role: "FRONT_OFFICE",
    }),
    createUserDepartment: jest.fn().mockResolvedValue({}),
    createStaffRecord: jest.fn().mockResolvedValue({ id: 900 }),
    createOnboarding: jest.fn().mockResolvedValue({ id: 999 }),
    ...overrides,
  } as unknown as HiringDispatchRepository);

const makeDocRepo = (
  latest: Array<{ docType: string; status: "PENDING" | "APPROVED" | "REJECTED" }> = [],
): HiringDocumentRepository =>
  ({
    findLatestPerDocType: jest.fn().mockResolvedValue(
      latest.map((d) => ({ ...d, id: 1, applicationId: APPLICATION_ID })),
    ),
  } as unknown as HiringDocumentRepository);

const makeNotifRepo = (): NotificationRepository =>
  ({
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForHrManager: jest.fn().mockResolvedValue(undefined),
    createForFinanceManager: jest.fn().mockResolvedValue(undefined),
    createForGM: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationRepository);

const makePrisma = (): PrismaClient =>
  ({
    jobApplication: {
      findUnique: jest.fn().mockResolvedValue({ id: APPLICATION_ID, status: "OFFERED" }),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn({})),
  } as unknown as PrismaClient);

function makeWiredService(opts: {
  requiredDocuments?: string[];
  latestDocs?: Array<{ docType: string; status: "PENDING" | "APPROVED" | "REJECTED" }>;
  applicationFree?: boolean;
  dispatchRequiredDocuments?: string[];
} = {}) {
  const dispatchOverrides: any = {};
  if (opts.applicationFree) {
    dispatchOverrides.applicationId = null;
    dispatchOverrides.application = null;
    dispatchOverrides.requiredDocuments = opts.dispatchRequiredDocuments ?? [];
  } else {
    dispatchOverrides.application = {
      id: APPLICATION_ID,
      applicantName: "홍길동",
      email: "hong@example.com",
      status: "OFFERED",
      postingId: 40,
      posting: {
        id: 40,
        title: "SW Engineer",
        headcount: 5,
        hiringPlanItemId: 88,
        requiredDocuments: opts.requiredDocuments ?? [],
        hiringPlanItem: { id: 88, roleTitle: "SW Engineer", headcount: 3 },
      },
    };
  }
  const dispatchRepo = makeDispatchRepo({
    findById: jest.fn().mockResolvedValue(makeDispatch(dispatchOverrides)),
  });
  const docRepo = makeDocRepo(opts.latestDocs ?? []);
  const prisma = makePrisma();
  const docService = new HiringDocumentService(docRepo, prisma);
  const dispatchService = new HiringDispatchService(
    dispatchRepo,
    makeNotifRepo(),
    prisma,
    docService,
  );
  return { dispatchRepo, docRepo, dispatchService };
}

// ────────────────────────────────────────────
// Application-anchored gate — sources requiredDocuments from posting
// ────────────────────────────────────────────

describe("HiringDispatch EXECUTION gate (application-anchored)", () => {
  it("dispatches successfully when required docs are all APPROVED", async () => {
    const { dispatchRepo, dispatchService } = makeWiredService({
      requiredDocuments: ["신분증", "통장사본"],
      latestDocs: [
        { docType: "신분증", status: "APPROVED" },
        { docType: "통장사본", status: "APPROVED" },
      ],
    });
    const result = await dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
    expect(result.status).toBe("ONBOARDING");
    expect(dispatchRepo.createUser).toHaveBeenCalled();
  });

  it("blocks dispatch when one required doc is missing (no row)", async () => {
    const { dispatchRepo, dispatchService } = makeWiredService({
      requiredDocuments: ["신분증", "통장사본"],
      latestDocs: [{ docType: "신분증", status: "APPROVED" }],
    });
    await expect(
      dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER"),
    ).rejects.toThrow(/MISSING_APPROVED_DOCS.*통장사본/);
    // No provisioning side-effects on the block path.
    expect(dispatchRepo.createUser).not.toHaveBeenCalled();
    expect(dispatchRepo.createPhoneNumber).not.toHaveBeenCalled();
  });

  it("blocks dispatch when one required doc is PENDING", async () => {
    const { dispatchService } = makeWiredService({
      requiredDocuments: ["신분증"],
      latestDocs: [{ docType: "신분증", status: "PENDING" }],
    });
    await expect(
      dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER"),
    ).rejects.toThrow(/MISSING_APPROVED_DOCS/);
  });

  it("blocks dispatch when one required doc is REJECTED as the latest row", async () => {
    const { dispatchService } = makeWiredService({
      requiredDocuments: ["신분증"],
      latestDocs: [{ docType: "신분증", status: "REJECTED" }],
    });
    await expect(
      dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER"),
    ).rejects.toThrow(/MISSING_APPROVED_DOCS/);
  });

  it("dispatches when a REJECTED row was overtaken by a newer APPROVED (append-only latest wins)", async () => {
    // findLatestPerDocType returns the newest per docType, so an APPROVED row
    // will hide the older REJECTED — the gate sees only APPROVED and passes.
    const { dispatchService } = makeWiredService({
      requiredDocuments: ["신분증"],
      latestDocs: [{ docType: "신분증", status: "APPROVED" }],
    });
    const result = await dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
    expect(result.status).toBe("ONBOARDING");
  });

  it("no gate when posting.requiredDocuments is empty", async () => {
    const { dispatchService } = makeWiredService({
      requiredDocuments: [],
      latestDocs: [],
    });
    const result = await dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
    expect(result.status).toBe("ONBOARDING");
  });
});

// ────────────────────────────────────────────
// Application-free gate — sources requiredDocuments from dispatch row
// ────────────────────────────────────────────

describe("HiringDispatch EXECUTION gate (application-free)", () => {
  it("dispatches successfully with dispatch.requiredDocuments met", async () => {
    const { dispatchService } = makeWiredService({
      applicationFree: true,
      dispatchRequiredDocuments: ["신분증"],
      latestDocs: [{ docType: "신분증", status: "APPROVED" }],
    });
    const result = await dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
    expect(result.status).toBe("ONBOARDING");
  });

  it("blocks dispatch when dispatch.requiredDocuments has a missing doc", async () => {
    const { dispatchService } = makeWiredService({
      applicationFree: true,
      dispatchRequiredDocuments: ["신분증", "통장사본"],
      latestDocs: [{ docType: "신분증", status: "APPROVED" }],
    });
    await expect(
      dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER"),
    ).rejects.toThrow(/MISSING_APPROVED_DOCS.*통장사본/);
  });

  it("no gate for application-free dispatch with empty requiredDocuments", async () => {
    const { dispatchService } = makeWiredService({
      applicationFree: true,
      dispatchRequiredDocuments: [],
      latestDocs: [],
    });
    const result = await dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
    expect(result.status).toBe("ONBOARDING");
  });
});

// ────────────────────────────────────────────
// Backwards compat — service without documentService still works
// ────────────────────────────────────────────

describe("HiringDispatch EXECUTION gate (no documentService injected)", () => {
  it("no-ops the gate when documentService is undefined", async () => {
    const dispatchRepo = makeDispatchRepo({
      findById: jest
        .fn()
        .mockResolvedValue(makeDispatch({ requiredDocuments: ["신분증"] })),
    });
    const svc = new HiringDispatchService(dispatchRepo, makeNotifRepo(), makePrisma());
    // Should not throw — gate is skipped when service isn't wired.
    const result = await svc.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
    expect(result.status).toBe("ONBOARDING");
  });
});

// ────────────────────────────────────────────
// AppError shape — code is stable so FE can pattern-match
// ────────────────────────────────────────────

describe("MISSING_APPROVED_DOCS error shape", () => {
  it("error code starts with MISSING_APPROVED_DOCS and lists missing docType", async () => {
    const { dispatchService } = makeWiredService({
      requiredDocuments: ["신분증", "통장사본", "학력증명"],
      latestDocs: [{ docType: "신분증", status: "APPROVED" }],
    });
    try {
      await dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.statusCode).toBe(400);
      expect(err.code).toMatch(/^MISSING_APPROVED_DOCS:/);
      expect(err.code).toContain("통장사본");
      expect(err.code).toContain("학력증명");
      expect(err.code).not.toContain("신분증");
    }
  });
});
