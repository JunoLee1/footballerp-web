import { HiringDispatchService } from "../../src/hiring-dispatch/hiring-dispatch.service";
import { EmployeeContractService } from "../../src/employee-contract/employee-contract.service";
import { AppError } from "../../src/lib/appError";
import type { HiringDispatchRepository } from "../../src/hiring-dispatch/hiring-dispatch.repo";
import type { EmployeeContractRepository } from "../../src/employee-contract/employee-contract.repo";
import type { NotificationRepository } from "../../src/notification/notification.repo";
import type { PrismaClient } from "../../src/generated/client";

/**
 * Wires EmployeeContractService into HiringDispatchService and drives
 * `dispatch()` through the CONTRACT_NOT_SIGNED gate. Mirrors the shape of
 * `__test__/hiring-document/hiring-dispatch-gate.integration.test.ts` from
 * #372 — one gate per file, same mock scaffolding so future gates drop in
 * with a copy-paste.
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

const makeContract = (overrides: Partial<any> = {}) => ({
  id: 42,
  hiringDispatchId: DISPATCH_ID,
  status: "DRAFT" as const,
  fileUrl: null,
  fileName: null,
  signedFileUrl: null,
  signedFileName: null,
  createdById: "00000000-0000-4000-8000-000000000999",
  issuedById: null,
  issuedAt: null,
  signedAt: null,
  signedConfirmedById: null,
  signedConfirmedAt: null,
  cancelledById: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: { id: "00000000-0000-4000-8000-000000000999", username: "hr", nickname: "HR" },
  issuedBy: null,
  signedConfirmedBy: null,
  cancelledBy: null,
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

const makeEcRepo = (
  latest: { status: "DRAFT" | "ISSUED" | "SIGNED" | "CANCELLED" } | null,
): EmployeeContractRepository =>
  ({
    findLatestActiveByDispatch: jest
      .fn()
      .mockResolvedValue(latest ? makeContract({ status: latest.status }) : null),
  } as unknown as EmployeeContractRepository);

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
    hiringDispatch: {
      findUnique: jest.fn().mockResolvedValue({ id: DISPATCH_ID }),
    },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn({})),
  } as unknown as PrismaClient);

function makeWiredService(
  latest: { status: "DRAFT" | "ISSUED" | "SIGNED" | "CANCELLED" } | null,
) {
  const dispatchRepo = makeDispatchRepo();
  const ecRepo = makeEcRepo(latest);
  const prisma = makePrisma();
  const ecService = new EmployeeContractService(ecRepo, prisma);
  const dispatchService = new HiringDispatchService(
    dispatchRepo,
    makeNotifRepo(),
    prisma,
    ecService,
  );
  return { dispatchRepo, ecRepo, dispatchService };
}

// ────────────────────────────────────────────
// contract gate — dispatch() must fail unless latest active contract is SIGNED
// ────────────────────────────────────────────

describe("HiringDispatch EXECUTION contract gate", () => {
  it("dispatches successfully when latest contract is SIGNED", async () => {
    const { dispatchRepo, dispatchService } = makeWiredService({ status: "SIGNED" });
    const result = await dispatchService.dispatch(
      DISPATCH_ID,
      HR_EXEC,
      "FRONT_OFFICE",
      "HR_MANAGER",
    );
    expect(result.status).toBe("ONBOARDING");
    expect(dispatchRepo.createUser).toHaveBeenCalled();
  });

  it("blocks dispatch with CONTRACT_NOT_ISSUED when no contract exists", async () => {
    const { dispatchRepo, dispatchService } = makeWiredService(null);
    await expect(
      dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER"),
    ).rejects.toThrow(new AppError(400, "CONTRACT_NOT_ISSUED"));
    // No provisioning side-effects on the block path.
    expect(dispatchRepo.createUser).not.toHaveBeenCalled();
    expect(dispatchRepo.createPhoneNumber).not.toHaveBeenCalled();
  });

  it("blocks dispatch with CONTRACT_NOT_SIGNED:DRAFT when latest contract is DRAFT", async () => {
    const { dispatchService } = makeWiredService({ status: "DRAFT" });
    await expect(
      dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER"),
    ).rejects.toThrow(/CONTRACT_NOT_SIGNED:DRAFT/);
  });

  it("blocks dispatch with CONTRACT_NOT_SIGNED:ISSUED when latest contract is ISSUED", async () => {
    const { dispatchService } = makeWiredService({ status: "ISSUED" });
    await expect(
      dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER"),
    ).rejects.toThrow(/CONTRACT_NOT_SIGNED:ISSUED/);
  });

  it("blocks dispatch when the ONLY contract has been CANCELLED (no active row)", async () => {
    // findLatestActiveByDispatch filters out CANCELLED — returns null just
    // like the "no contract at all" case → CONTRACT_NOT_ISSUED.
    const { dispatchService } = makeWiredService(null);
    await expect(
      dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER"),
    ).rejects.toThrow(new AppError(400, "CONTRACT_NOT_ISSUED"));
  });

  it("dispatches when a CANCELLED contract was overtaken by a newer SIGNED (append-only latest active)", async () => {
    // Simulates the append-only re-issue flow: an older CANCELLED row is
    // hidden by findLatestActiveByDispatch, and the newer SIGNED row wins.
    const { dispatchService } = makeWiredService({ status: "SIGNED" });
    const result = await dispatchService.dispatch(
      DISPATCH_ID,
      HR_EXEC,
      "FRONT_OFFICE",
      "HR_MANAGER",
    );
    expect(result.status).toBe("ONBOARDING");
  });
});

// ────────────────────────────────────────────
// AppError shape — code is stable so FE can pattern-match
// ────────────────────────────────────────────

describe("CONTRACT_NOT_SIGNED error shape", () => {
  it("error code starts with CONTRACT_NOT_SIGNED and encodes current status", async () => {
    const { dispatchService } = makeWiredService({ status: "DRAFT" });
    try {
      await dispatchService.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("CONTRACT_NOT_SIGNED:DRAFT");
    }
  });
});

// ────────────────────────────────────────────
// Backwards compat — service without employeeContractService still works
// ────────────────────────────────────────────

describe("HiringDispatch EXECUTION gate (no employeeContractService injected)", () => {
  it("no-ops the contract gate when employeeContractService is undefined", async () => {
    const dispatchRepo = makeDispatchRepo();
    const svc = new HiringDispatchService(dispatchRepo, makeNotifRepo(), makePrisma());
    // No contract wired → gate is skipped, dispatch proceeds normally.
    const result = await svc.dispatch(DISPATCH_ID, HR_EXEC, "FRONT_OFFICE", "HR_MANAGER");
    expect(result.status).toBe("ONBOARDING");
  });
});
