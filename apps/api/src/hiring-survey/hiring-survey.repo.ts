import type { PrismaClient } from '../generated/client'
import type {
  CreateHiringSurveyDto,
  CreateSurveyResponseDto,
  SurveyResponseStatus,
  UpdateSurveyResponseDto,
} from './dto/hiring-survey.dto'

const SURVEY_INCLUDE = {
  createdBy: { select: { id: true, username: true } },
  targetDepartments: {
    include: { department: { select: { id: true, name: true, headId: true } } },
  },
  responses: {
    include: {
      department: { select: { id: true, name: true } },
      submittedBy: { select: { id: true, username: true } },
      approvedBy: { select: { id: true, username: true } },
    },
  },
} as const

const RESPONSE_INCLUDE = {
  department: { select: { id: true, name: true, headId: true } },
  submittedBy: { select: { id: true, username: true } },
  approvedBy: { select: { id: true, username: true } },
  survey: { select: { id: true, status: true, title: true } },
} as const

export class HiringSurveyRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.hiringNeedsSurvey.findMany({
      include: SURVEY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  }

  findById(id: string) {
    return this.prisma.hiringNeedsSurvey.findUnique({ where: { id }, include: SURVEY_INCLUDE })
  }

  create(dto: CreateHiringSurveyDto, createdById: string) {
    return this.prisma.hiringNeedsSurvey.create({
      data: {
        title: dto.title,
        deadlineAt: new Date(dto.deadlineAt),
        createdById,
        targetDepartments: {
          create: dto.targetDeptIds.map((departmentId) => ({ departmentId })),
        },
      },
      include: SURVEY_INCLUDE,
    })
  }

  close(id: string) {
    return this.prisma.hiringNeedsSurvey.update({
      where: { id },
      data: { status: 'CLOSED' },
    })
  }

  findOpenPastDeadline() {
    return this.prisma.hiringNeedsSurvey.findMany({
      where: { status: 'OPEN', deadlineAt: { lte: new Date() } },
      include: SURVEY_INCLUDE,
    })
  }

  findOpenNearDeadline(targetDate: Date) {
    const start = new Date(targetDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(targetDate)
    end.setHours(23, 59, 59, 999)
    return this.prisma.hiringNeedsSurvey.findMany({
      where: { status: 'OPEN', deadlineAt: { gte: start, lte: end } },
      include: SURVEY_INCLUDE,
    })
  }

  upsertResponse(
    surveyId: string,
    departmentId: string,
    submittedById: string,
    dto: CreateSurveyResponseDto,
  ) {
    // On upsert we treat the row as a fresh DRAFT — clears any prior rejection
    // metadata so a leader can restart cleanly. Approve/reject flow lives on
    // setResponseStatus, which is the only path that touches status directly.
    return this.prisma.surveyResponse.upsert({
      where: { surveyId_departmentId: { surveyId, departmentId } },
      create: { surveyId, departmentId, submittedById, ...dto, status: 'DRAFT' },
      update: {
        ...dto,
        submittedById,
        status: 'DRAFT',
        rejectionReason: null,
        approvedById: null,
        approvedAt: null,
      },
      include: RESPONSE_INCLUDE,
    })
  }

  findResponseById(id: string) {
    return this.prisma.surveyResponse.findUnique({
      where: { id },
      include: RESPONSE_INCLUDE,
    })
  }

  updateResponse(id: string, dto: UpdateSurveyResponseDto) {
    // Only whitelisted content fields — status transitions go through
    // setResponseStatus so this method can't accidentally elevate state.
    const data: Record<string, unknown> = {}
    if (dto.roleTitle !== undefined) data.roleTitle = dto.roleTitle
    if (dto.headcount !== undefined) data.headcount = dto.headcount
    if (dto.quarter !== undefined) data.quarter = dto.quarter
    if (dto.priority !== undefined) data.priority = dto.priority
    if (dto.estimatedBudget !== undefined) data.estimatedBudget = dto.estimatedBudget
    if (dto.reason !== undefined) data.reason = dto.reason
    return this.prisma.surveyResponse.update({
      where: { id },
      data,
      include: RESPONSE_INCLUDE,
    })
  }

  setResponseStatus(
    id: string,
    patch: {
      status: SurveyResponseStatus
      rejectionReason?: string | null
      approvedById?: string | null
      approvedAt?: Date | null
    },
  ) {
    const data: Record<string, unknown> = { status: patch.status }
    if (patch.rejectionReason !== undefined) data.rejectionReason = patch.rejectionReason
    if (patch.approvedById !== undefined) data.approvedById = patch.approvedById
    if (patch.approvedAt !== undefined) data.approvedAt = patch.approvedAt
    return this.prisma.surveyResponse.update({
      where: { id },
      data,
      include: RESPONSE_INCLUDE,
    })
  }

  /**
   * Whether the given user holds the `LEADER` role in `UserDepartment` for the
   * given department. Membership-based check for the "팀장" gate.
   */
  async isUserLeaderOfDepartment(userId: string, departmentId: string): Promise<boolean> {
    const membership = await this.prisma.userDepartment.findFirst({
      where: { userId, departmentId, role: 'LEADER' },
      select: { userId: true },
    })
    return membership !== null
  }

  /**
   * Every user ID that has the `LEADER` role in any of the given departments.
   * Used to fan out HIRING_SURVEY_OPEN alongside the dept head.
   */
  async findLeaderUserIdsForDepartments(departmentIds: string[]): Promise<string[]> {
    if (departmentIds.length === 0) return []
    const rows = await this.prisma.userDepartment.findMany({
      where: { departmentId: { in: departmentIds }, role: 'LEADER' },
      select: { userId: true },
    })
    return Array.from(new Set(rows.map((r) => r.userId)))
  }

  findResponsesBySurvey(surveyId: string) {
    return this.prisma.surveyResponse.findMany({ where: { surveyId } })
  }

  createDraft(data: { title: string; deadlineAt: Date; targetDeptIds: string[]; createdById: string }) {
    return this.prisma.hiringNeedsSurvey.create({
      data: {
        title: data.title,
        deadlineAt: data.deadlineAt,
        status: 'DRAFT',
        createdById: data.createdById,
        targetDepartments: {
          create: data.targetDeptIds.map((departmentId) => ({ departmentId })),
        },
      },
      include: SURVEY_INCLUDE,
    })
  }

  updateDraft(id: string, data: { title?: string; deadlineAt?: Date; targetDeptIds?: string[] }) {
    return this.prisma.$transaction(async (tx) => {
      if (data.targetDeptIds !== undefined) {
        await tx.surveyTargetDept.deleteMany({ where: { surveyId: id } })
        await tx.surveyTargetDept.createMany({
          data: data.targetDeptIds.map((departmentId) => ({ surveyId: id, departmentId })),
        })
      }
      return tx.hiringNeedsSurvey.update({
        where: { id },
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.deadlineAt !== undefined && { deadlineAt: data.deadlineAt }),
        },
        include: SURVEY_INCLUDE,
      })
    })
  }

  openDraft(id: string) {
    return this.prisma.hiringNeedsSurvey.update({
      where: { id },
      data: { status: 'OPEN' },
      include: SURVEY_INCLUDE,
    })
  }

  deleteDraft(id: string) {
    return this.prisma.hiringNeedsSurvey.delete({
      where: { id },
    })
  }
}
