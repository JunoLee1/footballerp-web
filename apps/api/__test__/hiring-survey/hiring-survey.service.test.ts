import { describe, test, it, expect, jest, beforeEach } from '@jest/globals'
import { HiringSurveyService } from '../../src/hiring-survey/hiring-survey.service'
import type { HiringSurveyRepository } from '../../src/hiring-survey/hiring-survey.repo'
import type { PlanReportRepository } from '../../src/plan-report/plan-report.repo'
import type { NotificationRepository } from '../../src/notification/notification.repo'

const makeSurveyRepo = (overrides: Partial<HiringSurveyRepository> = {}): HiringSurveyRepository =>
  ({
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
    create: jest.fn(),
    close: jest.fn(),
    findOpenPastDeadline: jest.fn().mockResolvedValue([]),
    findOpenNearDeadline: jest.fn().mockResolvedValue([]),
    upsertResponse: jest.fn(),
    findResponsesBySurvey: jest.fn().mockResolvedValue([]),
    findResponseById: jest.fn(),
    updateResponse: jest.fn(),
    setResponseStatus: jest.fn(),
    isUserLeaderOfDepartment: jest.fn().mockResolvedValue(true),
    findLeaderUserIdsForDepartments: jest.fn().mockResolvedValue([]),
    createDraft: jest.fn(),
    updateDraft: jest.fn(),
    openDraft: jest.fn(),
    deleteDraft: jest.fn(),
    ...overrides,
  } as unknown as HiringSurveyRepository)

const makePlanRepo = (): PlanReportRepository =>
  ({
    createDraftForSurvey: jest.fn(),
    createHiringPlanItems: jest.fn(),
  } as unknown as PlanReportRepository)

const makeNotifRepo = (): NotificationRepository =>
  ({
    create: jest.fn().mockResolvedValue({}),
    createForHrManager: jest.fn().mockResolvedValue({}),
    createForUsers: jest.fn().mockResolvedValue({}),
    createForUser: jest.fn().mockResolvedValue({}),
    createForDepartmentHead: jest.fn().mockResolvedValue({}),
  } as unknown as NotificationRepository)

const makeSvc = (repoOverrides: Partial<HiringSurveyRepository> = {}) =>
  new HiringSurveyService(makeSurveyRepo(repoOverrides), makePlanRepo(), makeNotifRepo())

const mockRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  close: jest.fn(),
  findOpenPastDeadline: jest.fn(),
  findOpenNearDeadline: jest.fn(),
  upsertResponse: jest.fn(),
  findResponsesBySurvey: jest.fn(),
  findResponseById: jest.fn(),
  updateResponse: jest.fn(),
  setResponseStatus: jest.fn(),
  isUserLeaderOfDepartment: jest.fn(),
  findLeaderUserIdsForDepartments: jest.fn(),
} as any

const mockPlanReportRepo = {
  createDraftForSurvey: jest.fn(),
  createHiringPlanItems: jest.fn(),
} as any

const mockNotifRepo = {
  create: jest.fn(),
  createForHrManager: jest.fn(),
  createForUser: jest.fn(),
  createForDepartmentHead: jest.fn(),
  createForUsers: jest.fn(),
} as any

const service = new HiringSurveyService(mockRepo, mockPlanReportRepo, mockNotifRepo)

beforeEach(() => {
  jest.clearAllMocks()
  // Default all notif helpers to resolved — service uses `.catch()` after `void`
  // on fire-and-forget calls, so undefined returns would blow up with
  // "Cannot read properties of undefined (reading 'catch')".
  mockNotifRepo.create.mockResolvedValue({})
  mockNotifRepo.createForHrManager.mockResolvedValue({})
  mockNotifRepo.createForUser.mockResolvedValue({})
  mockNotifRepo.createForDepartmentHead.mockResolvedValue({})
  mockNotifRepo.createForUsers.mockResolvedValue({})
})

describe('create', () => {
  test('targetDeptIds가 비어있으면 400 TARGET_DEPTS_REQUIRED를 던진다', async () => {
    await expect(
      service.create({ title: '2027 채용 조사', deadlineAt: '2027-01-31', targetDeptIds: [] }, "00000000-0000-4000-8000-000000000001")
    ).rejects.toMatchObject({ statusCode: 400, code: 'TARGET_DEPTS_REQUIRED' })
  })

  test('조사 생성 후 대상 부서장 + 팀장에게 알림을 보낸다', async () => {
    mockRepo.create.mockResolvedValue({
      id: 1,
      title: '2027 채용 조사',
      targetDepartments: [
        { departmentId: 1, department: { id: 1, headId: "00000000-0000-4000-8000-000000000010" } },
        { departmentId: 2, department: { id: 2, headId: "00000000-0000-4000-8000-000000000020" } },
      ],
    })
    mockNotifRepo.create.mockResolvedValue({})
    // 부서 1 팀장: [30], 부서 2 팀장: [] (부서장만)
    mockRepo.findLeaderUserIdsForDepartments.mockResolvedValue(["00000000-0000-4000-8000-000000000030"])

    await service.create({ title: '2027 채용 조사', deadlineAt: '2027-01-31', targetDeptIds: [1, 2] }, "00000000-0000-4000-8000-000000000005")

    // 2 부서장 + 1 팀장 = 3
    expect(mockNotifRepo.create).toHaveBeenCalledTimes(3)
    expect(mockNotifRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000010", type: 'HIRING_SURVEY_OPEN' })
    )
    expect(mockNotifRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000020", type: 'HIRING_SURVEY_OPEN' })
    )
    expect(mockNotifRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000030", type: 'HIRING_SURVEY_OPEN' })
    )
  })
})

describe('createResponse (팀장 DRAFT 작성)', () => {
  test('CLOSED 조사에 응답하면 409 SURVEY_NOT_OPEN', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      status: 'CLOSED',
      targetDepartments: [],
      responses: [],
    })

    await expect(
      service.createResponse(1, 5, "00000000-0000-4000-8000-000000000010",{ roleTitle: '코치', headcount: 1, priority: 'HIGH', reason: '공백' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'SURVEY_NOT_OPEN' })
  })

  test('대상 부서가 아니면 403 NOT_TARGET_DEPARTMENT', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      status: 'OPEN',
      targetDepartments: [{ departmentId: 5, department: { headId: "00000000-0000-4000-8000-000000000099" } }],
      responses: [],
    })

    await expect(
      service.createResponse(1, 99, "00000000-0000-4000-8000-000000000010",{ roleTitle: '코치', headcount: 1, priority: 'HIGH', reason: '공백' })
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_TARGET_DEPARTMENT' })
  })

  test('LEADER 역할이 아니면 403 NOT_LEADER', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      status: 'OPEN',
      targetDepartments: [{ departmentId: 5, department: { headId: "00000000-0000-4000-8000-000000000099" } }],
      responses: [],
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(false)

    await expect(
      service.createResponse(1, 5, "00000000-0000-4000-8000-000000000010",{ roleTitle: '코치', headcount: 1, priority: 'HIGH', reason: '공백' })
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_LEADER' })
  })

  test('정상 응답 시 DRAFT status 로 생성', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      status: 'OPEN',
      targetDepartments: [{ departmentId: 5, department: { headId: "00000000-0000-4000-8000-000000000099" } }],
      responses: [],
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(true)
    mockRepo.upsertResponse.mockResolvedValue({ id: 42, status: 'DRAFT' })

    const result = await service.createResponse(1, 5, "00000000-0000-4000-8000-000000000010",{
      roleTitle: '코치', headcount: 2, priority: 'HIGH', reason: '공백',
    })

    expect(mockRepo.isUserLeaderOfDepartment).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000010", 5)
    expect(mockRepo.upsertResponse).toHaveBeenCalledWith(1, 5, "00000000-0000-4000-8000-000000000010", expect.objectContaining({ roleTitle: '코치' }))
    expect(result.status).toBe('DRAFT')
  })
})

describe('close', () => {
  test('이미 CLOSED된 조사를 닫으면 409 SURVEY_NOT_OPEN을 던진다', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      status: 'CLOSED',
      title: '조사',
      targetDepartments: [],
      responses: [],
    })

    await expect(service.close(1, "00000000-0000-4000-8000-000000000005")).rejects.toMatchObject({ statusCode: 409, code: 'SURVEY_NOT_OPEN' })
  })

  test('close 시 PlanReport DRAFT와 HiringPlanItem을 생성한다', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      status: 'OPEN',
      title: '2027 채용 조사',
      targetDepartments: [],
      responses: [],
    })
    mockRepo.close.mockResolvedValue({})
    mockRepo.findResponsesBySurvey.mockResolvedValue([
      { id: 10, roleTitle: '피지컬 코치', headcount: 1, quarter: 1, priority: 'HIGH', estimatedBudget: null, status: 'APPROVED' },
    ])
    mockPlanReportRepo.createDraftForSurvey.mockResolvedValue({ id: 99 })
    mockPlanReportRepo.createHiringPlanItems.mockResolvedValue({})
    mockNotifRepo.createForHrManager.mockResolvedValue(undefined)

    await service.close(1, "00000000-0000-4000-8000-000000000005")

    expect(mockPlanReportRepo.createDraftForSurvey).toHaveBeenCalledWith(
      expect.objectContaining({ surveyId: 1 })
    )
    expect(mockPlanReportRepo.createHiringPlanItems).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ planReportId: 99, roleTitle: '피지컬 코치' })])
    )
    expect(mockNotifRepo.createForHrManager).toHaveBeenCalledWith(
      'HIRING_SURVEY_CLOSED',
      expect.any(Function),
      1
    )
  })

  test('close 시 부서 응답이 모두 APPROVED 가 아니면 409 RESPONSES_NOT_APPROVED', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      status: 'OPEN',
      title: '2027 채용 조사',
      targetDepartments: [
        { departmentId: 5, department: { id: 5, name: '코칭' } },
        { departmentId: 6, department: { id: 6, name: '의료' } },
      ],
      responses: [
        { id: 100, departmentId: 5, department: { id: 5, name: '코칭' }, status: 'APPROVED' },
        { id: 101, departmentId: 6, department: { id: 6, name: '의료' }, status: 'SUBMITTED' },
      ],
    })

    await expect(service.close(1, "00000000-0000-4000-8000-000000000005")).rejects.toMatchObject({
      statusCode: 409,
      code: 'RESPONSES_NOT_APPROVED',
    })
    expect(mockRepo.close).not.toHaveBeenCalled()
  })

  test('close 시 대상 부서 중 응답이 아예 없어도 409 RESPONSES_NOT_APPROVED', async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      status: 'OPEN',
      title: '2027 채용 조사',
      targetDepartments: [
        { departmentId: 5, department: { id: 5, name: '코칭' } },
      ],
      responses: [], // no response at all
    })

    await expect(service.close(1, "00000000-0000-4000-8000-000000000005")).rejects.toMatchObject({
      statusCode: 409,
      code: 'RESPONSES_NOT_APPROVED',
    })
  })
})

describe('updateResponse (팀장 DRAFT/REJECTED 편집)', () => {
  test('DRAFT 상태 응답은 팀장이 편집 가능', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'DRAFT',
      survey: { status: 'OPEN' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(true)
    mockRepo.updateResponse.mockResolvedValue({ id: 42, status: 'DRAFT', roleTitle: '수정됨' })

    const result = await service.updateResponse(42, "00000000-0000-4000-8000-000000000010",{ roleTitle: '수정됨' })

    expect(mockRepo.updateResponse).toHaveBeenCalledWith(42, expect.objectContaining({ roleTitle: '수정됨' }))
    expect(result.roleTitle).toBe('수정됨')
  })

  test('REJECTED 상태 응답도 편집 가능', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'REJECTED',
      survey: { status: 'OPEN' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(true)
    mockRepo.updateResponse.mockResolvedValue({ id: 42, status: 'REJECTED', roleTitle: '수정' })

    await service.updateResponse(42, "00000000-0000-4000-8000-000000000010",{ roleTitle: '수정' })
    expect(mockRepo.updateResponse).toHaveBeenCalled()
  })

  test('SUBMITTED 상태 응답 편집 시 409 RESPONSE_NOT_EDITABLE', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'SUBMITTED',
      survey: { status: 'OPEN' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(true)

    await expect(
      service.updateResponse(42, "00000000-0000-4000-8000-000000000010",{ roleTitle: '수정' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'RESPONSE_NOT_EDITABLE' })
  })

  test('APPROVED 상태 응답 편집 시 409 RESPONSE_NOT_EDITABLE', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'APPROVED',
      survey: { status: 'OPEN' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(true)

    await expect(
      service.updateResponse(42, "00000000-0000-4000-8000-000000000010",{ roleTitle: '수정' })
    ).rejects.toMatchObject({ statusCode: 409, code: 'RESPONSE_NOT_EDITABLE' })
  })

  test('LEADER 가 아니면 403 NOT_LEADER', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'DRAFT',
      survey: { status: 'OPEN' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(false)

    await expect(
      service.updateResponse(42, "00000000-0000-4000-8000-000000000010",{ roleTitle: '수정' })
    ).rejects.toMatchObject({ statusCode: 403, code: 'NOT_LEADER' })
  })

  test('응답이 없으면 404 RESPONSE_NOT_FOUND', async () => {
    mockRepo.findResponseById.mockResolvedValue(null)

    await expect(
      service.updateResponse(999, "00000000-0000-4000-8000-000000000010",{ roleTitle: '수정' })
    ).rejects.toMatchObject({ statusCode: 404, code: 'RESPONSE_NOT_FOUND' })
  })
})

describe('submitResponse (팀장 DRAFT/REJECTED → SUBMITTED)', () => {
  test('DRAFT 상태 → SUBMITTED 로 전이하고 부서장 알림', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'DRAFT',
      survey: { id: 1, status: 'OPEN', title: '2027 채용 조사' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(true)
    mockRepo.setResponseStatus.mockResolvedValue({ id: 42, status: 'SUBMITTED' })

    const result = await service.submitResponse(42, "00000000-0000-4000-8000-000000000010")

    expect(mockRepo.setResponseStatus).toHaveBeenCalledWith(42, expect.objectContaining({ status: 'SUBMITTED' }))
    expect(result.status).toBe('SUBMITTED')
    expect(mockNotifRepo.createForDepartmentHead).toHaveBeenCalledWith(
      5,
      'SURVEY_RESPONSE_SUBMITTED',
      expect.any(Function),
      42,
    )
  })

  test('REJECTED 상태 → SUBMITTED 로 재제출 가능', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'REJECTED',
      survey: { id: 1, status: 'OPEN', title: '2027 채용 조사' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(true)
    mockRepo.setResponseStatus.mockResolvedValue({ id: 42, status: 'SUBMITTED' })

    await service.submitResponse(42, "00000000-0000-4000-8000-000000000010")
    expect(mockRepo.setResponseStatus).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'SUBMITTED', rejectionReason: null }),
    )
  })

  test('SUBMITTED 상태 재제출은 409 INVALID_TRANSITION', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'SUBMITTED',
      survey: { id: 1, status: 'OPEN' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(true)

    await expect(service.submitResponse(42, "00000000-0000-4000-8000-000000000010")).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_TRANSITION',
    })
  })

  test('LEADER 가 아니면 403 NOT_LEADER', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      status: 'DRAFT',
      survey: { id: 1, status: 'OPEN' },
    })
    mockRepo.isUserLeaderOfDepartment.mockResolvedValue(false)

    await expect(service.submitResponse(42, "00000000-0000-4000-8000-000000000010")).rejects.toMatchObject({
      statusCode: 403, code: 'NOT_LEADER',
    })
  })
})

describe('approveResponse (부서장 SUBMITTED → APPROVED)', () => {
  test('SUBMITTED → APPROVED 전이 + 팀장 알림', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      submittedById: "00000000-0000-4000-8000-000000000010",
      status: 'SUBMITTED',
      survey: { id: 1, status: 'OPEN', title: '2027 채용 조사' },
      department: { id: 5, name: '코칭', headId: "00000000-0000-4000-8000-000000000099" },
    })
    mockRepo.setResponseStatus.mockResolvedValue({ id: 42, status: 'APPROVED' })

    const result = await service.approveResponse(42, "00000000-0000-4000-8000-000000000099")

    expect(mockRepo.setResponseStatus).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'APPROVED', approvedById: "00000000-0000-4000-8000-000000000099" }),
    )
    expect(result.status).toBe('APPROVED')
    expect(mockNotifRepo.createForUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000010",
      'SURVEY_RESPONSE_APPROVED',
      expect.any(Function),
      42,
    )
  })

  test('부서장이 아니면 403 NOT_DEPT_HEAD', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      status: 'SUBMITTED',
      submittedById: "00000000-0000-4000-8000-000000000010",
      departmentId: 5,
      survey: { id: 1, status: 'OPEN' },
      department: { id: 5, name: '코칭', headId: "00000000-0000-4000-8000-000000000099" },
    })

    await expect(service.approveResponse(42, "00000000-0000-4000-8000-000000000077")).rejects.toMatchObject({
      statusCode: 403, code: 'NOT_DEPT_HEAD',
    })
  })

  test('DRAFT 상태 approve 시 409 INVALID_TRANSITION', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      status: 'DRAFT',
      submittedById: "00000000-0000-4000-8000-000000000010",
      departmentId: 5,
      survey: { id: 1, status: 'OPEN' },
      department: { id: 5, name: '코칭', headId: "00000000-0000-4000-8000-000000000099" },
    })

    await expect(service.approveResponse(42, "00000000-0000-4000-8000-000000000099")).rejects.toMatchObject({
      statusCode: 409, code: 'INVALID_TRANSITION',
    })
  })

  test('부서장 = 팀장(자기 자신)이면 self-approve 는 허용 (같은 유저가 두 역할 겸직)', async () => {
    // Rationale: LEADER role check + Department.headId check are separate guards.
    // If the same person holds both, they can self-approve. Not blocking on this
    // because dept.head is typically the org-level leader; if we blocked it we'd
    // deadlock small teams. Extension left for a separate governance PR if needed.
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      status: 'SUBMITTED',
      submittedById: "00000000-0000-4000-8000-000000000099",
      departmentId: 5,
      surveyId: 1,
      survey: { id: 1, status: 'OPEN', title: 'x' },
      department: { id: 5, name: '코칭', headId: "00000000-0000-4000-8000-000000000099" },
    })
    mockRepo.setResponseStatus.mockResolvedValue({ id: 42, status: 'APPROVED' })

    await service.approveResponse(42, "00000000-0000-4000-8000-000000000099")
    expect(mockRepo.setResponseStatus).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'APPROVED', approvedById: "00000000-0000-4000-8000-000000000099" }),
    )
  })

  test('마지막 부서 approve 시 HR 매니저에 HIRING_SURVEY_ALL_RESPONDED 알림', async () => {
    // Approving this response makes all target depts APPROVED.
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      submittedById: "00000000-0000-4000-8000-000000000010",
      status: 'SUBMITTED',
      survey: { id: 1, status: 'OPEN', title: '2027 채용 조사' },
      department: { id: 5, name: '코칭', headId: "00000000-0000-4000-8000-000000000099" },
    })
    mockRepo.setResponseStatus.mockResolvedValue({ id: 42, status: 'APPROVED' })
    // After the transition, findById returns the survey with all APPROVED responses.
    mockRepo.findById.mockResolvedValue({
      id: 1,
      title: '2027 채용 조사',
      targetDepartments: [
        { departmentId: 5, department: { id: 5, name: '코칭' } },
        { departmentId: 6, department: { id: 6, name: '의료' } },
      ],
      responses: [
        { id: 42, departmentId: 5, status: 'APPROVED' },
        { id: 43, departmentId: 6, status: 'APPROVED' },
      ],
    })

    await service.approveResponse(42, "00000000-0000-4000-8000-000000000099")

    // Wait for microtask queue to drain (fire-and-forget uses `void`).
    await new Promise((resolve) => setImmediate(resolve))
    expect(mockNotifRepo.createForHrManager).toHaveBeenCalledWith(
      'HIRING_SURVEY_ALL_RESPONDED',
      expect.any(Function),
      1,
    )
  })

  test('마지막 부서 approve 이 아니면 HIRING_SURVEY_ALL_RESPONDED 알림 안 감', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      submittedById: "00000000-0000-4000-8000-000000000010",
      status: 'SUBMITTED',
      survey: { id: 1, status: 'OPEN', title: '2027 채용 조사' },
      department: { id: 5, name: '코칭', headId: "00000000-0000-4000-8000-000000000099" },
    })
    mockRepo.setResponseStatus.mockResolvedValue({ id: 42, status: 'APPROVED' })
    mockRepo.findById.mockResolvedValue({
      id: 1,
      title: '2027 채용 조사',
      targetDepartments: [
        { departmentId: 5, department: { id: 5, name: '코칭' } },
        { departmentId: 6, department: { id: 6, name: '의료' } },
      ],
      responses: [
        { id: 42, departmentId: 5, status: 'APPROVED' },
        { id: 43, departmentId: 6, status: 'SUBMITTED' }, // still pending
      ],
    })

    await service.approveResponse(42, "00000000-0000-4000-8000-000000000099")

    await new Promise((resolve) => setImmediate(resolve))
    expect(mockNotifRepo.createForHrManager).not.toHaveBeenCalledWith(
      'HIRING_SURVEY_ALL_RESPONDED',
      expect.any(Function),
      expect.anything(),
    )
  })
})

describe('rejectResponse (부서장 SUBMITTED → REJECTED)', () => {
  test('SUBMITTED → REJECTED + rejectionReason 저장 + 팀장 알림', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42,
      surveyId: 1,
      departmentId: 5,
      submittedById: "00000000-0000-4000-8000-000000000010",
      status: 'SUBMITTED',
      survey: { id: 1, status: 'OPEN', title: '2027 채용 조사' },
      department: { id: 5, name: '코칭', headId: "00000000-0000-4000-8000-000000000099" },
    })
    mockRepo.setResponseStatus.mockResolvedValue({ id: 42, status: 'REJECTED' })

    await service.rejectResponse(42, "00000000-0000-4000-8000-000000000099",'예산 재검토 필요')

    expect(mockRepo.setResponseStatus).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ status: 'REJECTED', rejectionReason: '예산 재검토 필요' }),
    )
    expect(mockNotifRepo.createForUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000010",
      'SURVEY_RESPONSE_REJECTED',
      expect.any(Function),
      42,
    )
  })

  test('rejectionReason 빈 문자열이면 400 REJECTION_REASON_REQUIRED', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42, status: 'SUBMITTED', submittedById: "00000000-0000-4000-8000-000000000010", departmentId: 5,
      survey: { id: 1, status: 'OPEN' },
      department: { id: 5, headId: "00000000-0000-4000-8000-000000000099" },
    })

    await expect(service.rejectResponse(42, "00000000-0000-4000-8000-000000000099",'   ')).rejects.toMatchObject({
      statusCode: 400, code: 'REJECTION_REASON_REQUIRED',
    })
  })

  test('부서장이 아니면 403 NOT_DEPT_HEAD', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42, status: 'SUBMITTED', submittedById: "00000000-0000-4000-8000-000000000010", departmentId: 5,
      survey: { id: 1, status: 'OPEN' },
      department: { id: 5, headId: "00000000-0000-4000-8000-000000000099" },
    })
    await expect(service.rejectResponse(42, "00000000-0000-4000-8000-000000000077",'r')).rejects.toMatchObject({
      statusCode: 403, code: 'NOT_DEPT_HEAD',
    })
  })

  test('SUBMITTED 가 아니면 409 INVALID_TRANSITION', async () => {
    mockRepo.findResponseById.mockResolvedValue({
      id: 42, status: 'DRAFT', submittedById: "00000000-0000-4000-8000-000000000010", departmentId: 5,
      survey: { id: 1, status: 'OPEN' },
      department: { id: 5, headId: "00000000-0000-4000-8000-000000000099" },
    })
    await expect(service.rejectResponse(42, "00000000-0000-4000-8000-000000000099",'r')).rejects.toMatchObject({
      statusCode: 409, code: 'INVALID_TRANSITION',
    })
  })
})

describe('HiringSurveyService.updateDraft', () => {
  const draftSurvey = {
    id: 1,
    title: '2026 Q4 채용 수요 조사',
    deadlineAt: new Date('2026-12-31T23:59:59Z'),
    status: 'DRAFT' as const,
    createdById: "00000000-0000-4000-8000-000000000001",
    targetDepartments: [{ department: { id: 10, name: '코칭', headId: "00000000-0000-4000-8000-000000000100" } }],
    responses: [],
  }

  it('DRAFT 상태에서 title/deadlineAt/targetDeptIds 편집 가능', async () => {
    const updateDraft = jest.fn().mockResolvedValue({ ...draftSurvey, title: '수정됨' })
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue(draftSurvey),
      updateDraft,
    })

    const result = await svc.updateDraft(1, { title: '수정됨', targetDeptIds: [20] })

    expect(updateDraft).toHaveBeenCalledWith(1, { title: '수정됨', targetDeptIds: [20] })
    expect(result.title).toBe('수정됨')
  })

  it('OPEN 상태의 survey 는 편집 불가 → 409 SURVEY_NOT_DRAFT', async () => {
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue({ ...draftSurvey, status: 'OPEN' }),
    })

    await expect(svc.updateDraft(1, { title: '수정 시도' })).rejects.toMatchObject({
      statusCode: 409,
      message: 'SURVEY_NOT_DRAFT',
    })
  })

  it('없는 survey 는 404 SURVEY_NOT_FOUND', async () => {
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue(null),
    })

    await expect(svc.updateDraft(999, { title: 'x' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'SURVEY_NOT_FOUND',
    })
  })

  it('deadlineAt string 은 Date 로 변환', async () => {
    const updateDraft = jest.fn().mockResolvedValue(draftSurvey)
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue(draftSurvey),
      updateDraft,
    })

    await svc.updateDraft(1, { deadlineAt: '2027-01-15T00:00:00Z' })

    const callArg = updateDraft.mock.calls[0][1]
    expect(callArg.deadlineAt).toBeInstanceOf(Date)
    expect((callArg.deadlineAt as Date).toISOString()).toBe('2027-01-15T00:00:00.000Z')
  })
})

describe('HiringSurveyService.open', () => {
  const draftSurvey = {
    id: 1,
    title: '2026 Q4 채용 수요 조사',
    deadlineAt: new Date('2026-12-31T23:59:59Z'),
    status: 'DRAFT' as const,
    createdById: "00000000-0000-4000-8000-000000000001",
    targetDepartments: [
      { department: { id: 10, name: '코칭', headId: "00000000-0000-4000-8000-000000000100" } },
      { department: { id: 20, name: '의료', headId: "00000000-0000-4000-8000-000000000200" } },
    ],
    responses: [],
  }

  it('DRAFT → OPEN 전이 시 대상 부서장 + 팀장들에게 HIRING_SURVEY_OPEN 알림', async () => {
    const openDraft = jest.fn().mockResolvedValue({ ...draftSurvey, status: 'OPEN' })
    const notifCreate = jest.fn().mockResolvedValue({})
    const notifRepo = {
      create: notifCreate,
      createForHrManager: jest.fn(),
      createForUsers: jest.fn(),
      createForUser: jest.fn(),
      createForDepartmentHead: jest.fn(),
    } as unknown as NotificationRepository

    const svc = new HiringSurveyService(
      makeSurveyRepo({
        findById: jest.fn().mockResolvedValue(draftSurvey),
        openDraft,
        // 부서 10=팀장 유저 [110], 부서 20=팀장 유저 [210, 211]
        findLeaderUserIdsForDepartments: jest.fn().mockResolvedValue([
          "00000000-0000-4000-8000-000000000110",
          "00000000-0000-4000-8000-000000000210",
          "00000000-0000-4000-8000-000000000211",
        ]),
      }),
      makePlanRepo(),
      notifRepo,
    )

    const result = await svc.open(1)

    expect(openDraft).toHaveBeenCalledWith(1)
    expect(result.status).toBe('OPEN')
    // 부서장 2명 + LEADER 3명 = 총 5명에게 알림
    expect(notifCreate).toHaveBeenCalledTimes(5)
    expect(notifCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000100", type: 'HIRING_SURVEY_OPEN' })
    )
    expect(notifCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000200", type: 'HIRING_SURVEY_OPEN' })
    )
    expect(notifCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000110", type: 'HIRING_SURVEY_OPEN' })
    )
    expect(notifCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000210", type: 'HIRING_SURVEY_OPEN' })
    )
    expect(notifCreate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000211", type: 'HIRING_SURVEY_OPEN' })
    )
  })

  it('DRAFT 아니면 409 SURVEY_NOT_DRAFT', async () => {
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue({ ...draftSurvey, status: 'OPEN' }),
    })

    await expect(svc.open(1)).rejects.toMatchObject({
      statusCode: 409,
      message: 'SURVEY_NOT_DRAFT',
    })
  })

  it('대상 부서 없으면 409 TARGET_DEPTS_REQUIRED', async () => {
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue({ ...draftSurvey, targetDepartments: [] }),
    })

    await expect(svc.open(1)).rejects.toMatchObject({
      statusCode: 409,
      message: 'TARGET_DEPTS_REQUIRED',
    })
  })

  it('deadlineAt 과거면 409 DEADLINE_IN_PAST', async () => {
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue({ ...draftSurvey, deadlineAt: new Date('2020-01-01') }),
    })

    await expect(svc.open(1)).rejects.toMatchObject({
      statusCode: 409,
      message: 'DEADLINE_IN_PAST',
    })
  })
})

describe('HiringSurveyService.deleteDraft', () => {
  const draftSurvey = {
    id: 1,
    title: '2026 Q4 채용 수요 조사',
    deadlineAt: new Date('2026-12-31T23:59:59Z'),
    status: 'DRAFT' as const,
    createdById: "00000000-0000-4000-8000-000000000001",
    targetDepartments: [],
    responses: [],
  }

  it('DRAFT 상태 삭제 성공', async () => {
    const deleteDraft = jest.fn().mockResolvedValue({ id: 1 })
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue(draftSurvey),
      deleteDraft,
    })

    await svc.deleteDraft(1)

    expect(deleteDraft).toHaveBeenCalledWith(1)
  })

  it('DRAFT 아니면 409 SURVEY_NOT_DRAFT', async () => {
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue({ ...draftSurvey, status: 'OPEN' }),
    })

    await expect(svc.deleteDraft(1)).rejects.toMatchObject({
      statusCode: 409,
      message: 'SURVEY_NOT_DRAFT',
    })
  })

  it('없는 survey 는 404', async () => {
    const svc = makeSvc({
      findById: jest.fn().mockResolvedValue(null),
    })

    await expect(svc.deleteDraft(999)).rejects.toMatchObject({
      statusCode: 404,
      message: 'SURVEY_NOT_FOUND',
    })
  })
})

describe('HiringSurveyService.createQuarterlyDraft', () => {
  const targetDeptIds = [10, 20, 30]

  it('DRAFT status 로 survey 생성 + HR 매니저에게 HIRING_SURVEY_DRAFT_CREATED 알림', async () => {
    const createDraft = jest.fn().mockResolvedValue({
      id: 42,
      title: '2026 Q4 채용 수요 조사',
      status: 'DRAFT',
      targetDepartments: targetDeptIds.map((id) => ({ department: { id, name: 'x', headId: null } })),
    })
    const notifHrCreate = jest.fn().mockResolvedValue({})
    const notifRepo = {
      create: jest.fn(),
      createForHrManager: notifHrCreate,
      createForUsers: jest.fn(),
    } as unknown as NotificationRepository

    const svc = new HiringSurveyService(
      makeSurveyRepo({ createDraft }),
      makePlanRepo(),
      notifRepo,
    )

    const result = await svc.createQuarterlyDraft({
      title: '2026 Q4 채용 수요 조사',
      deadlineAt: new Date('2026-12-31T23:59:59Z'),
      targetDeptIds,
      systemUserId: "00000000-0000-4000-8000-000000000001",
    })

    expect(createDraft).toHaveBeenCalledWith({
      title: '2026 Q4 채용 수요 조사',
      deadlineAt: new Date('2026-12-31T23:59:59Z'),
      targetDeptIds,
      createdById: "00000000-0000-4000-8000-000000000001",
    })
    expect(result.id).toBe(42)
    expect(notifHrCreate).toHaveBeenCalledWith(
      'HIRING_SURVEY_DRAFT_CREATED',
      expect.any(Function),
      42,
    )
  })

  it('targetDeptIds 비어있으면 400 TARGET_DEPTS_REQUIRED (defensive)', async () => {
    const svc = makeSvc()
    await expect(
      svc.createQuarterlyDraft({
        title: 'x',
        deadlineAt: new Date(),
        targetDeptIds: [],
        systemUserId: "00000000-0000-4000-8000-000000000001",
      })
    ).rejects.toMatchObject({ statusCode: 400, message: 'TARGET_DEPTS_REQUIRED' })
  })

  it('title 없으면 400 TITLE_REQUIRED', async () => {
    const svc = makeSvc()
    await expect(
      svc.createQuarterlyDraft({
        title: '',
        deadlineAt: new Date(),
        targetDeptIds: [10],
        systemUserId: "00000000-0000-4000-8000-000000000001",
      })
    ).rejects.toMatchObject({ statusCode: 400, message: 'TITLE_REQUIRED' })
  })

  it('deadlineAt 없으면 400 DEADLINE_REQUIRED', async () => {
    const svc = makeSvc()
    await expect(
      svc.createQuarterlyDraft({
        title: 'x',
        deadlineAt: undefined as any,
        targetDeptIds: [10],
        systemUserId: "00000000-0000-4000-8000-000000000001",
      })
    ).rejects.toMatchObject({ statusCode: 400, message: 'DEADLINE_REQUIRED' })
  })
})
