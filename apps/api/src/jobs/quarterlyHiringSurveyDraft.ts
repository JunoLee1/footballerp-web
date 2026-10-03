import cron from 'node-cron'
import type { LeagueLevel } from '../generated/enums'
import { getPrisma } from '../lib/prisma'
import { HiringAutomationRepository } from '../hiring-automation/hiring-automation.repo'
import { HiringAutomationService } from '../hiring-automation/hiring-automation.service'
import { HiringSurveyRepository } from '../hiring-survey/hiring-survey.repo'
import { HiringSurveyService } from '../hiring-survey/hiring-survey.service'
import { NotificationRepository } from '../notification/notification.repo'
import { PlanReportRepository } from '../plan-report/plan-report.repo'

const DEFAULT_TOP_N = 3

interface RunDeps {
  findActiveSeason: () => Promise<{ id: number; leagueLevel: LeagueLevel } | null>
  findClubSettings: () => Promise<{ ibiBeta: number; autoSurveyTopN: number | null } | null>
  findSystemUser: () => Promise<{ id: string } | null>
  findHrManagerExists: () => Promise<boolean>
  computePriorityQueue: (
    season: { id: number; leagueLevel: LeagueLevel },
    ibiBeta: number,
  ) => Promise<{ queue: Array<{ departmentId: string; departmentName: string; highPriority: boolean }> }>
  createQuarterlyDraft: (args: {
    title: string
    deadlineAt: Date
    targetDeptIds: string[]
    systemUserId: string
  }) => Promise<{ id: string }>
  now: () => Date
  warn?: (msg: string) => void
}

function quarterOf(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1
}

function quarterEndAt(date: Date): Date {
  const q = quarterOf(date)
  const endMonth = q * 3 - 1 // Q1→2(Mar), Q2→5(Jun), Q3→8(Sep), Q4→11(Dec)
  const year = date.getFullYear()
  return new Date(year, endMonth + 1, 0, 23, 59, 59) // day 0 of next month = last day of endMonth
}

export async function runQuarterlyHiringSurveyDraft(deps: RunDeps): Promise<void> {
  const warn = deps.warn ?? console.warn

  const season = await deps.findActiveSeason()
  if (!season || !season.leagueLevel) return

  const systemUser = await deps.findSystemUser()
  if (!systemUser) return

  // Q6 결정: HR_MANAGER 없으면 draft 만들어도 편집할 사람 없음 → skip + warn
  const hrExists = await deps.findHrManagerExists()
  if (!hrExists) {
    warn('[quarterlyHiringSurveyDraft] no HR_MANAGER role found — skipping cron (draft would have no editor)')
    return
  }

  const settings = await deps.findClubSettings()
  const ibiBeta = settings?.ibiBeta ?? 1.0
  const topN = settings?.autoSurveyTopN ?? DEFAULT_TOP_N

  const { queue } = await deps.computePriorityQueue(season, ibiBeta)

  const highPriority = queue.filter((q) => q.highPriority)
  const topSlice = queue.slice(0, topN)
  const targetDeptIds = Array.from(
    new Map([...highPriority, ...topSlice].map((q) => [q.departmentId, q])).keys(),
  )

  if (targetDeptIds.length === 0) return

  const now = deps.now()
  const year = now.getFullYear()
  const quarter = quarterOf(now)
  const title = `${year} Q${quarter} 채용 수요 조사`
  const deadlineAt = quarterEndAt(now)

  await deps.createQuarterlyDraft({
    title,
    deadlineAt,
    targetDeptIds,
    systemUserId: systemUser.id,
  })
}

export function startQuarterlyHiringSurveyDraftJob() {
  // 매 분기 첫째 날 오전 9시 (1월·4월·7월·10월 1일)
  cron.schedule('0 9 1 1,4,7,10 *', async () => {
    const prisma = getPrisma()
    const autoRepo = new HiringAutomationRepository(prisma)
    const autoService = new HiringAutomationService(autoRepo)
    const surveyRepo = new HiringSurveyRepository(prisma)
    const planRepo = new PlanReportRepository(prisma)
    const notifRepo = new NotificationRepository(prisma)
    const surveyService = new HiringSurveyService(surveyRepo, planRepo, notifRepo)

    try {
      await runQuarterlyHiringSurveyDraft({
        findActiveSeason: async () => {
          const season = await prisma.season.findFirst({ where: { status: 'ACTIVE' } })
          if (!season || !season.leagueLevel) return null
          return { id: season.id, leagueLevel: season.leagueLevel as LeagueLevel }
        },
        findClubSettings: async () => {
          const settings = await prisma.clubSettings.findFirst()
          if (!settings) return null
          return { ibiBeta: settings.ibiBeta, autoSurveyTopN: settings.autoSurveyTopN }
        },
        findSystemUser: async () => {
          const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
          return admin ? { id: admin.id } : null
        },
        findHrManagerExists: async () => {
          const hr = await prisma.user.findFirst({
            where: { role: 'FRONT_OFFICE', frontOfficeRole: 'HR_MANAGER', isDeleted: false },
            select: { id: true },
          })
          return !!hr
        },
        computePriorityQueue: (season, ibiBeta) => autoService.computePriorityQueue(season, ibiBeta),
        createQuarterlyDraft: (args) => surveyService.createQuarterlyDraft(args),
        now: () => new Date(),
      })
    } catch (err) {
      console.error('[quarterlyHiringSurveyDraft] cron failed:', err)
    }
  })
}
