import { describe, test, jest, expect, beforeEach } from '@jest/globals'
import { SafeguardService } from '../../src/safeguard/safeguard.service'

jest.mock('../../src/lib/auditLog', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}))

const mockRepo = {
  create: jest.fn(),
  findAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  suspendUser: jest.fn<() => Promise<any>>().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000005", isSuspended: true }),
  findEmergencyRecipients: jest.fn<() => Promise<any[]>>().mockResolvedValue([
    { id: "00000000-0000-4000-8000-000000000001" },
    { id: "00000000-0000-4000-8000-000000000002" },
  ]),
  createExternalReports: jest.fn<() => Promise<any>>().mockResolvedValue({ count: 3 }),
} as any

const mockNotifRepo = {
  createForUser: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 10 }),
} as any

const service = new SafeguardService(mockRepo, mockNotifRepo)

describe('SafeguardService - submit', () => {
  beforeEach(() => jest.clearAllMocks())

  test('제보 저장 후 신고서 반환', async () => {
    mockRepo.create.mockResolvedValue({ id: 1, description: '테스트', status: 'RECEIVED' })
    const result = await service.submit({ description: '테스트 신고 내용입니다' })
    expect(mockRepo.create).toHaveBeenCalledWith({ description: '테스트 신고 내용입니다' })
    expect(result.status).toBe('RECEIVED')
  })

  test('accusedUserId 있으면 계정 정지 처리', async () => {
    mockRepo.create.mockResolvedValue({ id: 2, description: '폭행', status: 'RECEIVED', accusedUserId: "00000000-0000-4000-8000-000000000005" })
    await service.submit({ description: '폭행 목격 신고입니다', accusedUserId: "00000000-0000-4000-8000-000000000005" })
    await new Promise(r => setTimeout(r, 10)) // fire-and-forget 대기
    expect(mockRepo.suspendUser).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000005")
  })

  test('accusedUserId 없으면 계정 정지 없음', async () => {
    mockRepo.create.mockResolvedValue({ id: 3, description: '익명 신고', status: 'RECEIVED', accusedUserId: null })
    await service.submit({ description: '익명 신고 내용입니다' })
    await new Promise(r => setTimeout(r, 10))
    expect(mockRepo.suspendUser).not.toHaveBeenCalled()
  })

  test('긴급 알림을 GM·TD·의무에게 발송', async () => {
    mockRepo.create.mockResolvedValue({ id: 4, description: '긴급', status: 'RECEIVED', accusedUserId: null })
    await service.submit({ description: '긴급 신고 내용 입력' })
    await new Promise(r => setTimeout(r, 10))
    expect(mockRepo.findEmergencyRecipients).toHaveBeenCalled()
    expect(mockNotifRepo.createForUser).toHaveBeenCalledTimes(2)
    expect(mockNotifRepo.createForUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001", 'SAFEGUARD_EMERGENCY', expect.any(Function), 4,
    )
  })

  test('ExternalReport 3건 자동 생성', async () => {
    mockRepo.create.mockResolvedValue({ id: 5, description: '보고서', status: 'RECEIVED', accusedUserId: null })
    await service.submit({ description: '외부 보고서 테스트입니다' })
    await new Promise(r => setTimeout(r, 10))
    expect(mockRepo.createExternalReports).toHaveBeenCalledWith(5)
  })
})

describe('SafeguardService - updateStatus', () => {
  beforeEach(() => jest.clearAllMocks())

  test('RECEIVED 상태에서 UNDER_REVIEW로 전환', async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: 'RECEIVED' })
    mockRepo.updateStatus.mockResolvedValue({ id: 1, status: 'UNDER_REVIEW' })
    const result = await service.updateStatus(1, { status: 'UNDER_REVIEW' })
    expect(result.status).toBe('UNDER_REVIEW')
  })

  test('RESOLVED 상태에서 변경 불가 → 409', async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: 'RESOLVED' })
    await expect(service.updateStatus(1, { status: 'UNDER_REVIEW' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_RESOLVED',
    })
  })

  test('존재하지 않는 보고서 → 404', async () => {
    mockRepo.findById.mockResolvedValue(null)
    await expect(service.updateStatus(99, { status: 'UNDER_REVIEW' })).rejects.toMatchObject({
      statusCode: 404,
      code: 'SAFEGUARD_REPORT_NOT_FOUND',
    })
  })
})
