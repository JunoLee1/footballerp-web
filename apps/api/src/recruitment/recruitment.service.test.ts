import bcrypt from "bcrypt";
import { RecruitmentService } from "./recruitment.service";
import type { RecruitmentRepository } from "./recruitment.repo";

// Shared mock functions so tests can access + reset them between runs.
const mockHiringPlanItem = {
  findUnique: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};

const mockInterview = {
  updateMany: jest.fn(),
};

// #370 offer 3-stage approval — transactional path uses this mock to
// simulate the final OFFERED write inside hrApprove (see recruitment.service).
const mockJobApplicationUpdate = jest.fn().mockResolvedValue({});

jest.mock("../lib/prisma", () => ({
  getPrisma: () => ({
    staffRecord: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    referenceCheck: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    hiringPlanItem: mockHiringPlanItem,
    interview: mockInterview,
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    // Passthrough tx — inner callback receives a prisma-like object. Extra
    // models added over time (offer 3-stage, etc) are appended here.
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn({
      hiringPlanItem: mockHiringPlanItem,
      jobApplication: { update: mockJobApplicationUpdate },
    })),
  }),
}));

jest.mock("../lib/email", () => ({
  sendApplicationStatusEmail: jest.fn().mockResolvedValue(undefined),
}));

const fakeApp = {
  id: 1, status: "OFFERED", applicantName: "테스트", posting: null,
  applicationDate: new Date(), updatedAt: new Date(),
};

const makeRepo = (overrides: Partial<RecruitmentRepository> = {}): RecruitmentRepository =>
  ({
    findApplicationById: jest.fn().mockResolvedValue(fakeApp),
    findOnboardingByApplication: jest.fn().mockResolvedValue(null),
    createOnboarding: jest.fn().mockImplementation((_appId, _userId, otpCode, expiresAt) =>
      Promise.resolve({ id: 1, applicationId: 1, userId: "1", otpCode, expiresAt, emailVerifiedAt: null, mfaRegisteredAt: null })
    ),
    markEmailVerified: jest.fn().mockResolvedValue({ id: 1, emailVerifiedAt: new Date() }),
    findApplicationsByStage: jest.fn().mockResolvedValue([]),
    findApplicationsByStatus: jest.fn().mockResolvedValue([]),
    createApplication: jest.fn(),
    updateApplicationStatus: jest.fn(),
    findPostings: jest.fn().mockResolvedValue([]),
    findPostingById: jest.fn().mockResolvedValue(null),
    createPosting: jest.fn(),
    updatePosting: jest.fn(),
    createInterview: jest.fn(),
    updateInterview: jest.fn(),
    createOffer: jest.fn(),
    updateOffer: jest.fn(),
    findInterviewsByApplication: jest.fn().mockResolvedValue([]),
    findOfferByApplication: jest.fn().mockResolvedValue(null),
    updateReferenceCheck: jest.fn(),
    markMfaRegistered: jest.fn().mockResolvedValue({}),
    completeOnboarding: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as RecruitmentRepository);

const makeSvc = (overrides: Partial<RecruitmentRepository> = {}) =>
  new RecruitmentService(makeRepo(overrides));

describe("RecruitmentService.startOnboarding", () => {
  it("otpCode는 bcrypt 해시로 저장된다 (평문 6자리가 아님)", async () => {
    const repo = makeRepo();
    const svc = new RecruitmentService(repo);
    await svc.startOnboarding(1, "42");

    const storedHash = (repo.createOnboarding as jest.Mock).mock.calls[0][2] as string;
    expect(storedHash).toMatch(/^\$2b\$/);
    expect(storedHash).not.toMatch(/^\d{6}$/);
  });

  it("응답의 otpCode는 평문 6자리 숫자다", async () => {
    const svc = makeSvc();
    const result = await svc.startOnboarding(1, "42");
    expect(result.otpCode).toMatch(/^\d{6}$/);
  });

  it("두 결과 모두 6자리 형식이다", async () => {
    const svc = makeSvc();
    const r1 = await svc.startOnboarding(1, "42");
    const r2 = await svc.startOnboarding(1, "42");
    expect(r1.otpCode).toMatch(/^\d{6}$/);
    expect(r2.otpCode).toMatch(/^\d{6}$/);
  });
});

describe("RecruitmentService.verifyEmail", () => {
  let correctOtp: string;
  let otpHash: string;

  beforeAll(async () => {
    correctOtp = "123456";
    otpHash = await bcrypt.hash(correctOtp, 10);
  });

  const makeOnboarding = (overrides = {}) => ({
    id: 1, applicationId: 1, userId: "1",
    otpCode: otpHash,
    otpExpiresAt: new Date(Date.now() + 60_000),
    emailVerifiedAt: null,
    mfaRegisteredAt: null,
    ...overrides,
  });

  it("올바른 OTP → 이메일 인증 성공", async () => {
    const svc = makeSvc({
      findOnboardingByApplication: jest.fn().mockResolvedValue(makeOnboarding()),
    });
    await expect(svc.verifyEmail(1, correctOtp)).resolves.toBeDefined();
  });

  it("잘못된 OTP → 400 INVALID_OTP", async () => {
    const svc = makeSvc({
      findOnboardingByApplication: jest.fn().mockResolvedValue(makeOnboarding()),
    });
    await expect(svc.verifyEmail(1, "999999")).rejects.toMatchObject({
      statusCode: 400, message: "INVALID_OTP",
    });
  });

  it("만료된 OTP → 400 OTP_EXPIRED", async () => {
    const svc = makeSvc({
      findOnboardingByApplication: jest.fn().mockResolvedValue(
        makeOnboarding({ otpExpiresAt: new Date(Date.now() - 1000) })
      ),
    });
    await expect(svc.verifyEmail(1, correctOtp)).rejects.toMatchObject({
      statusCode: 400, message: "OTP_EXPIRED",
    });
  });

  it("이미 인증된 이메일 → 409 EMAIL_ALREADY_VERIFIED", async () => {
    const svc = makeSvc({
      findOnboardingByApplication: jest.fn().mockResolvedValue(
        makeOnboarding({ emailVerifiedAt: new Date() })
      ),
    });
    await expect(svc.verifyEmail(1, correctOtp)).rejects.toMatchObject({
      statusCode: 409, message: "EMAIL_ALREADY_VERIFIED",
    });
  });
});

describe("RecruitmentService.createPosting", () => {
  const makePlanReportRepo = (overrides: any = {}): any => ({
    findByIdLight: jest.fn().mockResolvedValue({
      id: 1,
      status: "APPROVED",
      templateType: "HR",
      departmentId: 10,
      title: "2026 상반기 채용 계획",
      jobPostings: [], // 이제 array — schema 변경 후 필드 이름
    }),
    findHiringPlanItemById: jest.fn().mockResolvedValue({
      id: 500,
      planReportId: 1,
      status: "PLANNED",
    }),
    updateHiringPlanItemStatus: jest.fn().mockResolvedValue({}),
    ...overrides,
  });

  const makeSvcWithPlanRepo = (
    planRepoOverrides: any = {},
    repoOverrides: Partial<RecruitmentRepository> = {},
  ) =>
    new RecruitmentService(
      makeRepo(repoOverrides),
      undefined,
      makePlanReportRepo(planRepoOverrides),
    );

  const validDto = {
    planReportId: 1,
    title: "수비코치 채용",
    description: "수비진 강화를 위한 코치 채용",
    departmentId: 10,
    headcount: 3,
    hiringPlanItemId: 500,
  } as any;

  it("PlanReport 에 이미 JobPosting 이 있어도 새 posting 생성 가능해야 함 (다중 role 지원)", async () => {
    const svc = makeSvcWithPlanRepo(
      {
        findByIdLight: jest.fn().mockResolvedValue({
          id: 1,
          status: "APPROVED",
          templateType: "HR",
          departmentId: 10,
          title: "2026 상반기 채용 계획",
          // 현재 code 는 .jobPosting (singular) 를 읽어 체크함 → 이 필드로 현재 버그 재현.
          // fix 후에는 이 체크가 삭제되므로 두 필드 다 무시되고 posting 생성 성공.
          jobPosting: { id: 100 },
          jobPostings: [{ id: 100 }],
        }),
      },
      {
        createPosting: jest.fn().mockResolvedValue({ id: 101, title: "수비코치 채용" }),
      },
    );

    await expect(svc.createPosting(validDto, "42")).resolves.toEqual({
      id: 101,
      title: "수비코치 채용",
    });
  });

  it("PlanReport 승인 안 되면 409 PLAN_REPORT_NOT_APPROVED", async () => {
    const svc = makeSvcWithPlanRepo({
      findByIdLight: jest.fn().mockResolvedValue({
        id: 1,
        status: "DRAFT",
        templateType: "HR",
        departmentId: 10,
        title: "test",
        jobPostings: [],
      }),
    });

    await expect(svc.createPosting(validDto, "42")).rejects.toMatchObject({
      statusCode: 409,
      message: "PLAN_REPORT_NOT_APPROVED",
    });
  });

  it("PlanReport HR 타입 아니면 409 PLAN_REPORT_NOT_HR_TYPE", async () => {
    const svc = makeSvcWithPlanRepo({
      findByIdLight: jest.fn().mockResolvedValue({
        id: 1,
        status: "APPROVED",
        templateType: "MARKETING",
        departmentId: 10,
        title: "test",
        jobPostings: [],
      }),
    });

    await expect(svc.createPosting(validDto, "42")).rejects.toMatchObject({
      statusCode: 409,
      message: "PLAN_REPORT_NOT_HR_TYPE",
    });
  });

  it("PlanReport 없으면 404 PLAN_REPORT_NOT_FOUND", async () => {
    const svc = makeSvcWithPlanRepo({
      findByIdLight: jest.fn().mockResolvedValue(null),
    });

    await expect(svc.createPosting(validDto, "42")).rejects.toMatchObject({
      statusCode: 404,
      message: "PLAN_REPORT_NOT_FOUND",
    });
  });

  it("hiringPlanItemId 없으면 400 HIRING_PLAN_ITEM_REQUIRED", async () => {
    const svc = makeSvcWithPlanRepo();
    // validDto 는 hiringPlanItemId 포함, 이 테스트는 제외 후 전송
    const dtoWithoutItem = { ...validDto, hiringPlanItemId: undefined } as any;
    await expect(svc.createPosting(dtoWithoutItem, "42")).rejects.toMatchObject({
      statusCode: 400,
      message: "HIRING_PLAN_ITEM_REQUIRED",
    });
  });

  it("hiringPlanItemId 가 존재하지 않으면 404 HIRING_PLAN_ITEM_NOT_FOUND", async () => {
    const svc = makeSvcWithPlanRepo({
      findByIdLight: jest.fn().mockResolvedValue({
        id: 1,
        status: "APPROVED",
        templateType: "HR",
        departmentId: 10,
        title: "test",
        jobPostings: [],
      }),
      findHiringPlanItemById: jest.fn().mockResolvedValue(null),
    });
    await expect(svc.createPosting(validDto, "42")).rejects.toMatchObject({
      statusCode: 404,
      message: "HIRING_PLAN_ITEM_NOT_FOUND",
    });
  });

  it("hiringPlanItemId 가 다른 planReport 소속이면 400 HIRING_PLAN_ITEM_MISMATCH", async () => {
    const svc = makeSvcWithPlanRepo({
      findByIdLight: jest.fn().mockResolvedValue({
        id: 1,
        status: "APPROVED",
        templateType: "HR",
        departmentId: 10,
        title: "test",
        jobPostings: [],
      }),
      findHiringPlanItemById: jest.fn().mockResolvedValue({
        id: 500,
        planReportId: 999, // ← 다른 계획서 소속
        status: "PLANNED",
      }),
    });
    await expect(svc.createPosting(validDto, "42")).rejects.toMatchObject({
      statusCode: 400,
      message: "HIRING_PLAN_ITEM_MISMATCH",
    });
  });

  it("첫 JobPosting 생성 시 HiringPlanItem status 를 IN_PROGRESS 로 전이", async () => {
    const updateHiringPlanItemStatus = jest.fn().mockResolvedValue({});
    const svc = new RecruitmentService(
      makeRepo({
        createPosting: jest.fn().mockResolvedValue({ id: 101, title: "test" }) as any,
      }),
      undefined,
      makePlanReportRepo({
        findByIdLight: jest.fn().mockResolvedValue({
          id: 1,
          status: "APPROVED",
          templateType: "HR",
          departmentId: 10,
          title: "test",
          jobPostings: [],
        }),
        findHiringPlanItemById: jest.fn().mockResolvedValue({
          id: 500,
          planReportId: 1,
          status: "PLANNED",
        }),
        updateHiringPlanItemStatus,
      }),
    );

    await svc.createPosting({ ...validDto, hiringPlanItemId: 500 }, "42");

    expect(updateHiringPlanItemStatus).toHaveBeenCalledWith(500, "IN_PROGRESS");
  });

  it("이미 IN_PROGRESS 인 HiringPlanItem 은 status 재 update 안 함 (idempotent)", async () => {
    const updateHiringPlanItemStatus = jest.fn().mockResolvedValue({});
    const svc = new RecruitmentService(
      makeRepo({
        createPosting: jest.fn().mockResolvedValue({ id: 101, title: "test" }) as any,
      }),
      undefined,
      makePlanReportRepo({
        findByIdLight: jest.fn().mockResolvedValue({
          id: 1, status: "APPROVED", templateType: "HR",
          departmentId: 10, title: "test", jobPostings: [],
        }),
        findHiringPlanItemById: jest.fn().mockResolvedValue({
          id: 500, planReportId: 1, status: "IN_PROGRESS",
        }),
        updateHiringPlanItemStatus,
      }),
    );

    await svc.createPosting({ ...validDto, hiringPlanItemId: 500 }, "42");

    expect(updateHiringPlanItemStatus).not.toHaveBeenCalled();
  });

  it("HiringPlanItem status === 'FULFILLED' 이면 409 HIRING_PLAN_ITEM_ALREADY_FULFILLED", async () => {
    const svc = makeSvcWithPlanRepo({
      findByIdLight: jest.fn().mockResolvedValue({
        id: 1, status: "APPROVED", templateType: "HR",
        departmentId: 10, title: "test", jobPostings: [],
      }),
      findHiringPlanItemById: jest.fn().mockResolvedValue({
        id: 500, planReportId: 1, status: "FULFILLED",
      }),
    });

    await expect(svc.createPosting({ ...validDto, hiringPlanItemId: 500 }, "42"))
      .rejects.toMatchObject({ statusCode: 409, message: "HIRING_PLAN_ITEM_ALREADY_FULFILLED" });
  });

  it("HiringPlanItem status === 'CANCELLED' 이면 409 HIRING_PLAN_ITEM_CANCELLED", async () => {
    const svc = makeSvcWithPlanRepo({
      findByIdLight: jest.fn().mockResolvedValue({
        id: 1, status: "APPROVED", templateType: "HR",
        departmentId: 10, title: "test", jobPostings: [],
      }),
      findHiringPlanItemById: jest.fn().mockResolvedValue({
        id: 500, planReportId: 1, status: "CANCELLED",
      }),
    });

    await expect(svc.createPosting({ ...validDto, hiringPlanItemId: 500 }, "42"))
      .rejects.toMatchObject({ statusCode: 409, message: "HIRING_PLAN_ITEM_CANCELLED" });
  });
});

describe("RecruitmentService.completeMfa (HiringPlanItem status)", () => {
  beforeEach(() => {
    mockHiringPlanItem.findUnique.mockReset();
    mockHiringPlanItem.update.mockReset();
    mockHiringPlanItem.updateMany.mockReset();
  });

  const makeMfaCtx = (
    repoOverrides: any = {},
    planRepoOverrides: any = {},
    txItemState: any = { id: 500, headcount: 3, fulfilledCount: 0, status: "IN_PROGRESS" },
    txUpdateResult: any = { fulfilledCount: 1, headcount: 3 },
  ) => {
    const repo = makeRepo({
      findOnboardingByApplication: jest.fn().mockResolvedValue({
        id: 1, applicationId: 1, userId: "1",
        otpCode: "hash", otpExpiresAt: new Date(Date.now() + 60_000),
        emailVerifiedAt: new Date(),
        mfaRegisteredAt: null,
      }),
      markMfaRegistered: jest.fn().mockResolvedValue({ mfaRegisteredAt: new Date() }),
      findApplicationById: jest.fn().mockResolvedValue({
        id: 1,
        applicantName: "테스트",
        offeredById: "42",
        posting: {
          id: 100,
          title: "Coach",
          hiringPlanItemId: 500,
        },
      }),
      completeOnboarding: jest.fn().mockResolvedValue({}),
      ...repoOverrides,
    });
    const planRepo = {
      findHiringPlanItemById: jest.fn().mockResolvedValue({
        id: 500, planReportId: 1, headcount: 3, fulfilledCount: 0, status: "IN_PROGRESS",
      }),
      incrementFulfilledCount: jest.fn().mockResolvedValue({ id: 500, headcount: 3, fulfilledCount: 1, status: "IN_PROGRESS" }),
      updateHiringPlanItemStatus: jest.fn().mockResolvedValue({}),
      ...planRepoOverrides,
    } as any;
    mockHiringPlanItem.findUnique.mockResolvedValue(txItemState);
    mockHiringPlanItem.update.mockResolvedValue(txUpdateResult);
    mockHiringPlanItem.updateMany.mockResolvedValue({ count: 1 });
    return { svc: new RecruitmentService(repo, undefined, planRepo), repo, planRepo };
  };

  it("Application 온보딩 완료 시 HiringPlanItem.fulfilledCount 증가 (tx 안에서 update)", async () => {
    const { svc } = makeMfaCtx();
    await svc.completeMfa(1);
    expect(mockHiringPlanItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 500 },
        data: { fulfilledCount: { increment: 1 } },
      }),
    );
  });

  it("fulfilledCount 가 headcount 도달 시 FULFILLED 로 전이 (updateMany with IN_PROGRESS guard)", async () => {
    const { svc } = makeMfaCtx(
      {},
      {},
      { id: 500, headcount: 3, fulfilledCount: 2, status: "IN_PROGRESS" },
      { fulfilledCount: 3, headcount: 3 },
    );
    await svc.completeMfa(1);
    expect(mockHiringPlanItem.updateMany).toHaveBeenCalledWith({
      where: { id: 500, status: "IN_PROGRESS" },
      data: { status: "FULFILLED", fulfilledAt: expect.any(Date) },
    });
  });

  it("fulfilledCount < headcount 이면 FULFILLED 전이 skip", async () => {
    const { svc } = makeMfaCtx(
      {},
      {},
      { id: 500, headcount: 3, fulfilledCount: 0, status: "IN_PROGRESS" },
      { fulfilledCount: 1, headcount: 3 },
    );
    await svc.completeMfa(1);
    expect(mockHiringPlanItem.updateMany).not.toHaveBeenCalled();
  });

  it("posting 에 hiringPlanItemId 없으면 (legacy) tx 자체 skip", async () => {
    const { svc } = makeMfaCtx({
      findApplicationById: jest.fn().mockResolvedValue({
        id: 1, applicantName: "테스트", offeredById: "42",
        posting: { id: 100, title: "Coach", hiringPlanItemId: null },
      }),
    });
    await svc.completeMfa(1);
    expect(mockHiringPlanItem.findUnique).not.toHaveBeenCalled();
    expect(mockHiringPlanItem.update).not.toHaveBeenCalled();
    expect(mockHiringPlanItem.updateMany).not.toHaveBeenCalled();
  });

  it("HiringPlanItem 이 이미 CANCELLED 이면 fulfilledCount 증가 skip", async () => {
    const { svc } = makeMfaCtx(
      {},
      {},
      { id: 500, headcount: 3, fulfilledCount: 0, status: "CANCELLED" },
    );
    await svc.completeMfa(1);
    expect(mockHiringPlanItem.update).not.toHaveBeenCalled();
    expect(mockHiringPlanItem.updateMany).not.toHaveBeenCalled();
  });
});

describe("RecruitmentService.completeMfa (UserDepartment safety net · #533)", () => {
  const makeMfaCtx = (
    postingDepartmentId: number | null,
    ensureUserDepartment: jest.Mock = jest.fn().mockResolvedValue({}),
  ) => {
    const repo = makeRepo({
      findOnboardingByApplication: jest.fn().mockResolvedValue({
        id: 1, applicationId: 1, userId: "user-42",
        otpCode: "hash", otpExpiresAt: new Date(Date.now() + 60_000),
        emailVerifiedAt: new Date(),
        mfaRegisteredAt: null,
      }),
      markMfaRegistered: jest.fn().mockResolvedValue({ mfaRegisteredAt: new Date() }),
      findApplicationById: jest.fn().mockResolvedValue({
        id: 1,
        applicantName: "테스트",
        offeredById: "hr-1",
        posting: {
          id: 100,
          title: "Coach",
          departmentId: postingDepartmentId,
          hiringPlanItemId: null,
        },
      }),
      completeOnboarding: jest.fn().mockResolvedValue({}),
      ensureUserDepartment,
    });
    return { svc: new RecruitmentService(repo), repo, ensureUserDepartment };
  };

  it("posting.departmentId 있으면 UserDepartment upsert 호출", async () => {
    const ensureUserDepartment = jest.fn().mockResolvedValue({});
    const { svc } = makeMfaCtx(10, ensureUserDepartment);
    await svc.completeMfa(1);
    expect(ensureUserDepartment).toHaveBeenCalledWith("user-42", 10);
  });

  it("posting.departmentId null 이면 UserDepartment upsert 호출 안 함", async () => {
    const ensureUserDepartment = jest.fn().mockResolvedValue({});
    const { svc } = makeMfaCtx(null, ensureUserDepartment);
    await svc.completeMfa(1);
    expect(ensureUserDepartment).not.toHaveBeenCalled();
  });

  it("이미 UserDepartment 존재해도 upsert 로 no-op (dispatch 경로와 충돌 없음)", async () => {
    // upsert 는 idempotent — 반복 호출해도 role 변경 없이 pass
    const ensureUserDepartment = jest.fn().mockResolvedValue({ userId: "user-42", departmentId: 10, role: "DEPT_HEAD" });
    const { svc } = makeMfaCtx(10, ensureUserDepartment);
    await svc.completeMfa(1);
    expect(ensureUserDepartment).toHaveBeenCalledTimes(1);
  });
});

describe("RecruitmentService.bulkCreatePostingsFromPlanReport", () => {
  const planReportData = {
    id: 1,
    title: "2026 Q4 채용 계획",
    status: "APPROVED",
    templateType: "HR",
    departmentId: 10,
    jobPostings: [],
  };

  const items = [
    { id: 101, planReportId: 1, roleTitle: "수비코치", headcount: 2, priority: "HIGH", status: "PLANNED", quarter: 4, estimatedBudget: 50000000 },
    { id: 102, planReportId: 1, roleTitle: "GK코치", headcount: 1, priority: "MEDIUM", status: "IN_PROGRESS", quarter: 4, estimatedBudget: 30000000 },
    { id: 103, planReportId: 1, roleTitle: "물리치료사", headcount: 2, priority: "HIGH", status: "PLANNED", quarter: 4, estimatedBudget: 40000000 },
    { id: 104, planReportId: 1, roleTitle: "취소된 role", headcount: 1, priority: "LOW", status: "CANCELLED", quarter: 4, estimatedBudget: 20000000 },
    { id: 105, planReportId: 1, roleTitle: "완료된 role", headcount: 1, priority: "LOW", status: "FULFILLED", quarter: 4, estimatedBudget: 20000000 },
  ];

  const makeSvcWithBulkContext = (
    listHiringPlanItemsResult = items,
    createPostingResults = [{ id: 500 }, { id: 501 }],
  ) => {
    const repo = makeRepo({
      createPosting: jest.fn()
        .mockResolvedValueOnce(createPostingResults[0])
        .mockResolvedValueOnce(createPostingResults[1]),
    });
    const planRepo = {
      findByIdLight: jest.fn().mockResolvedValue(planReportData),
      findHiringPlanItemById: jest.fn().mockImplementation((id) => {
        const item = items.find(i => i.id === id);
        return Promise.resolve(item ?? null);
      }),
      listHiringPlanItems: jest.fn().mockResolvedValue(listHiringPlanItemsResult),
      updateHiringPlanItemStatus: jest.fn().mockResolvedValue({}),
    } as any;
    const svc = new RecruitmentService(repo, undefined, planRepo);
    return { svc, repo, planRepo };
  };

  it("PLANNED 상태 item 들만 posting 생성, 나머지는 skip", async () => {
    const { svc, planRepo } = makeSvcWithBulkContext();

    const result = await svc.bulkCreatePostingsFromPlanReport("cmxtestpr01", "42");

    // 2개 PLANNED (101, 103) → posting 생성
    expect(result.created).toHaveLength(2);
    // 3개 non-PLANNED (102 IN_PROGRESS, 104 CANCELLED, 105 FULFILLED) → skip
    expect(result.skipped).toHaveLength(3);
    expect(result.skipped.map((s: any) => s.id).sort()).toEqual([102, 104, 105]);
    expect(result.skipped.map((s: any) => s.status).sort()).toEqual(["CANCELLED", "FULFILLED", "IN_PROGRESS"]);

    // listHiringPlanItems 는 planReportId 기준 조회 (status filter 없이 전체)
    expect(planRepo.listHiringPlanItems).toHaveBeenCalledWith(1);
  });

  it("생성된 posting 은 default title/description 갖고, hiringPlanItemId 자동 연결", async () => {
    const { svc, repo } = makeSvcWithBulkContext();

    await svc.bulkCreatePostingsFromPlanReport("cmxtestpr01", "42");

    const calls = (repo.createPosting as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    // 첫 posting (id 101, 수비코치)
    expect(calls[0][0]).toMatchObject({
      planReportId: 1,
      hiringPlanItemId: 101,
      title: "2026 Q4 채용 계획 - 수비코치",
      headcount: 2,
      departmentId: 10,
      createdById: "42",
    });
    expect(calls[0][0].description).toContain("수비코치");
    expect(calls[0][0].description).toContain("2"); // headcount
  });

  it("planReport 없으면 404 PLAN_REPORT_NOT_FOUND", async () => {
    const { svc } = makeSvcWithBulkContext();
    const planRepo = {
      findByIdLight: jest.fn().mockResolvedValue(null),
      listHiringPlanItems: jest.fn(),
    } as any;
    const svcNoReport = new RecruitmentService(makeRepo(), undefined, planRepo);

    await expect(svcNoReport.bulkCreatePostingsFromPlanReport("cmxtestprNOTFOUND", "42"))
      .rejects.toMatchObject({ statusCode: 404, message: "PLAN_REPORT_NOT_FOUND" });
  });

  it("planReport 가 HR 이 아니거나 승인 안 됨 시 409", async () => {
    const planRepo = {
      findByIdLight: jest.fn().mockResolvedValue({ ...planReportData, templateType: "GENERAL" }),
      listHiringPlanItems: jest.fn(),
    } as any;
    const svc = new RecruitmentService(makeRepo(), undefined, planRepo);

    await expect(svc.bulkCreatePostingsFromPlanReport("cmxtestpr01", "42"))
      .rejects.toMatchObject({ statusCode: 409, message: "PLAN_REPORT_NOT_HR_TYPE" });
  });

  it("모든 item 이 non-PLANNED 이면 created 는 빈 배열, skipped 만 반환 (에러 아님)", async () => {
    const allNonPlanned = items.filter(i => i.status !== "PLANNED");
    const { svc } = makeSvcWithBulkContext(allNonPlanned);

    const result = await svc.bulkCreatePostingsFromPlanReport("cmxtestpr01", "42");

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(3);
  });
});

describe("RecruitmentService.getInterviewerScoreAggregate", () => {
  const interview = {
    id: 100,
    applicationId: 1,
    round: "ROUND_1",
    scoreSkill: null,
    scoreComm: null,
    scoreCulture: null,
  };

  const makeSvcWithAggCtx = (aggregateResult: any = null, findInterviewResult: any = interview) => {
    const repo = makeRepo({
      findInterview: jest.fn().mockResolvedValue(findInterviewResult),
      aggregateInterviewerScores: jest.fn().mockResolvedValue(aggregateResult),
      updateInterview: jest.fn().mockResolvedValue({}),
    });
    return { svc: new RecruitmentService(repo), repo };
  };

  it("3명 면접관 (5, 7, 9) 평균 → scoreSkill=7 (반올림), method=AVG, count=3", async () => {
    const { svc } = makeSvcWithAggCtx({
      _avg: { scoreSkill: 7.0, scoreComm: 6.5, scoreCulture: 8.0 },
      _count: 3,
    });
    const result = await svc.getInterviewerScoreAggregate(1, "ROUND_1");
    expect(result).toEqual({
      scoreSkill: 7,
      scoreComm: 7,      // 6.5 → 7 (round)
      scoreCulture: 8,
      method: "AVG",
      count: 3,
    });
  });

  it("0 scores → 400 NO_INTERVIEWER_SCORES_YET", async () => {
    const { svc } = makeSvcWithAggCtx({
      _avg: { scoreSkill: null, scoreComm: null, scoreCulture: null },
      _count: 0,
    });
    await expect(svc.getInterviewerScoreAggregate(1, "ROUND_1"))
      .rejects.toMatchObject({ statusCode: 400, message: "NO_INTERVIEWER_SCORES_YET" });
  });

  it("Interview 없으면 404 INTERVIEW_NOT_FOUND", async () => {
    const { svc } = makeSvcWithAggCtx(null, null);
    await expect(svc.getInterviewerScoreAggregate(1, "ROUND_1"))
      .rejects.toMatchObject({ statusCode: 404, message: "INTERVIEW_NOT_FOUND" });
  });

  it("일부 카테고리 null 이면 그 값만 null 반환 (다른 카테고리는 정상 평균)", async () => {
    const { svc } = makeSvcWithAggCtx({
      _avg: { scoreSkill: 7.0, scoreComm: null, scoreCulture: 8.0 },
      _count: 2,
    });
    const result = await svc.getInterviewerScoreAggregate(1, "ROUND_1");
    expect(result).toEqual({
      scoreSkill: 7,
      scoreComm: null,
      scoreCulture: 8,
      method: "AVG",
      count: 2,
    });
  });
});

describe("RecruitmentService.finalizeInterviewScore", () => {
  const interview = {
    id: 100,
    applicationId: 1,
    round: "ROUND_1",
    scoreSkill: null,
    scoreComm: null,
    scoreCulture: null,
  };

  const makeSvcFinalize = (aggregateResult: any = null, findInterviewResult: any = interview, updateResult: any = {}) => {
    const repo = makeRepo({
      findInterview: jest.fn().mockResolvedValue(findInterviewResult),
      aggregateInterviewerScores: jest.fn().mockResolvedValue(aggregateResult),
      updateInterview: jest.fn().mockResolvedValue(updateResult),
    });
    return { svc: new RecruitmentService(repo), repo };
  };

  it("aggregate 결과로 Interview.score* 업데이트", async () => {
    const { svc, repo } = makeSvcFinalize({
      _avg: { scoreSkill: 7.0, scoreComm: 6.5, scoreCulture: 8.0 },
      _count: 3,
    }, interview, { id: 100, scoreSkill: 7, scoreComm: 7, scoreCulture: 8 });

    const result = await svc.finalizeInterviewScore(1, "ROUND_1");

    expect(repo.updateInterview).toHaveBeenCalledWith(1, "ROUND_1", {
      scoreSkill: 7,
      scoreComm: 7,
      scoreCulture: 8,
    });
    expect(result.scoreSkill).toBe(7);
  });

  it("0 scores → 400 NO_INTERVIEWER_SCORES_YET (Interview 업데이트 안 함)", async () => {
    const { svc, repo } = makeSvcFinalize({
      _avg: { scoreSkill: null, scoreComm: null, scoreCulture: null },
      _count: 0,
    });
    await expect(svc.finalizeInterviewScore(1, "ROUND_1"))
      .rejects.toMatchObject({ statusCode: 400, message: "NO_INTERVIEWER_SCORES_YET" });
    expect(repo.updateInterview).not.toHaveBeenCalled();
  });

  it("Interview 없으면 404 INTERVIEW_NOT_FOUND", async () => {
    const { svc, repo } = makeSvcFinalize(null, null);
    await expect(svc.finalizeInterviewScore(1, "ROUND_1"))
      .rejects.toMatchObject({ statusCode: 404, message: "INTERVIEW_NOT_FOUND" });
    expect(repo.updateInterview).not.toHaveBeenCalled();
  });
});

describe("RecruitmentService.screenApplication", () => {
  const screeningApp = {
    id: 1,
    status: "SCREENING",
    applicantName: "테스트",
    email: "test@example.com",
    phone: null,
    posting: null,
  };

  const makeSvcWithScreen = (findApplicationResult: any = screeningApp) => {
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(findApplicationResult),
      screenApplication: jest.fn().mockResolvedValue({ id: 1, screeningResult: "PASS" }),
    } as any);
    return { svc: new RecruitmentService(repo), repo };
  };

  it("SCREENING 상태에서 PASS 결과 저장 성공", async () => {
    const { svc, repo } = makeSvcWithScreen();
    const result = await svc.screenApplication(1, { result: "PASS", notes: "우수" }, "42");
    expect((repo as any).screenApplication).toHaveBeenCalledWith(1, {
      screeningResult: "PASS",
      screeningNotes: "우수",
      screenedById: "42",
      screenedAt: expect.any(Date),
    });
    expect(result.screeningResult).toBe("PASS");
  });

  it("SCREENING 상태 아니면 409 INVALID_STATUS_FOR_SCREEN", async () => {
    const { svc } = makeSvcWithScreen({ ...screeningApp, status: "INTERVIEW_1" });
    await expect(svc.screenApplication(1, { result: "PASS" } as any, "42"))
      .rejects.toMatchObject({ statusCode: 409, message: "INVALID_STATUS_FOR_SCREEN" });
  });

  it("FAIL 결과인데 notes 없으면 400 SCREENING_NOTES_REQUIRED_FOR_FAIL", async () => {
    const { svc } = makeSvcWithScreen();
    await expect(svc.screenApplication(1, { result: "FAIL" } as any, "42"))
      .rejects.toMatchObject({ statusCode: 400, message: "SCREENING_NOTES_REQUIRED_FOR_FAIL" });
  });

  it("FAIL 결과 + notes 있으면 저장 성공", async () => {
    const { svc, repo } = makeSvcWithScreen();
    await svc.screenApplication(1, { result: "FAIL", notes: "학력 요건 미달" }, "42");
    expect((repo as any).screenApplication).toHaveBeenCalledWith(1, expect.objectContaining({
      screeningResult: "FAIL",
      screeningNotes: "학력 요건 미달",
    }));
  });

  it("Application 없으면 404 JOB_APPLICATION_NOT_FOUND", async () => {
    const { svc } = makeSvcWithScreen(null);
    await expect(svc.screenApplication(1, { result: "PASS" } as any, "42"))
      .rejects.toMatchObject({ statusCode: 404, message: "JOB_APPLICATION_NOT_FOUND" });
  });

  it("PENDING 결과는 notes 없어도 저장 성공", async () => {
    const { svc, repo } = makeSvcWithScreen();
    await svc.screenApplication(1, { result: "PENDING" } as any, "42");
    expect((repo as any).screenApplication).toHaveBeenCalledWith(1, expect.objectContaining({
      screeningResult: "PENDING",
    }));
  });
});

describe("RecruitmentService.reinstateApplication (with screeningResult reset)", () => {
  it("reinstate 시 repo.reinstateApplication 호출 (repo 단이 screeningResult 리셋 담당)", async () => {
    const rejectedApp = {
      id: 1,
      status: "REJECTED",
      previousStatus: "SCREENING",
      screeningResult: "FAIL",
      applicantName: "테스트",
      email: null,
      phone: null,
      posting: null,
    };
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(rejectedApp),
      reinstateApplication: jest.fn().mockResolvedValue({ id: 1, status: "SCREENING", screeningResult: "PENDING" }),
    });
    const svc = new RecruitmentService(repo);

    await svc.reinstateApplication(1, "42");

    expect(repo.reinstateApplication).toHaveBeenCalledWith(1, "42");
  });
});

// ─────────────────────────────────────────────────────────
// Interview threshold + HOLD/WAITLIST tests (fix #366)
// ─────────────────────────────────────────────────────────

describe("RecruitmentService.updateInterview (threshold policy)", () => {
  const makeInterviewWithSettings = (
    interviewOverride: any = {},
    settings: any = { interviewPassThreshold: 3 },
  ) => {
    const repo = makeRepo({
      findInterview: jest.fn().mockResolvedValue({
        id: 100, applicationId: 1, round: "ROUND_1",
        scoreSkill: null, scoreComm: null, scoreCulture: null,
        result: "PENDING",
        ...interviewOverride,
      }),
      getClubSettings: jest.fn().mockResolvedValue(settings),
      updateInterview: jest.fn().mockResolvedValue({}),
    } as any);
    return { svc: new RecruitmentService(repo), repo };
  };

  it("PASS 결정 시 세 점수 모두 threshold >= 3 이면 성공", async () => {
    const { svc, repo } = makeInterviewWithSettings();
    await svc.updateInterview(1, "ROUND_1" as any, {
      result: "PASS", scoreSkill: 3, scoreComm: 4, scoreCulture: 5,
    });
    expect(repo.updateInterview).toHaveBeenCalled();
  });

  it("PASS 결정 시 threshold 미달 (score < 3) → 400 INTERVIEW_SCORE_BELOW_THRESHOLD", async () => {
    const { svc } = makeInterviewWithSettings();
    await expect(
      svc.updateInterview(1, "ROUND_1" as any, {
        result: "PASS", scoreSkill: 2, scoreComm: 4, scoreCulture: 5,
      }),
    ).rejects.toMatchObject({ statusCode: 400, message: "INTERVIEW_SCORE_BELOW_THRESHOLD" });
  });

  it("PASS + threshold 미달 + overrideThreshold=true + overrideReason → 성공 + audit log", async () => {
    const { svc, repo } = makeInterviewWithSettings();
    await svc.updateInterview(1, "ROUND_1" as any, {
      result: "PASS", scoreSkill: 2, scoreComm: 4, scoreCulture: 5,
      overrideThreshold: true, overrideReason: "특별 상황",
    } as any);
    expect(repo.updateInterview).toHaveBeenCalled();
  });

  it("PASS + threshold 미달 + overrideThreshold=true + overrideReason 없음 → 400 OVERRIDE_REASON_REQUIRED", async () => {
    const { svc } = makeInterviewWithSettings();
    await expect(
      svc.updateInterview(1, "ROUND_1" as any, {
        result: "PASS", scoreSkill: 2, scoreComm: 4, scoreCulture: 5,
        overrideThreshold: true,
      } as any),
    ).rejects.toMatchObject({ statusCode: 400, message: "OVERRIDE_REASON_REQUIRED" });
  });

  it("HOLD 결정은 threshold 검증 skip (자유롭게 세팅)", async () => {
    const { svc, repo } = makeInterviewWithSettings();
    await svc.updateInterview(1, "ROUND_1" as any, {
      result: "HOLD" as any, scoreSkill: 2, scoreComm: 2, scoreCulture: 2,
    });
    expect(repo.updateInterview).toHaveBeenCalled();
  });

  it("WAITLIST 결정도 threshold 검증 skip", async () => {
    const { svc, repo } = makeInterviewWithSettings();
    await svc.updateInterview(1, "ROUND_1" as any, {
      result: "WAITLIST" as any, scoreSkill: 3, scoreComm: 3, scoreCulture: 3,
    });
    expect(repo.updateInterview).toHaveBeenCalled();
  });

  it("FAIL 은 항상 threshold 검증 skip", async () => {
    const { svc, repo } = makeInterviewWithSettings();
    await svc.updateInterview(1, "ROUND_1" as any, {
      result: "FAIL", scoreSkill: 1, scoreComm: 1, scoreCulture: 1,
    });
    expect(repo.updateInterview).toHaveBeenCalled();
  });
});

describe("RecruitmentService.getWaitlistForPosting", () => {
  it("WAITLIST result 인 Interview 들을 score 총합 desc 로 정렬", async () => {
    const repo = makeRepo({
      findPostingById: jest.fn().mockResolvedValue({ id: 100, title: "test" }),
      findWaitlistedInterviews: jest.fn().mockResolvedValue([
        { id: 1, applicationId: 10, scoreSkill: 4, scoreComm: 4, scoreCulture: 4, application: { id: 10, applicantName: "A" } }, // 12
        { id: 2, applicationId: 20, scoreSkill: 5, scoreComm: 5, scoreCulture: 5, application: { id: 20, applicantName: "B" } }, // 15
      ]),
    } as any);
    const svc = new RecruitmentService(repo);
    const result = await svc.getWaitlistForPosting("cmxtestposting0000000100");
    expect(result[0].applicationId).toBe(20); // 15 first
    expect(result[1].applicationId).toBe(10); // 12 second
  });

  it("posting 존재하지 않으면 404 JOB_POSTING_NOT_FOUND", async () => {
    const repo = makeRepo({
      findPostingById: jest.fn().mockResolvedValue(null),
    } as any);
    const svc = new RecruitmentService(repo);
    await expect(svc.getWaitlistForPosting("cmxtestposting0000000999"))
      .rejects.toMatchObject({ statusCode: 404, message: "JOB_POSTING_NOT_FOUND" });
  });
});

describe("RecruitmentService.promoteFromWaitlist", () => {
  beforeEach(() => {
    mockInterview.updateMany.mockReset();
    mockInterview.updateMany.mockResolvedValue({ count: 1 });
  });

  it("WAITLIST top candidate 을 3-stage 승인 큐로 promote", async () => {
    // #370: post-refactor, promote fires the same 3-stage flow as an
    // HR-initiated offer instead of jumping to OFFERED directly.
    const app = { id: 10, applicantName: "A", email: "a@test.com", status: "INTERVIEW_2", posting: { id: 100, department: { id: 5, headId: null } } };
    const setStatus = jest.fn().mockResolvedValue({ id: 10, status: "OFFER_PENDING_HR" });
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findWaitlistedInterviewByApplication: jest.fn().mockResolvedValue({
        id: 1, applicationId: 10, scoreSkill: 5, scoreComm: 5, scoreCulture: 5, result: "WAITLIST",
      }),
      findDepartmentLeader: jest.fn().mockResolvedValue(null),
      setApplicationStatus: setStatus,
    } as any);
    const svc = new RecruitmentService(repo);
    const result = await svc.promoteFromWaitlist(10, "42");
    // No LEADER + no DEPT_HEAD → OFFER_PENDING_HR
    expect(setStatus).toHaveBeenCalledWith(10, "OFFER_PENDING_HR", "42");
    expect(result.status).toBe("OFFER_PENDING_HR");
  });

  it("Application 이 waitlist Interview 없으면 400 NOT_WAITLISTED", async () => {
    const app = { id: 10, applicantName: "A", email: "a@test.com", posting: { id: 100 } };
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findWaitlistedInterviewByApplication: jest.fn().mockResolvedValue(null),
    } as any);
    const svc = new RecruitmentService(repo);
    await expect(svc.promoteFromWaitlist(10, "42"))
      .rejects.toMatchObject({ statusCode: 400, message: "NOT_WAITLISTED" });
  });
});

describe("RecruitmentService.rejectApplication (auto-promote hook)", () => {
  beforeEach(() => {
    mockInterview.updateMany.mockReset();
    mockInterview.updateMany.mockResolvedValue({ count: 1 });
  });

  it("OFFERED 상태 application 이 REJECTED 로 전환 시 같은 posting waitlist top 자동 3-stage 승인 큐로 진입", async () => {
    // #370: post-refactor the auto-promote path invokes `beginOfferApproval`
    // (not repo.offerApplication) so the promoted candidate enters
    // OFFER_PENDING_* — HR still owns the terminal OFFERED transition.
    const rejectingApp = {
      id: 1, status: "OFFERED", email: "r@test.com", applicantName: "R",
      posting: { id: 100, department: { id: 5, headId: null } }, postingId: 100,
    };
    const promotedApp = {
      id: 20, status: "INTERVIEW_2", email: "t@test.com", applicantName: "T",
      posting: { id: 100, department: { id: 5, headId: null } },
    };
    const waitlistTop = {
      id: 2, applicationId: 20, scoreSkill: 5, scoreComm: 5, scoreCulture: 5,
      application: { id: 20, applicantName: "T", email: "t@test.com", status: "INTERVIEW_2", postingId: 100 },
    };
    const setStatus = jest.fn().mockResolvedValue({ id: 20, status: "OFFER_PENDING_HR" });
    const findLeader = jest.fn().mockResolvedValue(null);
    const repo = makeRepo({
      findApplicationById: jest.fn()
        .mockResolvedValueOnce(rejectingApp) // getApplication in rejectApplication
        .mockResolvedValueOnce(rejectingApp) // raw fetch for email
        .mockResolvedValueOnce(promotedApp), // beginOfferApproval's raw fetch
      rejectApplication: jest.fn().mockResolvedValue({ id: 1, status: "REJECTED" }),
      findTopWaitlistForPosting: jest.fn().mockResolvedValue(waitlistTop),
      findDepartmentLeader: findLeader,
      setApplicationStatus: setStatus,
    } as any);
    const svc = new RecruitmentService(repo);
    await svc.rejectApplication(1, "42");
    // No LEADER + no DEPT_HEAD → skip straight to OFFER_PENDING_HR
    expect(setStatus).toHaveBeenCalledWith(20, "OFFER_PENDING_HR", "42");
  });

  it("OFFERED 가 아닌 상태 (SCREENING) 는 waitlist auto-promote 없음", async () => {
    const rejectingApp = {
      id: 1, status: "SCREENING", email: "r@test.com", applicantName: "R",
      posting: { id: 100 }, postingId: 100,
    };
    const setStatus = jest.fn();
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(rejectingApp),
      rejectApplication: jest.fn().mockResolvedValue({ id: 1, status: "REJECTED" }),
      findTopWaitlistForPosting: jest.fn(),
      setApplicationStatus: setStatus,
    } as any);
    const svc = new RecruitmentService(repo);
    await svc.rejectApplication(1, "42");
    expect(setStatus).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// #370 — Offer 3-stage approval workflow (팀장 → 부서장 → HR)
// Bottom-up, AssetRequest 패턴. Skip stages when LEADER / DEPT_HEAD absent.
// ═══════════════════════════════════════════════════════════════════════

describe("RecruitmentService.offerApplication (#370 — enters 3-stage flow)", () => {
  it("LEADER 있으면 OFFER_PENDING_LEADER 로 전이 + 팀장에게 알림", async () => {
    const app = {
      id: 1, status: "REFERENCE_CHECK", applicantName: "지원자",
      posting: { id: 100, department: { id: 5, headId: "200" } },
    };
    const setStatus = jest.fn().mockResolvedValue({ id: 1, status: "OFFER_PENDING_LEADER" });
    const findLeader = jest.fn().mockResolvedValue("300"); // leader userId
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findDepartmentLeader: findLeader,
      setApplicationStatus: setStatus,
    } as any);
    const notifRepo = { createForUser: jest.fn().mockResolvedValue({}), createForHrManager: jest.fn() } as any;
    const svc = new RecruitmentService(repo, notifRepo);
    const result = await svc.offerApplication(1, "42");
    expect(setStatus).toHaveBeenCalledWith(1, "OFFER_PENDING_LEADER", "42");
    expect(notifRepo.createForUser).toHaveBeenCalledWith("300", "OFFER_APPROVAL_REQUESTED_LEADER", expect.any(Function), 1);
    expect(result.status).toBe("OFFER_PENDING_LEADER");
  });

  it("LEADER 없고 DEPT_HEAD 있으면 OFFER_PENDING_DEPT_HEAD 로 skip", async () => {
    const app = {
      id: 1, status: "REFERENCE_CHECK", applicantName: "지원자",
      posting: { id: 100, department: { id: 5, headId: "200" } },
    };
    const setStatus = jest.fn().mockResolvedValue({ id: 1, status: "OFFER_PENDING_DEPT_HEAD" });
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findDepartmentLeader: jest.fn().mockResolvedValue(null),
      setApplicationStatus: setStatus,
    } as any);
    const notifRepo = { createForUser: jest.fn().mockResolvedValue({}), createForHrManager: jest.fn() } as any;
    const svc = new RecruitmentService(repo, notifRepo);
    await svc.offerApplication(1, "42");
    expect(setStatus).toHaveBeenCalledWith(1, "OFFER_PENDING_DEPT_HEAD", "42");
    // 부서장에게 알림
    expect(notifRepo.createForUser).toHaveBeenCalledWith("200", "OFFER_APPROVAL_REQUESTED_DEPT_HEAD", expect.any(Function), 1);
  });

  it("LEADER 도 DEPT_HEAD 도 없으면 OFFER_PENDING_HR 로 직행 (HR 매니저에게 알림)", async () => {
    const app = {
      id: 1, status: "REFERENCE_CHECK", applicantName: "지원자",
      posting: { id: 100, department: { id: 5, headId: null } },
    };
    const setStatus = jest.fn().mockResolvedValue({ id: 1, status: "OFFER_PENDING_HR" });
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findDepartmentLeader: jest.fn().mockResolvedValue(null),
      setApplicationStatus: setStatus,
    } as any);
    const notifRepo = { createForUser: jest.fn(), createForHrManager: jest.fn().mockResolvedValue({}) } as any;
    const svc = new RecruitmentService(repo, notifRepo);
    await svc.offerApplication(1, "42");
    expect(setStatus).toHaveBeenCalledWith(1, "OFFER_PENDING_HR", "42");
    expect(notifRepo.createForHrManager).toHaveBeenCalledWith("OFFER_APPROVAL_REQUESTED_HR", expect.any(Function), 1);
  });

  it("REFERENCE_CHECK 아니면 409 APPLICATION_NOT_IN_REFERENCE_CHECK", async () => {
    const app = { id: 1, status: "INTERVIEW_1", applicantName: "지원자", posting: null };
    const svc = new RecruitmentService(makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
    } as any));
    await expect(svc.offerApplication(1, "42"))
      .rejects.toMatchObject({ statusCode: 409, message: "APPLICATION_NOT_IN_REFERENCE_CHECK" });
  });
});

describe("RecruitmentService.leaderApprove (#370 — LEADER 단계)", () => {
  const buildApp = (over: any = {}) => ({
    id: 1, status: "OFFER_PENDING_LEADER", applicantName: "지원자", offeredById: "42",
    posting: { id: 100, department: { id: 5, headId: "200" } },
    ...over,
  });

  it("LEADER 승인 → DEPT_HEAD 있으면 OFFER_PENDING_DEPT_HEAD 로 전이 + 부서장 알림", async () => {
    const app = buildApp();
    const updateInTx = jest.fn().mockResolvedValue({ id: 1, status: "OFFER_PENDING_DEPT_HEAD" });
    const addApproval = jest.fn().mockResolvedValue({});
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findDepartmentLeader: jest.fn().mockResolvedValue("300"),
      addOfferApproval: addApproval,
      updateApplicationStatusInTx: updateInTx,
    } as any);
    const notifRepo = { createForUser: jest.fn().mockResolvedValue({}), createForHrManager: jest.fn() } as any;
    const svc = new RecruitmentService(repo, notifRepo);
    const result = await svc.leaderApprove(1, "300");
    expect(addApproval).toHaveBeenCalledWith(1, expect.objectContaining({ stage: "LEADER", action: "APPROVED", reviewerId: "300" }), expect.anything());
    expect(updateInTx).toHaveBeenCalledWith(1, "OFFER_PENDING_DEPT_HEAD", expect.anything());
    expect(notifRepo.createForUser).toHaveBeenCalledWith("200", "OFFER_APPROVAL_REQUESTED_DEPT_HEAD", expect.any(Function), 1);
    expect(result.status).toBe("OFFER_PENDING_DEPT_HEAD");
  });

  it("LEADER 승인 → DEPT_HEAD 없으면 OFFER_PENDING_HR 로 skip", async () => {
    const app = buildApp({ posting: { id: 100, department: { id: 5, headId: null } } });
    const updateInTx = jest.fn().mockResolvedValue({ id: 1, status: "OFFER_PENDING_HR" });
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findDepartmentLeader: jest.fn().mockResolvedValue("300"),
      addOfferApproval: jest.fn().mockResolvedValue({}),
      updateApplicationStatusInTx: updateInTx,
    } as any);
    const notifRepo = { createForUser: jest.fn(), createForHrManager: jest.fn().mockResolvedValue({}) } as any;
    const svc = new RecruitmentService(repo, notifRepo);
    await svc.leaderApprove(1, "300");
    expect(updateInTx).toHaveBeenCalledWith(1, "OFFER_PENDING_HR", expect.anything());
    expect(notifRepo.createForHrManager).toHaveBeenCalledWith("OFFER_APPROVAL_REQUESTED_HR", expect.any(Function), 1);
  });

  it("리뷰어가 팀장이 아니면 403 NOT_LEADER", async () => {
    const app = buildApp();
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findDepartmentLeader: jest.fn().mockResolvedValue("300"),
    } as any);
    const svc = new RecruitmentService(repo);
    await expect(svc.leaderApprove(1, "999"))
      .rejects.toMatchObject({ statusCode: 403, message: "NOT_LEADER" });
  });

  it("팀장이 offer 를 initiate 한 본인이면 403 SELF_APPROVAL_FORBIDDEN", async () => {
    // offeredById = 300 (leader 본인이 initiate). leaderApprove(300) 실행 시 self-approval.
    const app = buildApp({ offeredById: "300" });
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findDepartmentLeader: jest.fn().mockResolvedValue("300"),
    } as any);
    const svc = new RecruitmentService(repo);
    await expect(svc.leaderApprove(1, "300"))
      .rejects.toMatchObject({ statusCode: 403, message: "SELF_APPROVAL_FORBIDDEN" });
  });

  it("status 가 OFFER_PENDING_LEADER 아니면 409 INVALID_STATUS", async () => {
    const app = buildApp({ status: "OFFER_PENDING_DEPT_HEAD" });
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
    } as any);
    const svc = new RecruitmentService(repo);
    await expect(svc.leaderApprove(1, "300"))
      .rejects.toMatchObject({ statusCode: 409, message: "INVALID_STATUS" });
  });
});

describe("RecruitmentService.leaderReject (#370 — 팀장 반려)", () => {
  const buildApp = (over: any = {}) => ({
    id: 1, status: "OFFER_PENDING_LEADER", applicantName: "지원자", offeredById: "42",
    posting: { id: 100, department: { id: 5, headId: "200" } },
    ...over,
  });

  it("팀장 반려 → OFFER_LEADER_REJECTED (terminal, 재승인 없음)", async () => {
    const app = buildApp();
    const updateInTx = jest.fn().mockResolvedValue({ id: 1, status: "OFFER_LEADER_REJECTED" });
    const addApproval = jest.fn().mockResolvedValue({});
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      findDepartmentLeader: jest.fn().mockResolvedValue("300"),
      addOfferApproval: addApproval,
      updateApplicationStatusInTx: updateInTx,
    } as any);
    const svc = new RecruitmentService(repo);
    const result = await svc.leaderReject(1, "300", "예산 부족");
    expect(addApproval).toHaveBeenCalledWith(1, expect.objectContaining({ stage: "LEADER", action: "REJECTED", reason: "예산 부족" }), expect.anything());
    expect(updateInTx).toHaveBeenCalledWith(1, "OFFER_LEADER_REJECTED", expect.anything());
    expect(result.status).toBe("OFFER_LEADER_REJECTED");
  });

  it("반려 사유 빠지면 400 REASON_REQUIRED", async () => {
    const svc = new RecruitmentService(makeRepo());
    await expect(svc.leaderReject(1, "300", ""))
      .rejects.toMatchObject({ statusCode: 400, message: "REASON_REQUIRED" });
    await expect(svc.leaderReject(1, "300", "   "))
      .rejects.toMatchObject({ statusCode: 400, message: "REASON_REQUIRED" });
  });
});

describe("RecruitmentService.deptHeadApprove (#370 — 부서장 단계)", () => {
  it("부서장 승인 → OFFER_PENDING_HR 로 전이 + HR 매니저 알림", async () => {
    const app = {
      id: 1, status: "OFFER_PENDING_DEPT_HEAD", applicantName: "지원자", offeredById: "42",
      posting: { id: 100, department: { id: 5, headId: "200" } },
    };
    const updateInTx = jest.fn().mockResolvedValue({ id: 1, status: "OFFER_PENDING_HR" });
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      addOfferApproval: jest.fn().mockResolvedValue({}),
      updateApplicationStatusInTx: updateInTx,
    } as any);
    const notifRepo = { createForUser: jest.fn(), createForHrManager: jest.fn().mockResolvedValue({}) } as any;
    const svc = new RecruitmentService(repo, notifRepo);
    await svc.deptHeadApprove(1, "200");
    expect(updateInTx).toHaveBeenCalledWith(1, "OFFER_PENDING_HR", expect.anything());
    expect(notifRepo.createForHrManager).toHaveBeenCalledWith("OFFER_APPROVAL_REQUESTED_HR", expect.any(Function), 1);
  });

  it("부서장이 아니면 403 NOT_DEPT_HEAD", async () => {
    const app = {
      id: 1, status: "OFFER_PENDING_DEPT_HEAD", applicantName: "지원자", offeredById: "42",
      posting: { id: 100, department: { id: 5, headId: "200" } },
    };
    const svc = new RecruitmentService(makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
    } as any));
    await expect(svc.deptHeadApprove(1, "999"))
      .rejects.toMatchObject({ statusCode: 403, message: "NOT_DEPT_HEAD" });
  });
});

describe("RecruitmentService.hrApprove (#370 — HR 최종 승인 = OFFERED)", () => {
  beforeEach(() => {
    mockJobApplicationUpdate.mockReset();
    mockJobApplicationUpdate.mockResolvedValue({ id: 1, status: "OFFERED" });
  });

  it("HR 승인 → OFFERED 전이 + offeredById/offeredAt stamp + email 발송", async () => {
    const app = {
      id: 1, status: "OFFER_PENDING_HR", applicantName: "지원자",
      email: "candidate@test.com", offeredById: "42",
      posting: { id: 100, department: { id: 5, headId: "200" } },
    };
    const addApproval = jest.fn().mockResolvedValue({});
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      addOfferApproval: addApproval,
    } as any);
    const svc = new RecruitmentService(repo);
    await svc.hrApprove(1, "500");
    expect(addApproval).toHaveBeenCalledWith(1, expect.objectContaining({ stage: "HR", action: "APPROVED", reviewerId: "500" }), expect.anything());
    expect(mockJobApplicationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ status: "OFFERED", offeredById: "500" }),
    }));
    const { sendApplicationStatusEmail } = jest.requireMock("../lib/email");
    expect(sendApplicationStatusEmail).toHaveBeenCalledWith("candidate@test.com", "지원자", "OFFERED");
  });

  it("HR 리뷰어가 offer initiator 본인이면 403 SELF_APPROVAL_FORBIDDEN", async () => {
    // offeredById=500, hrApprove(500) → self approval
    const app = {
      id: 1, status: "OFFER_PENDING_HR", applicantName: "지원자",
      email: "candidate@test.com", offeredById: "500",
      posting: { id: 100, department: { id: 5, headId: "200" } },
    };
    const svc = new RecruitmentService(makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
    } as any));
    await expect(svc.hrApprove(1, "500"))
      .rejects.toMatchObject({ statusCode: 403, message: "SELF_APPROVAL_FORBIDDEN" });
  });

  it("status 가 OFFER_PENDING_HR 아니면 409 INVALID_STATUS", async () => {
    const app = {
      id: 1, status: "OFFER_PENDING_LEADER", applicantName: "지원자", offeredById: "42",
      posting: { id: 100, department: { id: 5, headId: "200" } },
    };
    const svc = new RecruitmentService(makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
    } as any));
    await expect(svc.hrApprove(1, "500"))
      .rejects.toMatchObject({ statusCode: 409, message: "INVALID_STATUS" });
  });
});

describe("RecruitmentService.hrReject (#370 — HR 반려)", () => {
  it("HR 반려 → OFFER_HR_REJECTED (terminal)", async () => {
    const app = {
      id: 1, status: "OFFER_PENDING_HR", applicantName: "지원자", offeredById: "42",
      posting: { id: 100, department: { id: 5, headId: "200" } },
    };
    const updateInTx = jest.fn().mockResolvedValue({ id: 1, status: "OFFER_HR_REJECTED" });
    const repo = makeRepo({
      findApplicationById: jest.fn().mockResolvedValue(app),
      addOfferApproval: jest.fn().mockResolvedValue({}),
      updateApplicationStatusInTx: updateInTx,
    } as any);
    const svc = new RecruitmentService(repo);
    const result = await svc.hrReject(1, "500", "예산 초과");
    expect(updateInTx).toHaveBeenCalledWith(1, "OFFER_HR_REJECTED", expect.anything());
    expect(result.status).toBe("OFFER_HR_REJECTED");
  });
});

describe("RecruitmentService.listOfferApprovalQueue (#370 — 결재함 조회)", () => {
  it("stage=LEADER → repo.findApplicationsPendingLeader 호출", async () => {
    const findPending = jest.fn().mockResolvedValue([]);
    const repo = makeRepo({ findApplicationsPendingLeader: findPending } as any);
    const svc = new RecruitmentService(repo);
    await svc.listOfferApprovalQueue("42", "FRONT_OFFICE", null, "LEADER");
    expect(findPending).toHaveBeenCalledWith("42");
  });

  it("stage=DEPT_HEAD → repo.findApplicationsPendingDeptHead 호출", async () => {
    const findPending = jest.fn().mockResolvedValue([]);
    const repo = makeRepo({ findApplicationsPendingDeptHead: findPending } as any);
    const svc = new RecruitmentService(repo);
    await svc.listOfferApprovalQueue("42", "FRONT_OFFICE", null, "DEPT_HEAD");
    expect(findPending).toHaveBeenCalledWith("42");
  });

  it("stage=HR + canWriteHR → repo.findApplicationsPendingHr 호출", async () => {
    const findPending = jest.fn().mockResolvedValue([]);
    const repo = makeRepo({ findApplicationsPendingHr: findPending } as any);
    const svc = new RecruitmentService(repo);
    await svc.listOfferApprovalQueue("42", "FRONT_OFFICE", "HR_MANAGER", "HR");
    expect(findPending).toHaveBeenCalledWith();
  });

  it("stage=HR + non-HR role → 403 FORBIDDEN (service-layer double-check)", async () => {
    const repo = makeRepo({ findApplicationsPendingHr: jest.fn() } as any);
    const svc = new RecruitmentService(repo);
    await expect(svc.listOfferApprovalQueue("42", "FRONT_OFFICE", "FINANCE_MANAGER", "HR"))
      .rejects.toMatchObject({ statusCode: 403, message: "FORBIDDEN" });
  });
});
