import { PlanReportService } from './plan-report.service'
import { AppError } from '../lib/appError'
import type { PlanReportRepository } from './plan-report.repo'

jest.mock('./vault', () => ({
  writeApprovalVaultNote: jest.fn().mockResolvedValue('/vault/2026/plan.md'),
  appendResultToVaultNote: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../lib/auditLog', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}))

const HEAD_USER_ID = '55555555-5555-5555-5555-555555555555'
const ADMIN_USER_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_USER_ID = '99999999-9999-9999-9999-999999999999'

const makePlan = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  title: '테스트 계획',
  purpose: '목적',
  departmentId: 10,
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-08-31'),
  budget: 5000000,
  expectedEffect: '기대효과',
  risks: '리스크',
  attachments: [],
  resultDueDate: new Date('2026-09-30'),
  templateType: 'GENERAL',
  extraFields: null,
  hasNewStaff: false,
  hasContract: false,
  hasExternalLease: false,
  hasPersonalInfo: false,
  isNewBusiness: false,
  status: 'DRAFT',
  requiredApproverLevel: null,
  rejectionReason: null,
  resultContent: null,
  resultSubmittedAt: null,
  submittedAt: null,
  approvedAt: null,
  rejectedAt: null,
  vaultPath: null,
  createdById: HEAD_USER_ID,
  approvedById: null,
  department: { id: 10, name: '마케팅', headId: HEAD_USER_ID },
  createdBy: { id: HEAD_USER_ID, username: 'user1' },
  approvedBy: null,
  reviews: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeRepo = (overrides: Partial<PlanReportRepository> = {}): PlanReportRepository => ({
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation(async (dto, id) => makePlan({ createdById: id })),
  update: jest.fn().mockImplementation(async (id, dto) => makePlan(dto)),
  submit: jest.fn().mockImplementation(async (id) => makePlan({ id, status: 'REVIEWING' })),
  allReviewsComplete: jest.fn().mockResolvedValue(true),
  approve: jest.fn().mockImplementation(async (id, approverId, vaultPath) => makePlan({ id, status: 'APPROVED', approvedById: approverId, vaultPath })),
  reject: jest.fn().mockImplementation(async (id, userId, reason) => makePlan({ id, status: 'DRAFT', rejectionReason: reason })),
  submitResult: jest.fn().mockImplementation(async (id, content) => makePlan({ id, resultContent: content })),
  getClubSettings: jest.fn().mockResolvedValue({ id: 1, currency: 'KRW', ibiBeta: 1.0, planApprovalLimit: 10000000, reviewerDeptMap: null }),
  ...overrides,
} as unknown as PlanReportRepository)

describe('PlanReportService.getById', () => {
  it('계획서가 없으면 404를 던진다', async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) })
    const service = new PlanReportService(repo)
    await expect(service.getById(999)).rejects.toThrow(new AppError(404, 'PLAN_REPORT_NOT_FOUND'))
  })

  it('계획서가 있으면 반환한다', async () => {
    const plan = makePlan()
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    const result = await service.getById(1)
    expect(result.id).toBe(1)
  })
})

describe('PlanReportService.update', () => {
  it('APPROVED 상태에서 수정하면 409를 던진다', async () => {
    const plan = makePlan({ status: 'APPROVED' })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await expect(service.update(1, { title: '변경' }, ADMIN_USER_ID, 'ADMIN')).rejects.toThrow(new AppError(409, 'CANNOT_MODIFY_APPROVED_PLAN'))
  })
})

describe('PlanReportService.submit', () => {
  it('DRAFT가 아닌 상태에서 상신하면 409를 던진다', async () => {
    const plan = makePlan({ status: 'REVIEWING' })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await expect(service.submit(1, HEAD_USER_ID)).rejects.toThrow(new AppError(409, 'CANNOT_SUBMIT_NON_DRAFT'))
  })

  it('부서장이 아닌 사용자가 상신하면 403을 던진다', async () => {
    const plan = makePlan({ department: { id: 10, name: '마케팅', headId: HEAD_USER_ID } })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await expect(service.submit(1, OTHER_USER_ID)).rejects.toThrow(new AppError(403, 'ONLY_HEAD_CAN_SUBMIT'))
  })

  it('신규 사업이면 requiredApproverLevel이 ADMIN이다', async () => {
    const plan = makePlan({ isNewBusiness: true })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await service.submit(1, HEAD_USER_ID)
    expect(repo.submit).toHaveBeenCalledWith(1, [], 'ADMIN')
  })

  it('예산이 한도 초과면 requiredApproverLevel이 GM이다', async () => {
    const plan = makePlan({ budget: 15000000 })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await service.submit(1, HEAD_USER_ID)
    expect(repo.submit).toHaveBeenCalledWith(1, [], 'GM')
  })

  it('일반 계획은 requiredApproverLevel이 null이다', async () => {
    const plan = makePlan({ budget: 5000000 })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await service.submit(1, HEAD_USER_ID)
    expect(repo.submit).toHaveBeenCalledWith(1, [], null)
  })

  it('hasNewStaff이면 hr 부서가 협조 목록에 추가된다', async () => {
    const plan = makePlan({ hasNewStaff: true })
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(plan),
      getClubSettings: jest.fn().mockResolvedValue({ planApprovalLimit: 10000000, reviewerDeptMap: { hr: 20, legal: 30 } }),
    })
    const service = new PlanReportService(repo)
    await service.submit(1, HEAD_USER_ID)
    expect(repo.submit).toHaveBeenCalledWith(1, [20], null)
  })
})

describe('PlanReportService.approve', () => {
  it('REVIEWING이 아닌 상태에서 승인하면 409를 던진다', async () => {
    const plan = makePlan({ status: 'DRAFT' })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await expect(service.approve(1, ADMIN_USER_ID, 'ADMIN')).rejects.toThrow(new AppError(409, 'CANNOT_APPROVE_NON_REVIEWING'))
  })

  it('권한 없는 역할이 승인하면 403을 던진다', async () => {
    const plan = makePlan({ status: 'REVIEWING', requiredApproverLevel: 'ADMIN' })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await expect(service.approve(1, ADMIN_USER_ID, 'FRONT_OFFICE')).rejects.toThrow(new AppError(403, 'FORBIDDEN'))
  })

  it('협조 검토가 미완료이면 409를 던진다', async () => {
    const plan = makePlan({ status: 'REVIEWING' })
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(plan),
      allReviewsComplete: jest.fn().mockResolvedValue(false),
    })
    const service = new PlanReportService(repo)
    await expect(service.approve(1, ADMIN_USER_ID, 'ADMIN')).rejects.toThrow(new AppError(409, 'REVIEWS_NOT_COMPLETE'))
  })

  it('승인 성공 시 vault에 노트를 기록한다', async () => {
    const { writeApprovalVaultNote } = jest.requireMock('./vault')
    const plan = makePlan({ status: 'REVIEWING' })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await service.approve(1, ADMIN_USER_ID, 'ADMIN')
    expect(writeApprovalVaultNote).toHaveBeenCalled()
    expect(repo.approve).toHaveBeenCalledWith(1, ADMIN_USER_ID, '/vault/2026/plan.md')
  })
})

describe('PlanReportService.reject', () => {
  it('권한 없는 역할이 반려하면 403을 던진다', async () => {
    const repo = makeRepo()
    const service = new PlanReportService(repo)
    await expect(service.reject(1, ADMIN_USER_ID, 'FRONT_OFFICE', '사유')).rejects.toThrow(new AppError(403, 'FORBIDDEN'))
  })

  it('반려 사유가 없으면 400을 던진다', async () => {
    const repo = makeRepo()
    const service = new PlanReportService(repo)
    await expect(service.reject(1, ADMIN_USER_ID, 'ADMIN', '')).rejects.toThrow(new AppError(400, 'REJECTION_REASON_REQUIRED'))
  })

  it('REVIEWING이 아닌 상태에서 반려하면 409를 던진다', async () => {
    const plan = makePlan({ status: 'DRAFT' })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await expect(service.reject(1, ADMIN_USER_ID, 'ADMIN', '사유')).rejects.toThrow(new AppError(409, 'CANNOT_REJECT_NON_REVIEWING'))
  })
})

describe('PlanReportService.submitResult', () => {
  it('결과 내용이 없으면 400을 던진다', async () => {
    const repo = makeRepo()
    const service = new PlanReportService(repo)
    await expect(service.submitResult(1, ADMIN_USER_ID, '', 'ADMIN')).rejects.toThrow(new AppError(400, 'RESULT_CONTENT_REQUIRED'))
  })

  it('APPROVED가 아닌 계획에 결과보고하면 409를 던진다', async () => {
    const plan = makePlan({ status: 'REVIEWING' })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await expect(service.submitResult(1, ADMIN_USER_ID, '결과', 'ADMIN')).rejects.toThrow(new AppError(409, 'PLAN_NOT_APPROVED'))
  })

  it('vaultPath가 있으면 vault note를 업데이트한다', async () => {
    const { appendResultToVaultNote } = jest.requireMock('./vault')
    const plan = makePlan({ status: 'APPROVED', vaultPath: '/vault/2026/plan.md' })
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(plan) })
    const service = new PlanReportService(repo)
    await service.submitResult(1, ADMIN_USER_ID, '결과 완료', 'ADMIN')
    expect(appendResultToVaultNote).toHaveBeenCalledWith('/vault/2026/plan.md', expect.objectContaining({ content: '결과 완료' }))
  })
})
