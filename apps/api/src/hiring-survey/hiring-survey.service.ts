import { AppError } from '../lib/appError'
import { NotificationRepository } from '../notification/notification.repo'
import { PlanReportRepository } from '../plan-report/plan-report.repo'
import { HiringSurveyRepository } from './hiring-survey.repo'
import { cached } from '../lib/cache'
import type {
  CreateHiringSurveyDto,
  CreateSurveyResponseDto,
  UpdateHiringSurveyDraftDto,
  UpdateSurveyResponseDto,
} from './dto/hiring-survey.dto'

export class HiringSurveyService {
  constructor(
    private repo: HiringSurveyRepository,
    private planReportRepo: PlanReportRepository,
    private notifRepo: NotificationRepository,
  ) {}

  list() {
    return cached('hiring-surveys:list', 30, () => this.repo.findAll())
  }

  async getById(id: string) {
    const survey = await this.repo.findById(id)
    if (!survey) throw new AppError(404, 'SURVEY_NOT_FOUND')
    return survey
  }

  async create(dto: CreateHiringSurveyDto, createdById: string) {
    if (!dto.title?.trim()) throw new AppError(400, 'TITLE_REQUIRED')
    if (!dto.deadlineAt) throw new AppError(400, 'DEADLINE_REQUIRED')
    if (!dto.targetDeptIds?.length) throw new AppError(400, 'TARGET_DEPTS_REQUIRED')

    const survey = await this.repo.create(dto, createdById)

    await this.notifyTargetHeadsAndLeaders(survey, new Date(dto.deadlineAt))

    return survey
  }

  /**
   * Fan out HIRING_SURVEY_OPEN to both dept heads (부서장) and LEADER-role users
   * in target departments — grill decision Q4 c1. Dedup so a person who is both
   * head and a LEADER row doesn't get two notifications.
   */
  private async notifyTargetHeadsAndLeaders(
    survey: { id: string; title: string; targetDepartments: Array<{ departmentId?: number; department: { id?: string; headId: string | null } }> },
    deadlineAt: Date,
  ) {
    const headIds = survey.targetDepartments
      .map((t) => t.department.headId)
      .filter((id): id is string => id !== null)

    const deptIds = survey.targetDepartments
      .map((t) => (t.departmentId ?? t.department.id))
      .filter((id): id is number => typeof id === 'number')
    const leaderIds = await this.repo.findLeaderUserIdsForDepartments(deptIds)

    // Union — a LEADER who also happens to be the head shouldn't be notified twice
    const recipients = Array.from(new Set<string>([...headIds, ...leaderIds]))

    const body = `"${survey.title}" 채용 수요 조사에 응답해 주세요. 마감일: ${deadlineAt.toLocaleDateString('ko-KR')}`

    await Promise.all(
      recipients.map((userId) =>
        this.notifRepo.create({
          userId,
          type: 'HIRING_SURVEY_OPEN',
          title: '채용 수요 조사 참여 요청',
          body,
          entityId: survey.id,
        }),
      ),
    )
  }

  /**
   * 팀장 (LEADER role in `UserDepartment` for the target department) creates or
   * updates a `SurveyResponse` for their department. Always lands as `DRAFT`
   * — actual submission goes through `submitResponse` (issues #367/#368).
   */
  async createResponse(
    surveyId: string,
    departmentId: number,
    userId: string,
    dto: CreateSurveyResponseDto,
  ) {
    const survey = await this.getById(surveyId)
    if (survey.status !== 'OPEN') throw new AppError(409, 'SURVEY_NOT_OPEN')

    const target = survey.targetDepartments.find((t) => t.departmentId === departmentId)
    if (!target) throw new AppError(403, 'NOT_TARGET_DEPARTMENT')

    const isLeader = await this.repo.isUserLeaderOfDepartment(userId, departmentId)
    if (!isLeader) throw new AppError(403, 'NOT_LEADER')

    this.validateResponseFields(dto)

    return this.repo.upsertResponse(surveyId, departmentId, userId, dto)
  }

  /**
   * 팀장 edits an existing DRAFT or REJECTED response. APPROVED and SUBMITTED
   * are locked — SUBMITTED belongs to the dept head's queue, APPROVED is
   * terminal (grill Q3 d2).
   */
  async updateResponse(id: string, userId: string, dto: UpdateSurveyResponseDto) {
    const response = await this.repo.findResponseById(id)
    if (!response) throw new AppError(404, 'RESPONSE_NOT_FOUND')
    if (response.survey.status !== 'OPEN') throw new AppError(409, 'SURVEY_NOT_OPEN')

    const isLeader = await this.repo.isUserLeaderOfDepartment(userId, response.departmentId)
    if (!isLeader) throw new AppError(403, 'NOT_LEADER')

    if (response.status !== 'DRAFT' && response.status !== 'REJECTED') {
      throw new AppError(409, 'RESPONSE_NOT_EDITABLE')
    }

    // Only validate fields that were actually provided in the patch.
    if (dto.roleTitle !== undefined && !dto.roleTitle.trim()) {
      throw new AppError(400, 'ROLE_TITLE_REQUIRED')
    }
    if (dto.headcount !== undefined && (!dto.headcount || dto.headcount < 1)) {
      throw new AppError(400, 'INVALID_HEADCOUNT')
    }
    if (
      dto.quarter !== undefined &&
      dto.quarter !== null &&
      (dto.quarter < 1 || dto.quarter > 4)
    ) {
      throw new AppError(400, 'INVALID_QUARTER')
    }

    return this.repo.updateResponse(id, dto)
  }

  /**
   * 팀장 transitions DRAFT|REJECTED → SUBMITTED. On success fires
   * `SURVEY_RESPONSE_SUBMITTED` to the department head (부서장).
   */
  async submitResponse(id: string, userId: string) {
    const response = await this.repo.findResponseById(id)
    if (!response) throw new AppError(404, 'RESPONSE_NOT_FOUND')
    if (response.survey.status !== 'OPEN') throw new AppError(409, 'SURVEY_NOT_OPEN')

    const isLeader = await this.repo.isUserLeaderOfDepartment(userId, response.departmentId)
    if (!isLeader) throw new AppError(403, 'NOT_LEADER')

    if (response.status !== 'DRAFT' && response.status !== 'REJECTED') {
      throw new AppError(409, 'INVALID_TRANSITION')
    }

    // Clear rejectionReason on resubmit so the dept head sees a clean queue item.
    const updated = await this.repo.setResponseStatus(id, {
      status: 'SUBMITTED',
      rejectionReason: null,
    })

    // Fire-and-forget — a notif failure must not roll back the transition.
    void this.notifRepo
      .createForDepartmentHead(
        response.departmentId,
        'SURVEY_RESPONSE_SUBMITTED',
        (lang) => ({
          title:
            lang === 'en'
              ? 'Hiring Survey Response — Awaiting Approval'
              : '채용 수요 응답 결재 대기',
          body:
            lang === 'en'
              ? `A response for "${response.survey.title}" awaits your approval.`
              : `"${response.survey.title}" 부서 응답이 결재 대기 중입니다.`,
        }),
        id,
      )
      .catch(console.error)

    return updated
  }

  /**
   * 부서장 (Department.headId) approves a SUBMITTED response.
   * Fires `SURVEY_RESPONSE_APPROVED` back to the leader who submitted.
   */
  async approveResponse(id: string, reviewerId: string) {
    const response = await this.repo.findResponseById(id)
    if (!response) throw new AppError(404, 'RESPONSE_NOT_FOUND')
    if (response.department.headId !== reviewerId) throw new AppError(403, 'NOT_DEPT_HEAD')
    if (response.status !== 'SUBMITTED') throw new AppError(409, 'INVALID_TRANSITION')

    const updated = await this.repo.setResponseStatus(id, {
      status: 'APPROVED',
      approvedById: reviewerId,
      approvedAt: new Date(),
      rejectionReason: null,
    })

    void this.notifRepo
      .createForUser(
        response.submittedById,
        'SURVEY_RESPONSE_APPROVED',
        (lang) => ({
          title:
            lang === 'en'
              ? 'Hiring Survey Response Approved'
              : '채용 수요 응답 승인 완료',
          body:
            lang === 'en'
              ? `Your response for "${response.survey.title}" has been approved.`
              : `"${response.survey.title}" 부서 응답이 승인됐습니다.`,
        }),
        id,
      )
      .catch(console.error)

    // Once this approval brings the survey to "all APPROVED", tell HR the
    // survey is ready to close (mirrors the pre-workflow ALL_RESPONDED alert,
    // now tied to approvals). Cheap check — survey is already in scope.
    void this.checkAndNotifyAllApproved(response.surveyId).catch(console.error)

    return updated
  }

  private async checkAndNotifyAllApproved(surveyId: string) {
    const survey = await this.repo.findById(surveyId)
    if (!survey) return
    const approvedDeptIds = new Set(
      survey.responses.filter((r) => r.status === 'APPROVED').map((r) => r.departmentId),
    )
    const allApproved = survey.targetDepartments.every((t) =>
      approvedDeptIds.has(t.departmentId),
    )
    if (!allApproved) return
    await this.notifRepo.createForHrManager(
      'HIRING_SURVEY_ALL_RESPONDED',
      (lang) => ({
        title:
          lang === 'en'
            ? 'Hiring survey — all departments approved'
            : '채용 수요 조사 승인 완료',
        body:
          lang === 'en'
            ? `"${survey.title}" — all ${survey.targetDepartments.length} target departments have been approved. Ready to close.`
            : `"${survey.title}" — 대상 ${survey.targetDepartments.length}개 부서 응답 모두 승인 완료. 마감 준비됨.`,
      }),
      survey.id,
    )
  }

  /**
   * 부서장 rejects a SUBMITTED response with a required reason.
   * Fires `SURVEY_RESPONSE_REJECTED` back to the leader with the reason.
   * The response returns to REJECTED status; leader can edit and resubmit.
   */
  async rejectResponse(id: string, reviewerId: string, rejectionReason: string) {
    const trimmed = rejectionReason?.trim()
    if (!trimmed) throw new AppError(400, 'REJECTION_REASON_REQUIRED')

    const response = await this.repo.findResponseById(id)
    if (!response) throw new AppError(404, 'RESPONSE_NOT_FOUND')
    if (response.department.headId !== reviewerId) throw new AppError(403, 'NOT_DEPT_HEAD')
    if (response.status !== 'SUBMITTED') throw new AppError(409, 'INVALID_TRANSITION')

    const updated = await this.repo.setResponseStatus(id, {
      status: 'REJECTED',
      rejectionReason: trimmed,
      approvedById: null,
      approvedAt: null,
    })

    void this.notifRepo
      .createForUser(
        response.submittedById,
        'SURVEY_RESPONSE_REJECTED',
        (lang) => ({
          title:
            lang === 'en'
              ? 'Hiring Survey Response Rejected'
              : '채용 수요 응답 반려',
          body:
            lang === 'en'
              ? `Your response for "${response.survey.title}" was rejected: ${trimmed}`
              : `"${response.survey.title}" 부서 응답이 반려됐습니다: ${trimmed}`,
        }),
        id,
      )
      .catch(console.error)

    return updated
  }

  private validateResponseFields(dto: CreateSurveyResponseDto) {
    if (!dto.roleTitle?.trim()) throw new AppError(400, 'ROLE_TITLE_REQUIRED')
    if (!dto.headcount || dto.headcount < 1) throw new AppError(400, 'INVALID_HEADCOUNT')
    if (dto.quarter !== undefined && dto.quarter !== null && (dto.quarter < 1 || dto.quarter > 4)) {
      throw new AppError(400, 'INVALID_QUARTER')
    }
    if (!dto.reason?.trim()) throw new AppError(400, 'REASON_REQUIRED')
  }

  async close(surveyId: string, closedByUserId: string) {
    const survey = await this.getById(surveyId)
    if (survey.status !== 'OPEN') throw new AppError(409, 'SURVEY_NOT_OPEN')

    // HR close guard (grill Q4 a1): every target dept must have an APPROVED
    // response. If any dept is still DRAFT/SUBMITTED/REJECTED (or missing
    // entirely), the survey can't be closed — HR would carry rejected data
    // into the plan report otherwise.
    const responsesByDept = new Map(
      survey.responses.map((r) => [r.departmentId, r]),
    )
    type Blocker = { departmentId: number; departmentName: string; status: string }
    const blocking: Blocker[] = survey.targetDepartments
      .map((t): Blocker | null => {
        const r = responsesByDept.get(t.departmentId)
        if (!r) {
          return { departmentId: t.departmentId, departmentName: t.department.name, status: 'MISSING' }
        }
        if (r.status !== 'APPROVED') {
          return { departmentId: t.departmentId, departmentName: t.department.name, status: r.status }
        }
        return null
      })
      .filter((x): x is Blocker => x !== null)

    if (blocking.length > 0) {
      const err = new AppError(409, 'RESPONSES_NOT_APPROVED') as AppError & { detail?: unknown }
      err.detail = { blocking }
      throw err
    }

    await this.repo.close(surveyId)

    const responses = await this.repo.findResponsesBySurvey(surveyId)

    const planReport = await this.planReportRepo.createDraftForSurvey({
      surveyId,
      createdById: closedByUserId,
      title: `${survey.title} — 연간 채용 계획서`,
    })

    if (responses.length > 0) {
      await this.planReportRepo.createHiringPlanItems(
        responses.map((r) => {
          const item: {
            planReportId: string
            surveyResponseId: string
            roleTitle: string
            headcount: number
            quarter?: number
            priority: any
            estimatedBudget?: number
          } = {
            planReportId: planReport.id,
            surveyResponseId: r.id,
            roleTitle: r.roleTitle,
            headcount: r.headcount,
            priority: r.priority as any,
          }
          if (r.quarter != null) item.quarter = r.quarter
          if (r.estimatedBudget != null) item.estimatedBudget = r.estimatedBudget
          return item
        })
      )
    }

    void this.notifRepo.createForHrManager(
      'HIRING_SURVEY_CLOSED',
      () => ({
        title: '채용 수요 조사 마감',
        body: `"${survey.title}" 조사가 마감됐습니다. 계획 항목 ${responses.length}건이 생성됐습니다.`,
      }),
      surveyId,
    ).catch(console.error)

    return planReport
  }

  async updateDraft(id: string, dto: UpdateHiringSurveyDraftDto) {
    const survey = await this.getById(id)
    if (survey.status !== 'DRAFT') throw new AppError(409, 'SURVEY_NOT_DRAFT')

    const data: { title?: string; deadlineAt?: Date; targetDeptIds?: number[] } = {}
    if (dto.title !== undefined) {
      if (!dto.title.trim()) throw new AppError(400, 'TITLE_REQUIRED')
      data.title = dto.title
    }
    if (dto.deadlineAt !== undefined) {
      data.deadlineAt = new Date(dto.deadlineAt)
    }
    if (dto.targetDeptIds !== undefined) {
      if (dto.targetDeptIds.length === 0) throw new AppError(400, 'TARGET_DEPTS_REQUIRED')
      data.targetDeptIds = dto.targetDeptIds
    }

    return this.repo.updateDraft(id, data)
  }

  async open(id: string) {
    const survey = await this.getById(id)
    if (survey.status !== 'DRAFT') throw new AppError(409, 'SURVEY_NOT_DRAFT')
    if (survey.targetDepartments.length === 0) throw new AppError(409, 'TARGET_DEPTS_REQUIRED')
    if (survey.deadlineAt < new Date()) throw new AppError(409, 'DEADLINE_IN_PAST')

    const opened = await this.repo.openDraft(id)

    // 대상 부서장 + LEADER 팀장들에게 HIRING_SURVEY_OPEN 알림 (grill Q4-c1)
    await this.notifyTargetHeadsAndLeaders(survey, survey.deadlineAt)

    return opened
  }

  async deleteDraft(id: string) {
    const survey = await this.getById(id)
    if (survey.status !== 'DRAFT') throw new AppError(409, 'SURVEY_NOT_DRAFT')
    await this.repo.deleteDraft(id)
  }

  async createQuarterlyDraft(args: {
    title: string
    deadlineAt: Date
    targetDeptIds: number[]
    systemUserId: string
  }) {
    if (!args.title?.trim()) throw new AppError(400, 'TITLE_REQUIRED')
    if (!args.deadlineAt) throw new AppError(400, 'DEADLINE_REQUIRED')
    if (!args.targetDeptIds || args.targetDeptIds.length === 0) {
      throw new AppError(400, 'TARGET_DEPTS_REQUIRED')
    }

    const draft = await this.repo.createDraft({
      title: args.title,
      deadlineAt: args.deadlineAt,
      targetDeptIds: args.targetDeptIds,
      createdById: args.systemUserId,
    })

    void this.notifRepo
      .createForHrManager(
        'HIRING_SURVEY_DRAFT_CREATED',
        () => ({
          title: '채용 수요 조사 자동 초안 생성',
          body: `"${draft.title}" 초안이 자동 생성됐습니다. 검토 후 open 해 주세요.`,
        }),
        draft.id,
      )
      .catch(console.error)

    return draft
  }

  async getParticipationRate(surveyId: string) {
    const survey = await this.getById(surveyId);
    const targetCount = survey.targetDepartments.length;
    const respondedIds = new Set(survey.responses.map((r) => r.departmentId));
    const respondedCount = respondedIds.size;
    const unrespondedDepts = survey.targetDepartments
      .filter((t) => !respondedIds.has(t.departmentId))
      .map((t) => ({ departmentId: t.departmentId, departmentName: t.department.name }));

    return {
      surveyId,
      status: survey.status,
      targetCount,
      respondedCount,
      participationRate: targetCount > 0 ? Math.round((respondedCount / targetCount) * 1000) / 10 : 0,
      unrespondedDepts,
    };
  }

  async autoCloseExpired(systemUserId: string) {
    const expired = await this.repo.findOpenPastDeadline()
    for (const survey of expired) {
      // With the APPROVED-all close guard, surveys with pending reviews will
      // throw RESPONSES_NOT_APPROVED — the cron shouldn't spam logs for that,
      // it's a legit "not ready" signal that HR needs to chase manually.
      await this.close(survey.id, systemUserId).catch((err) => {
        if (err?.code === 'RESPONSES_NOT_APPROVED') {
          console.warn(`[hiring-survey] auto-close skipped survey #${survey.id}: awaiting approvals`)
          return
        }
        console.error(err)
      })
    }
  }

  async sendDeadlineReminders() {
    const targetDate = new Date()
    targetDate.setDate(targetDate.getDate() + 3)

    const surveys = await this.repo.findOpenNearDeadline(targetDate)

    for (const survey of surveys) {
      const respondedDeptIds = new Set(survey.responses.map((r) => r.departmentId))
      const unrespondedHeadIds = survey.targetDepartments
        .filter((t) => !respondedDeptIds.has(t.departmentId))
        .map((t) => t.department.headId)
        .filter((id): id is string => id !== null)

      await Promise.all(
        unrespondedHeadIds.map((userId) =>
          this.notifRepo.create({
            userId,
            type: 'HIRING_SURVEY_DEADLINE_REMINDER',
            title: '채용 수요 조사 마감 D-3',
            body: `"${survey.title}" 채용 수요 조사 마감이 3일 남았습니다. 아직 응답하지 않으셨습니다.`,
            entityId: survey.id,
          })
        )
      )
    }
  }
}
