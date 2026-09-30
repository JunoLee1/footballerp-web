import * as fs from 'fs/promises'
import * as path from 'path'

const VAULT_BASE = '/Users/juno/ObsidianVault/plans'

export interface VaultPlanData {
  id: string
  title: string
  templateType: string
  departmentName: string
  budget: number
  purpose: string
  expectedEffect: string
  risks: string
  attachments: string[]
  startDate: Date
  endDate: Date
  resultDueDate: Date
  approvedAt: Date
  approvedByUsername: string
  reviews: Array<{ deptName: string; confirmedByUsername: string; confirmedAt: Date }>
  extraFields?: Record<string, unknown> | null
}

export async function writeApprovalVaultNote(data: VaultPlanData): Promise<string> {
  const year = data.approvedAt.getFullYear().toString()
  const dateStr = data.approvedAt.toISOString().slice(0, 10)
  const safeTitle = data.title.replace(/[^\w가-힣]/g, '-').replace(/-+/g, '-').slice(0, 40)
  const slug = `${dateStr}-${data.departmentName}-${safeTitle}`
  const dir = path.join(VAULT_BASE, year)
  const filePath = path.join(dir, `${slug}.md`)

  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(filePath, buildNoteContent(data), 'utf-8')
  return filePath
}

export async function appendResultToVaultNote(
  vaultPath: string,
  result: { content: string; submittedAt: Date; submittedByUsername: string }
): Promise<void> {
  const existing = await fs.readFile(vaultPath, 'utf-8')
  const section =
    `\n## 결과보고 (제출: ${result.submittedAt.toISOString().slice(0, 10)})\n\n` +
    `**제출자:** ${result.submittedByUsername}\n\n${result.content}\n`
  await fs.writeFile(vaultPath, existing.replace('## 결과보고 (제출: 미완료)', section), 'utf-8')
}

function buildNoteContent(data: VaultPlanData): string {
  const reviewLines = data.reviews.length
    ? data.reviews
        .map(r => `- ${r.deptName} 협조 확인: ${r.confirmedByUsername} (${r.confirmedAt.toISOString().slice(0, 10)})`)
        .join('\n')
    : '없음'

  const extraSection =
    data.extraFields && Object.keys(data.extraFields).length
      ? '\n## 업무별 추가사항\n\n' +
        Object.entries(data.extraFields)
          .map(([k, v]) => `- **${k}:** ${v}`)
          .join('\n')
      : ''

  const attachLines = data.attachments.length ? data.attachments.map(a => `- ${a}`).join('\n') : '없음'

  return `---
planId: ${data.id}
templateType: ${data.templateType}
status: APPROVED
department: ${data.departmentName}
budget: ${data.budget}
approvedBy: ${data.approvedByUsername}
approvedAt: ${data.approvedAt.toISOString().slice(0, 10)}
resultDueDate: ${data.resultDueDate.toISOString().slice(0, 10)}
---

# ${data.title}

## 계획 (승인: ${data.approvedAt.toISOString().slice(0, 10)})

**추진 목적:** ${data.purpose}

**추진 기간:** ${data.startDate.toISOString().slice(0, 10)} ~ ${data.endDate.toISOString().slice(0, 10)}

**예산:** ${data.budget.toLocaleString()}원

**기대효과:** ${data.expectedEffect}

**주요 리스크:** ${data.risks}

**첨부자료:**
${attachLines}
${extraSection}

## 결재 이력

${reviewLines}

## 결과보고 (제출: 미완료)
`
}
