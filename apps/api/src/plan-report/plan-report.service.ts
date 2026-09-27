import { AppError } from '../lib/appError'
import { canApprovePlan, isAdminLike } from '../lib/permissions'
import { writeAuditLog } from '../lib/auditLog'
import { cached, invalidate } from '../lib/cache'
import { PlanReportRepository, ReviewerDeptMap } from './plan-report.repo'
import { CreatePlanReportDto, ListPlanReportQuery, UpdatePlanReportDto } from './dto/plan-report.dto'
import { writeApprovalVaultNote, appendResultToVaultNote, VaultPlanData } from './vault'
import { NotificationRepository } from '../notification/notification.repo'

export class PlanReportService {
  constructor(
    private repo: PlanReportRepository,
    private notifRepo?: NotificationRepository,
  ) {}

  list(filters: ListPlanReportQuery) {
    const key = `plan-reports:list:${JSON.stringify(filters)}`
    return cached(key, 30, () => this.repo.findAll(filters))
  }

  async getById(id: number) {
    const plan = await this.repo.findById(id)
    if (!plan) throw new AppError(404, 'PLAN_REPORT_NOT_FOUND')
    return plan
  }

  create(dto: CreatePlanReportDto, createdById: number) {
    const required: (keyof CreatePlanReportDto)[] = [
      'title', 'purpose', 'startDate', 'endDate', 'resultDueDate',
      'expectedEffect', 'risks',
    ]
    for (const field of required) {
      const v = dto[field]
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
        throw new AppError(400, 'MISSING_REQUIRED_FIELD')
      }
    }
    if (!dto.departmentId) throw new AppError(400, 'MISSING_REQUIRED_FIELD')
    if (dto.budget == null || dto.budget < 0) throw new AppError(400, 'INVALID_BUDGET')
    return this.repo.create(dto, createdById)
  }

  async update(id: number, dto: UpdatePlanReportDto, userId: number, userRole: string) {
    const plan = await this.getById(id)
    if (plan.status === 'APPROVED') throw new AppError(409, 'CANNOT_MODIFY_APPROVED_PLAN')
    if (plan.createdBy.id !== userId && plan.department.headId !== userId && !isAdminLike(userRole)) {
      throw new AppError(403, 'FORBIDDEN')
    }
    return this.repo.update(id, dto)
  }

  async submit(id: number, userId: number) {
    const plan = await this.getById(id)
    if (plan.status !== 'DRAFT') throw new AppError(409, 'CANNOT_SUBMIT_NON_DRAFT')
    if (plan.department.headId !== userId) throw new AppError(403, 'ONLY_HEAD_CAN_SUBMIT')

    const settings = await this.repo.getClubSettings()
    const deptMap = (settings.reviewerDeptMap ?? {}) as ReviewerDeptMap

    const reviewerDeptIds = resolveReviewerDeptIds(plan, deptMap)
    const requiredApproverLevel = resolveApproverLevel(
      { templateType: plan.templateType, budget: plan.budget, isNewBusiness: plan.isNewBusiness },
      settings.planApprovalLimit
    )

    const result = await this.repo.submit(id, reviewerDeptIds, requiredApproverLevel)

    if (this.notifRepo) {
      for (const deptId of reviewerDeptIds) {
        void this.notifRepo
          .createForDepartmentHead(
            deptId,
            'PLAN_REPORT_REVIEW_REQUESTED',
            () => ({
              title: '기획보고서 리뷰 요청',
              body: `"${plan.title}" 기획보고서에 대한 부서 리뷰가 요청됐습니다.`,
            }),
            id,
          )
          .catch(console.error)
      }
    }

    return result
  }

  async approve(id: number, userId: number, userRole: string) {
    const plan = await this.getById(id)
    if (plan.status !== 'REVIEWING') throw new AppError(409, 'CANNOT_APPROVE_NON_REVIEWING')
    if (!canApprovePlan(userRole, plan.requiredApproverLevel)) throw new AppError(403, 'FORBIDDEN')

    const allComplete = await this.repo.allReviewsComplete(id)
    if (!allComplete) throw new AppError(409, 'REVIEWS_NOT_COMPLETE')

    const vaultData = toVaultData(plan)
    const vaultPath = await writeApprovalVaultNote(vaultData)
    const result = await this.repo.approve(id, userId, vaultPath)
    await writeAuditLog({ actorId: userId, action: "PLAN_REPORT_APPROVED", targetId: id })

    if (plan.templateType === 'HR' && this.notifRepo) {
      void this.notifRepo.createForHrManager(
        'HIRING_PLAN_APPROVED',
        () => ({ title: '채용 계획서 승인 완료', body: `"${plan.title}" 채용 계획서가 승인됐습니다. 채용공고를 등록할 수 있습니다.` }),
        id,
      ).catch(console.error)
    }

    return result
  }

  async reject(id: number, userId: number, userRole: string, reason: string) {
    if (!canApprovePlan(userRole, 'HEAD')) throw new AppError(403, 'FORBIDDEN')
    if (!reason?.trim()) throw new AppError(400, 'REJECTION_REASON_REQUIRED')
    const plan = await this.getById(id)
    if (plan.status !== 'REVIEWING') throw new AppError(409, 'CANNOT_REJECT_NON_REVIEWING')
    const result = await this.repo.reject(id, userId, reason)
    await writeAuditLog({ actorId: userId, action: "PLAN_REPORT_REJECTED", targetId: id, detail: { reason } })
    return result
  }

  listApprovedHrReports() {
    return this.repo.findApprovedHrReports()
  }

  async submitResult(id: number, userId: number, resultContent: string, userRole: string) {
    if (!resultContent?.trim()) throw new AppError(400, 'RESULT_CONTENT_REQUIRED')
    const plan = await this.getById(id)
    if (plan.status !== 'APPROVED') throw new AppError(409, 'PLAN_NOT_APPROVED')
    if (plan.createdBy.id !== userId && plan.department.headId !== userId && !isAdminLike(userRole)) {
      throw new AppError(403, 'FORBIDDEN')
    }

    const updated = await this.repo.submitResult(id, resultContent)

    if (plan.vaultPath) {
      await appendResultToVaultNote(plan.vaultPath, {
        content: resultContent,
        submittedAt: new Date(),
        submittedByUsername: plan.createdBy.username,
      })
    }

    return updated
  }

  async cancelHiringPlanItem(id: number, planReportId: number, actorId: number) {
    const item = await this.repo.findHiringPlanItemById(id)
    if (!item) throw new AppError(404, 'HIRING_PLAN_ITEM_NOT_FOUND')
    if (item.planReportId !== planReportId) throw new AppError(400, 'HIRING_PLAN_ITEM_MISMATCH')
    if (item.status === 'CANCELLED') throw new AppError(409, 'HIRING_PLAN_ITEM_ALREADY_CANCELLED')

    const result = await this.repo.cancelHiringPlanItem(id)
    await writeAuditLog({ actorId, action: 'HIRING_PLAN_ITEM_CANCELLED', targetId: id })
    return result
  }
}

function resolveApproverLevel(
  plan: { templateType: string; budget: number; isNewBusiness: boolean },
  limit: number
): string | null {
  if (plan.templateType === 'HR') return 'ADMIN'
  if (plan.isNewBusiness) return 'ADMIN'
  if (plan.budget > limit) return 'GM'
  return null
}

function resolveReviewerDeptIds(
  plan: { templateType: string; hasNewStaff: boolean; hasContract: boolean; hasExternalLease: boolean; hasPersonalInfo: boolean },
  deptMap: ReviewerDeptMap
): number[] {
  const ids = new Set<number>()
  if (plan.hasNewStaff && deptMap.hr) ids.add(deptMap.hr)
  if (plan.hasContract) {
    if (deptMap.procurement) ids.add(deptMap.procurement)
    if (deptMap.legal) ids.add(deptMap.legal)
  }
  if (plan.hasExternalLease) {
    if (deptMap.facility) ids.add(deptMap.facility)
    if (deptMap.legal) ids.add(deptMap.legal)
  }
  if (plan.hasPersonalInfo) {
    if (deptMap.legal) ids.add(deptMap.legal)
    if (deptMap.privacy) ids.add(deptMap.privacy)
  }
  if (plan.templateType === 'HR') {
    if (deptMap.finance) ids.add(deptMap.finance)
    else console.warn('[plan-report] HR plan submitted but ClubSettings.reviewerDeptMap.finance is not configured; finance review skipped')
  }
  return Array.from(ids)
}

function toVaultData(plan: any): VaultPlanData {
  return {
    id: plan.id,
    title: plan.title,
    templateType: plan.templateType,
    departmentName: plan.department.name,
    budget: plan.budget,
    purpose: plan.purpose,
    expectedEffect: plan.expectedEffect,
    risks: plan.risks,
    attachments: plan.attachments,
    startDate: plan.startDate,
    endDate: plan.endDate,
    resultDueDate: plan.resultDueDate,
    approvedAt: new Date(),
    approvedByUsername: plan.approvedBy?.username ?? 'system',
    reviews: plan.reviews
      .filter((r: any) => r.status === 'CONFIRMED')
      .map((r: any) => ({
        deptName: r.reviewerDept.name,
        confirmedByUsername: r.confirmedBy?.username ?? '',
        confirmedAt: r.confirmedAt ?? new Date(),
      })),
    extraFields: plan.extraFields as Record<string, unknown> | null,
  }
}
