import { describe, test, expect, jest, beforeEach } from '@jest/globals'

jest.mock('../../src/lib/auditLog', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}))

import { PlanReportService } from '../../src/plan-report/plan-report.service'
import { PlanReportRepository } from '../../src/plan-report/plan-report.repo'
import { writeAuditLog } from '../../src/lib/auditLog'

const mockRepo = {
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  getClubSettings: jest.fn(),
  submit: jest.fn(),
  findRulesByType: jest.fn(),
  findDeptsByCategory: jest.fn(),
  submitWithReviews: jest.fn(),
  allReviewsComplete: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  submitResult: jest.fn(),
  findApprovedHrReports: jest.fn(),
} as any

const mockNotifRepo = {
  createForHrManager: jest.fn(),
  createForDepartmentHead: jest.fn().mockResolvedValue(undefined),
} as any

const service = new PlanReportService(mockRepo, mockNotifRepo)

beforeEach(() => jest.clearAllMocks())

// A helper that sets up a minimal DRAFT plan with the given overrides
function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    status: 'DRAFT',
    title: '테스트 계획서',
    templateType: 'GENERAL',
    budget: 0,
    isNewBusiness: false,
    hasNewStaff: false,
    hasContract: false,
    hasExternalLease: false,
    hasPersonalInfo: false,
    department: { id: 10, name: '운영팀', headId: "00000000-0000-4000-8000-000000000007" },
    ...overrides,
  }
}

describe('submit — HR templateType은 항상 ADMIN 승인 레벨이어야 한다', () => {
  test('templateType이 HR이면 requiredApproverLevel로 ADMIN을 전달한다', async () => {
    mockRepo.findById.mockResolvedValue(makePlan({ templateType: 'HR' }))
    mockRepo.getClubSettings.mockResolvedValue({
      reviewerDeptMap: {},
      planApprovalLimit: 5_000_000,
    })
    mockRepo.submit.mockResolvedValue({ id: 1, status: 'REVIEWING' })

    // userId 7 matches headId 7
    await service.submit(1, "00000000-0000-4000-8000-000000000007")

    expect(mockRepo.submit).toHaveBeenCalledWith(
      1,
      expect.any(Array),
      'ADMIN'
    )
  })
})

describe('submit — HR templateType 은 재무팀을 reviewer 로 자동 포함 (#369)', () => {
  test('HR + reviewerDeptMap.finance 설정됨 → reviewerDeptIds 에 finance 부서 id 포함', async () => {
    mockRepo.findById.mockResolvedValue(makePlan({ templateType: 'HR' }))
    mockRepo.getClubSettings.mockResolvedValue({
      reviewerDeptMap: { finance: 55 },
      planApprovalLimit: 5_000_000,
    })
    mockRepo.submit.mockResolvedValue({ id: 1, status: 'REVIEWING' })

    await service.submit(1, "00000000-0000-4000-8000-000000000007")

    const call = mockRepo.submit.mock.calls[0]
    expect(call[1]).toContain(55)
  })

  test('GENERAL + reviewerDeptMap.finance 설정됨 → finance 부서 포함되지 않음', async () => {
    mockRepo.findById.mockResolvedValue(makePlan({ templateType: 'GENERAL' }))
    mockRepo.getClubSettings.mockResolvedValue({
      reviewerDeptMap: { finance: 55 },
      planApprovalLimit: 5_000_000,
    })
    mockRepo.submit.mockResolvedValue({ id: 1, status: 'REVIEWING' })

    await service.submit(1, "00000000-0000-4000-8000-000000000007")

    const call = mockRepo.submit.mock.calls[0]
    expect(call[1]).not.toContain(55)
  })

  test('HR + reviewerDeptMap.finance 미설정 → finance skip + console.warn 호출', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRepo.findById.mockResolvedValue(makePlan({ templateType: 'HR' }))
    mockRepo.getClubSettings.mockResolvedValue({
      reviewerDeptMap: {},
      planApprovalLimit: 5_000_000,
    })
    mockRepo.submit.mockResolvedValue({ id: 1, status: 'REVIEWING' })

    await service.submit(1, "00000000-0000-4000-8000-000000000007")

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/finance/i))
    warnSpy.mockRestore()
  })
})

describe('submit — GENERAL 예산 초과 시 GM 승인 레벨', () => {
  test('templateType이 GENERAL이고 예산이 한도 초과이면 requiredApproverLevel로 GM을 전달한다', async () => {
    mockRepo.findById.mockResolvedValue(
      makePlan({ templateType: 'GENERAL', budget: 10_000_000, isNewBusiness: false })
    )
    mockRepo.getClubSettings.mockResolvedValue({
      reviewerDeptMap: {},
      planApprovalLimit: 5_000_000,
    })
    mockRepo.submit.mockResolvedValue({ id: 1, status: 'REVIEWING' })

    await service.submit(1, "00000000-0000-4000-8000-000000000007")

    expect(mockRepo.submit).toHaveBeenCalledWith(
      1,
      expect.any(Array),
      'GM'
    )
  })
})

describe('PlanReportRepository.findApprovedHrReports', () => {
  const makePrismaMock = (findManyResult: any[] = []) => ({
    planReport: {
      findMany: jest.fn().mockResolvedValue(findManyResult),
    },
  } as any)

  test('HR + APPROVED + no HiringPlanItems 인 계획서 반환', async () => {
    const prisma = makePrismaMock([
      { id: 1, title: 'legacy plan', departmentId: 10, department: { id: 10, name: '코칭' }, approvedAt: new Date() },
    ])
    const repo = new PlanReportRepository(prisma)
    const result = await repo.findApprovedHrReports()

    expect(result).toHaveLength(1)
    expect(prisma.planReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'APPROVED',
          templateType: 'HR',
          OR: expect.arrayContaining([
            { hiringPlanItems: { none: {} } },
            { hiringPlanItems: { some: { jobPostings: { none: {} } } } },
          ]),
        }),
      }),
    )
  })

  test('query 는 미완료 HiringPlanItem 조건을 포함해야 함 (regression)', async () => {
    const prisma = makePrismaMock([])
    const repo = new PlanReportRepository(prisma)
    await repo.findApprovedHrReports()

    const call = (prisma.planReport.findMany as jest.Mock).mock.calls[0][0] as any
    // OR 안에 정확히 2개 조건이 있어야 함
    expect(call.where.OR).toHaveLength(2)
    expect(call.where.OR).toContainEqual({ hiringPlanItems: { none: {} } })
    expect(call.where.OR).toContainEqual({ hiringPlanItems: { some: { jobPostings: { none: {} } } } })
  })

  test('fully-completed PlanReport 는 제외되어야 함 (regression: OR predicate 는 미완료 잔여 검사)', async () => {
    const prisma = makePrismaMock([])
    const repo = new PlanReportRepository(prisma)
    await repo.findApprovedHrReports()

    const call = (prisma.planReport.findMany as jest.Mock).mock.calls[0][0] as any
    // "some HiringPlanItem 이 미연결 JobPosting" 절이 반드시 있어야 fully-completed 는 배제됨
    expect(call.where.OR).toContainEqual({
      hiringPlanItems: { some: { jobPostings: { none: {} } } },
    })
    // legacy "no HiringPlanItems" 절도 유지되어야 함
    expect(call.where.OR).toContainEqual({ hiringPlanItems: { none: {} } })
  })
})

describe('PlanReportService.cancelHiringPlanItem', () => {
  const ACTOR_ID = "00000000-0000-4000-8000-000000000042"
  const makeCtx = (repoOverrides: any = {}) => {
    const repo = {
      findHiringPlanItemById: jest.fn(),
      cancelHiringPlanItem: jest.fn(),
      ...repoOverrides,
    } as any
    return { svc: new PlanReportService(repo), repo }
  }

  test('DRAFT/IN_PROGRESS item cancel 성공', async () => {
    const { svc, repo } = makeCtx({
      findHiringPlanItemById: jest.fn().mockResolvedValue({
        id: 500, planReportId: 1, status: 'IN_PROGRESS',
      }),
      cancelHiringPlanItem: jest.fn().mockResolvedValue({ id: 500, status: 'CANCELLED' }),
    })
    const result = await svc.cancelHiringPlanItem(500, 1, ACTOR_ID)
    expect(repo.cancelHiringPlanItem).toHaveBeenCalledWith(500)
    expect(result.status).toBe('CANCELLED')
    expect(writeAuditLog).toHaveBeenCalledWith({
      actorId: ACTOR_ID,
      action: 'HIRING_PLAN_ITEM_CANCELLED',
      targetId: 500,
    })
  })

  test('없는 item → 404 HIRING_PLAN_ITEM_NOT_FOUND', async () => {
    const { svc } = makeCtx({
      findHiringPlanItemById: jest.fn().mockResolvedValue(null),
    })
    await expect(svc.cancelHiringPlanItem(999, 1, ACTOR_ID))
      .rejects.toMatchObject({ statusCode: 404, message: 'HIRING_PLAN_ITEM_NOT_FOUND' })
  })

  test('다른 planReport 소속 → 400 HIRING_PLAN_ITEM_MISMATCH', async () => {
    const { svc } = makeCtx({
      findHiringPlanItemById: jest.fn().mockResolvedValue({
        id: 500, planReportId: 999, status: 'PLANNED',
      }),
    })
    await expect(svc.cancelHiringPlanItem(500, 1, ACTOR_ID))
      .rejects.toMatchObject({ statusCode: 400, message: 'HIRING_PLAN_ITEM_MISMATCH' })
  })

  test('이미 CANCELLED → 409 HIRING_PLAN_ITEM_ALREADY_CANCELLED', async () => {
    const { svc } = makeCtx({
      findHiringPlanItemById: jest.fn().mockResolvedValue({
        id: 500, planReportId: 1, status: 'CANCELLED',
      }),
    })
    await expect(svc.cancelHiringPlanItem(500, 1, ACTOR_ID))
      .rejects.toMatchObject({ statusCode: 409, message: 'HIRING_PLAN_ITEM_ALREADY_CANCELLED' })
  })
})

describe('PlanReportRepository.listHiringPlanItems (status filter)', () => {
  const makePrismaMock = () => ({
    hiringPlanItem: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any)

  test('status filter 없으면 planReportId 만 매칭', async () => {
    const prisma = makePrismaMock()
    const repo = new PlanReportRepository(prisma)
    await repo.listHiringPlanItems(1)
    const call = (prisma.hiringPlanItem.findMany as jest.Mock).mock.calls[0][0]
    expect(call.where).toEqual({ planReportId: 1 })
  })

  test('status filter 있으면 status: { in: [...] } 추가', async () => {
    const prisma = makePrismaMock()
    const repo = new PlanReportRepository(prisma)
    await repo.listHiringPlanItems(1, ['PLANNED', 'IN_PROGRESS'])
    const call = (prisma.hiringPlanItem.findMany as jest.Mock).mock.calls[0][0]
    expect(call.where).toEqual({
      planReportId: 1,
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    })
  })
})
