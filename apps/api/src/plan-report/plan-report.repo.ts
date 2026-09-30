import type { PrismaClient } from '../generated/client'
import { Prisma } from '../generated/client'
import type { HiringPlanItemStatus } from '../generated/enums'
import type {
  CreatePlanReportDto,
  UpdatePlanReportDto,
  ListPlanReportQuery,
} from './dto/plan-report.dto'

export interface ReviewerDeptMap {
  hr?: number
  procurement?: number
  legal?: number
  facility?: number
  privacy?: number
  finance?: number
}

const PLAN_INCLUDE = {
  department: { select: { id: true, name: true, headId: true } },
  createdBy: { select: { id: true, username: true } },
  approvedBy: { select: { id: true, username: true } },
  reviews: {
    include: {
      reviewerDept: { select: { id: true, name: true } },
      confirmedBy: { select: { id: true, username: true } },
    },
  },
} satisfies Prisma.PlanReportInclude

export class PlanReportRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(filters: ListPlanReportQuery) {
    return this.prisma.planReport.findMany({
      where: {
        ...(filters.templateType && { templateType: filters.templateType as any }),
        ...(filters.departmentId && { departmentId: Number(filters.departmentId) }),
        ...(filters.status && { status: filters.status as any }),
      },
      include: PLAN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  }

  findById(id: string) {
    return this.prisma.planReport.findUnique({ where: { id }, include: PLAN_INCLUDE })
  }

  create(dto: CreatePlanReportDto, createdById: string) {
    return this.prisma.planReport.create({
      data: {
        title: dto.title,
        purpose: dto.purpose,
        departmentId: dto.departmentId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        budget: dto.budget,
        expectedEffect: dto.expectedEffect,
        risks: dto.risks,
        attachments: dto.attachments ?? [],
        resultDueDate: new Date(dto.resultDueDate),
        templateType: dto.templateType,
        extraFields: dto.extraFields ? (dto.extraFields as Prisma.InputJsonValue) : Prisma.JsonNull,
        hasNewStaff: dto.hasNewStaff ?? false,
        hasContract: dto.hasContract ?? false,
        hasExternalLease: dto.hasExternalLease ?? false,
        hasPersonalInfo: dto.hasPersonalInfo ?? false,
        isNewBusiness: dto.isNewBusiness ?? false,
        createdById,
      },
      include: PLAN_INCLUDE,
    })
  }

  update(id: string, dto: UpdatePlanReportDto) {
    return this.prisma.planReport.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.purpose !== undefined && { purpose: dto.purpose }),
        ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
        ...(dto.budget !== undefined && { budget: dto.budget }),
        ...(dto.expectedEffect !== undefined && { expectedEffect: dto.expectedEffect }),
        ...(dto.risks !== undefined && { risks: dto.risks }),
        ...(dto.attachments !== undefined && { attachments: dto.attachments }),
        ...(dto.resultDueDate !== undefined && { resultDueDate: new Date(dto.resultDueDate) }),
        ...(dto.templateType !== undefined && { templateType: dto.templateType }),
        ...('extraFields' in dto && { extraFields: dto.extraFields as Prisma.InputJsonValue ?? Prisma.JsonNull }),
        ...(dto.hasNewStaff !== undefined && { hasNewStaff: dto.hasNewStaff }),
        ...(dto.hasContract !== undefined && { hasContract: dto.hasContract }),
        ...(dto.hasExternalLease !== undefined && { hasExternalLease: dto.hasExternalLease }),
        ...(dto.hasPersonalInfo !== undefined && { hasPersonalInfo: dto.hasPersonalInfo }),
        ...(dto.isNewBusiness !== undefined && { isNewBusiness: dto.isNewBusiness }),
      },
      include: PLAN_INCLUDE,
    })
  }

  async submit(id: string, reviewerDeptIds: number[], requiredApproverLevel: string | null) {
    return this.prisma.$transaction(async (tx) => {
      if (reviewerDeptIds.length > 0) {
        await tx.planReview.createMany({
          data: reviewerDeptIds.map((reviewerDeptId) => ({ planId: id, reviewerDeptId })),
          skipDuplicates: true,
        })
      }
      return tx.planReport.update({
        where: { id },
        data: {
          status: 'REVIEWING',
          submittedAt: new Date(),
          requiredApproverLevel: requiredApproverLevel as any ?? null,
        },
        include: PLAN_INCLUDE,
      })
    })
  }

  async allReviewsComplete(planId: string): Promise<boolean> {
    const total = await this.prisma.planReview.count({ where: { planId } })
    if (total === 0) return true
    const confirmed = await this.prisma.planReview.count({ where: { planId, status: 'CONFIRMED' } })
    return total === confirmed
  }

  approve(id: string, approvedById: string, vaultPath: string) {
    return this.prisma.planReport.update({
      where: { id },
      data: { status: 'APPROVED', approvedById, approvedAt: new Date(), vaultPath },
      include: PLAN_INCLUDE,
    })
  }

  reject(id: string, approvedById: string, reason: string) {
    return this.prisma.planReport.update({
      where: { id },
      data: { status: 'DRAFT', approvedById, rejectedAt: new Date(), rejectionReason: reason },
      include: PLAN_INCLUDE,
    })
  }

  submitResult(id: string, resultContent: string) {
    return this.prisma.planReport.update({
      where: { id },
      data: { resultContent, resultSubmittedAt: new Date() },
      include: PLAN_INCLUDE,
    })
  }

  getClubSettings() {
    // Lazy-create the singleton row on first access — every field has a default,
    // so `create: {}` is safe. Prevents 500 on submit() when seed didn't preload.
    return this.prisma.clubSettings.upsert({
      where: { id: 1 },
      create: {},
      update: {},
    })
  }

  findByIdLight(id: string) {
    return this.prisma.planReport.findUnique({
      where: { id },
      select: { id: true, status: true, templateType: true, departmentId: true, title: true },
    })
  }

  findHiringPlanItemById(id: string) {
    return this.prisma.hiringPlanItem.findUnique({
      where: { id },
      select: { id: true, planReportId: true, status: true, headcount: true, fulfilledCount: true },
    })
  }

  updateHiringPlanItemStatus(id: string, status: HiringPlanItemStatus, fulfilledAt?: Date) {
    return this.prisma.hiringPlanItem.update({
      where: { id },
      data: {
        status,
        ...(fulfilledAt !== undefined && { fulfilledAt }),
      },
    })
  }

  incrementFulfilledCount(id: string) {
    return this.prisma.hiringPlanItem.update({
      where: { id },
      data: { fulfilledCount: { increment: 1 } },
      select: { id: true, headcount: true, fulfilledCount: true, status: true },
    })
  }

  cancelHiringPlanItem(id: string) {
    return this.prisma.hiringPlanItem.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })
  }

  findApprovedHrReports() {
    return this.prisma.planReport.findMany({
      where: {
        status: 'APPROVED',
        templateType: 'HR',
        // "미완료 잔여" = HiringPlanItem 이 없거나(legacy), 또는 하나라도 JobPosting 연결 안 됨.
        // headcount 단위 완료 추적은 out-of-scope (see #362 HiringPlanItem status tracking).
        OR: [
          { hiringPlanItems: { none: {} } },
          { hiringPlanItems: { some: { jobPostings: { none: {} } } } },
        ],
      },
      select: { id: true, title: true, departmentId: true, department: { select: { id: true, name: true } }, approvedAt: true },
      orderBy: { approvedAt: 'desc' },
    })
  }

  async createDraftForSurvey(data: {
    surveyId: string
    createdById: string
    title: string
  }) {
    // Find HR department — look for a dept with name containing 'HR' or use the first dept as fallback
    const hrDept = await this.prisma.department.findFirst({
      where: { OR: [{ name: { contains: 'HR' } }, { name: { contains: '인사' } }] },
    })
    const departmentId = hrDept?.id ?? 1

    return this.prisma.planReport.create({
      data: {
        title: data.title,
        purpose: '',
        startDate: new Date(),
        endDate: new Date(new Date().getFullYear(), 11, 31),
        budget: 0,
        expectedEffect: '',
        risks: '',
        resultDueDate: new Date(new Date().getFullYear(), 11, 31),
        templateType: 'HR',
        isNewBusiness: true,
        surveyId: data.surveyId,
        createdById: data.createdById,
        departmentId,
      },
    })
  }

  listHiringPlanItems(planReportId: string, statusFilter?: HiringPlanItemStatus[]) {
    return this.prisma.hiringPlanItem.findMany({
      where: {
        planReportId,
        ...(statusFilter && statusFilter.length > 0 && { status: { in: statusFilter } }),
      },
      include: { surveyResponse: { select: { id: true, departmentId: true } } },
      orderBy: { createdAt: 'asc' },
    })
  }

  createHiringPlanItem(planReportId: string, data: {
    roleTitle: string
    headcount: number
    quarter?: number
    priority: string
    estimatedBudget?: number
  }) {
    return this.prisma.hiringPlanItem.create({
      data: { planReportId, ...data } as any,
    })
  }

  createHiringPlanItems(items: Array<{
    planReportId: string
    surveyResponseId: string
    roleTitle: string
    headcount: number
    quarter?: number
    priority: any
    estimatedBudget?: number
  }>) {
    return this.prisma.hiringPlanItem.createMany({ data: items as any })
  }

  updateHiringPlanItem(id: string, planReportId: string, data: {
    roleTitle?: string
    headcount?: number
    quarter?: number | null
    priority?: string
    estimatedBudget?: number | null
  }) {
    return this.prisma.hiringPlanItem.update({
      where: { id, planReportId },
      data: data as any,
    })
  }

  deleteHiringPlanItem(id: string, planReportId: string) {
    return this.prisma.hiringPlanItem.delete({ where: { id, planReportId } })
  }
}
