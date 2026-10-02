import * as fs from 'fs/promises'
import { writeApprovalVaultNote, appendResultToVaultNote, VaultPlanData } from '../../src/plan-report/vault'

jest.mock('fs/promises')
const mockFs = fs as jest.Mocked<typeof fs>

const baseData: VaultPlanData = {
  id: 1,
  title: '여름 마케팅 캠페인',
  templateType: 'MARKETING',
  departmentName: '마케팅',
  budget: 5000000,
  purpose: '팬 유치',
  expectedEffect: '관중 10% 증가',
  risks: '날씨 변수',
  attachments: ['https://drive.google.com/abc'],
  startDate: new Date('2026-07-01'),
  endDate: new Date('2026-08-31'),
  resultDueDate: new Date('2026-09-30'),
  approvedAt: new Date('2026-08-10'),
  approvedByUsername: 'admin',
  reviews: [{ deptName: '법무', confirmedByUsername: 'legal_head', confirmedAt: new Date('2026-08-09') }],
  extraFields: { campaign: '여름 페스타', target: '2030세대' },
}

describe('writeApprovalVaultNote', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFs.mkdir.mockResolvedValue(undefined)
    mockFs.writeFile.mockResolvedValue(undefined)
  })

  it('반환 경로가 연도 디렉토리 + .md 파일이다', async () => {
    const result = await writeApprovalVaultNote(baseData)
    expect(result).toContain('/2026/')
    expect(result).toMatch(/\.md$/)
  })

  it('연도 디렉토리를 recursive 생성한다', async () => {
    await writeApprovalVaultNote(baseData)
    expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringContaining('2026'), { recursive: true })
  })

  it('노트에 planId frontmatter와 결과보고 미완료 섹션이 포함된다', async () => {
    await writeApprovalVaultNote(baseData)
    const content = mockFs.writeFile.mock.calls[0]?.[1] as string
    expect(content).toContain('planId: 1')
    expect(content).toContain('## 결과보고 (제출: 미완료)')
    expect(content).toContain('여름 페스타')
  })

  it('extraFields 없으면 업무별 섹션이 없다', async () => {
    await writeApprovalVaultNote({ ...baseData, extraFields: null })
    const content = mockFs.writeFile.mock.calls[0]?.[1] as string
    expect(content).not.toContain('## 업무별 추가사항')
  })

  it('첨부자료가 노트에 포함된다', async () => {
    await writeApprovalVaultNote(baseData)
    const content = mockFs.writeFile.mock.calls[0]?.[1] as string
    expect(content).toContain('https://drive.google.com/abc')
  })
})

describe('appendResultToVaultNote', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('미완료 플레이스홀더를 결과 섹션으로 교체한다', async () => {
    const existing = 'some content\n## 결과보고 (제출: 미완료)\n'
    mockFs.readFile.mockResolvedValue(existing as any)
    mockFs.writeFile.mockResolvedValue(undefined)

    await appendResultToVaultNote('/vault/2026/plan.md', {
      content: '목표 달성 완료',
      submittedAt: new Date('2026-09-15'),
      submittedByUsername: 'user1',
    })

    const written = mockFs.writeFile.mock.calls[0]?.[1] as string
    expect(written).toContain('## 결과보고 (제출: 2026-09-15)')
    expect(written).toContain('목표 달성 완료')
    expect(written).not.toContain('## 결과보고 (제출: 미완료)')
  })
})
