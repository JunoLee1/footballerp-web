import { randomInt } from "crypto";
import bcrypt from "bcrypt";
import { RecruitmentRepository } from "./recruitment.repo";
import { PlanReportRepository } from "../plan-report/plan-report.repo";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { maskEmail, maskPhone } from "../lib/maskPii";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";
import { sendApplicationStatusEmail } from "../lib/email";
import { cached } from "../lib/cache";
import type {
  CreateJobPostingDto,
  UpdateJobPostingDto,
  JobPostingListQuery,
  CreateJobApplicationDto,
  UpdateJobApplicationDto,
  CreateInterviewDto,
  UpdateInterviewDto,
  CreateReferenceCheckDto,
  UpdateReferenceCheckDto,
  ScreenApplicationDto,
} from "./dto/recruitment.dto";
import type { InterviewRound } from "../generated/enums";

function maskApplication<T extends { email: string | null; phone: string | null; onboarding?: { user?: { email: string } | null } | null }>(app: T): T {
  return {
    ...app,
    email: app.email ? maskEmail(app.email) : app.email,
    phone: maskPhone(app.phone),
    onboarding: app.onboarding?.user
      ? { ...app.onboarding, user: { ...app.onboarding.user, email: maskEmail(app.onboarding.user.email) } }
      : app.onboarding,
  };
}

/**
 * Trim + drop empty strings so the DB never stores accidental whitespace-only
 * entries that would silently break the HiringDispatch gate's set-lookup.
 * `undefined` in => `undefined` out — lets the caller distinguish "no update"
 * from "clear to empty".
 */
function normalizeRequiredDocuments(input: string[] | undefined): string[] | undefined {
  if (input === undefined) return undefined;
  return input.map((s) => s.trim()).filter((s) => s.length > 0);
}

export class RecruitmentService {
  constructor(
    private repo: RecruitmentRepository,
    private notifRepo?: NotificationRepository,
    private planReportRepo?: PlanReportRepository,
  ) {}

  // --- JobPosting ---

  listPostings(query: JobPostingListQuery) {
    const key = `recruitment:job-postings:${JSON.stringify(query)}`;
    return cached(key, 30, () => this.repo.findAllPostings(query));
  }

  async getPosting(id: number) {
    const posting = await this.repo.findPostingById(id);
    if (!posting) throw new AppError(404, "JOB_POSTING_NOT_FOUND");
    return posting;
  }

  async createPosting(dto: CreateJobPostingDto, createdById: number) {
    if (!this.planReportRepo) throw new AppError(500, "INTERNAL_ERROR");
    const planReport = await this.planReportRepo.findByIdLight(dto.planReportId);
    if (!planReport) throw new AppError(404, "PLAN_REPORT_NOT_FOUND");
    if (planReport.status !== "APPROVED") throw new AppError(409, "PLAN_REPORT_NOT_APPROVED");
    if (planReport.templateType !== "HR") throw new AppError(409, "PLAN_REPORT_NOT_HR_TYPE");

    if (!dto.hiringPlanItemId) throw new AppError(400, "HIRING_PLAN_ITEM_REQUIRED");
    const hiringPlanItem = await this.planReportRepo.findHiringPlanItemById(dto.hiringPlanItemId);
    if (!hiringPlanItem) throw new AppError(404, "HIRING_PLAN_ITEM_NOT_FOUND");
    if (hiringPlanItem.planReportId !== dto.planReportId) throw new AppError(400, "HIRING_PLAN_ITEM_MISMATCH");
    if (hiringPlanItem.status === "FULFILLED") throw new AppError(409, "HIRING_PLAN_ITEM_ALREADY_FULFILLED");
    if (hiringPlanItem.status === "CANCELLED") throw new AppError(409, "HIRING_PLAN_ITEM_CANCELLED");

    const requiredDocuments = normalizeRequiredDocuments(dto.requiredDocuments);
    const posting = await this.repo.createPosting({
      ...dto,
      ...(requiredDocuments !== undefined && { requiredDocuments }),
      createdById,
    });

    // 첫 JobPosting 생성 시 PLANNED → IN_PROGRESS 전이 (idempotent)
    if (hiringPlanItem.status === "PLANNED") {
      await this.planReportRepo.updateHiringPlanItemStatus(dto.hiringPlanItemId, "IN_PROGRESS");
    }

    return posting;
  }

  async bulkCreatePostingsFromPlanReport(planReportId: number, createdById: number) {
    if (!this.planReportRepo) throw new AppError(500, "INTERNAL_ERROR");

    const planReport = await this.planReportRepo.findByIdLight(planReportId);
    if (!planReport) throw new AppError(404, "PLAN_REPORT_NOT_FOUND");
    if (planReport.status !== "APPROVED") throw new AppError(409, "PLAN_REPORT_NOT_APPROVED");
    if (planReport.templateType !== "HR") throw new AppError(409, "PLAN_REPORT_NOT_HR_TYPE");

    const allItems = await this.planReportRepo.listHiringPlanItems(planReportId);

    const created: any[] = [];
    const skipped: { id: number; roleTitle: string; status: string }[] = [];

    for (const item of allItems) {
      if (item.status !== "PLANNED") {
        skipped.push({ id: item.id, roleTitle: item.roleTitle, status: item.status });
        continue;
      }

      // Auto-generate title + description
      const title = `${planReport.title} - ${item.roleTitle}`;
      const description = [
        `역할: ${item.roleTitle}`,
        `채용 인원: ${item.headcount}명`,
        `우선순위: ${item.priority}`,
        item.quarter ? `분기: Q${item.quarter}` : null,
        item.estimatedBudget ? `예산: ${item.estimatedBudget.toLocaleString()}원` : null,
      ].filter(Boolean).join(" · ");

      const dto: CreateJobPostingDto = {
        planReportId,
        hiringPlanItemId: item.id,
        title,
        description,
        headcount: item.headcount,
      };
      if (planReport.departmentId != null) dto.departmentId = planReport.departmentId;
      const posting = await this.createPosting(dto, createdById);
      created.push(posting);
    }

    return { created, skipped };
  }

  async updatePosting(id: number, dto: UpdateJobPostingDto) {
    await this.getPosting(id);
    const requiredDocuments = normalizeRequiredDocuments(dto.requiredDocuments);
    return this.repo.updatePosting(id, {
      ...dto,
      ...(requiredDocuments !== undefined && { requiredDocuments }),
    });
  }

  async approvePosting(id: number, approvedById: number) {
    const posting = await this.getPosting(id);
    if (posting.status !== "DRAFT") throw new AppError(409, "JOB_POSTING_NOT_DRAFT");
    return this.repo.approvePosting(id, approvedById);
  }

  async closePosting(id: number) {
    const posting = await this.getPosting(id);
    if (posting.status === "CLOSED") throw new AppError(409, "JOB_POSTING_ALREADY_CLOSED");
    return this.repo.closePosting(id);
  }

  // --- JobApplication ---

  async listApplications(postingId: number) {
    await this.getPosting(postingId);
    const apps = await this.repo.findApplicationsByPosting(postingId);
    return apps.map(maskApplication);
  }

  async getApplication(id: number) {
    const app = await this.repo.findApplicationById(id);
    if (!app) throw new AppError(404, "JOB_APPLICATION_NOT_FOUND");
    return maskApplication(app);
  }

  async apply(postingId: number, dto: CreateJobApplicationDto) {
    const posting = await this.getPosting(postingId);
    if (posting.status !== "OPEN") throw new AppError(409, "JOB_POSTING_NOT_OPEN");
    const existing = await this.repo.findApplicationByEmail(postingId, dto.email);
    if (existing) throw new AppError(409, "APPLICATION_DUPLICATE");
    return this.repo.createApplication(postingId, dto);
  }

  async updateApplication(id: number, dto: UpdateJobApplicationDto) {
    await this.getApplication(id);
    if (dto.status !== undefined && dto.status !== "SCREENING") {
      throw new AppError(400, "INVALID_STATUS_TRANSITION");
    }
    return this.repo.updateApplication(id, dto);
  }

  async screenApplication(id: number, dto: ScreenApplicationDto, actorId: number) {
    const app = await this.getApplication(id);
    if (app.status !== "SCREENING") throw new AppError(409, "INVALID_STATUS_FOR_SCREEN");
    if (dto.result === "FAIL" && !dto.notes?.trim()) {
      throw new AppError(400, "SCREENING_NOTES_REQUIRED_FOR_FAIL");
    }

    return this.repo.screenApplication(id, {
      screeningResult: dto.result,
      screeningNotes: dto.notes ?? null,
      screenedById: actorId,
      screenedAt: new Date(),
    });
  }

  async rejectApplication(id: number, actorId?: number) {
    const app = await this.getApplication(id);
    if (app.status === "REJECTED") throw new AppError(409, "APPLICATION_ALREADY_REJECTED");
    const wasOffered = app.status === "OFFERED";
    const postingId = (app as any).posting?.id ?? (app as any).postingId ?? null;

    const result = await this.repo.rejectApplication(id, actorId as number);
    // SJ6: email applicant on rejection — fetch raw (unmasked) record for email address
    const rawApp = await this.repo.findApplicationById(id);
    if (rawApp?.email) {
      void sendApplicationStatusEmail(rawApp.email, rawApp.applicantName, "REJECTED").catch(console.error);
    }

    // Auto-promote from waitlist: only when OFFERED → REJECTED (headcount opens up).
    // Grill Q3 b1: waitlist promote also traverses the 3-stage approval flow,
    // so instead of straight-to-OFFERED we invoke `beginOfferApproval` on the
    // promoted candidate. The applicant email is deferred until HR approves.
    if (wasOffered && postingId && (this.repo as any).findTopWaitlistForPosting) {
      try {
        const top = await (this.repo as any).findTopWaitlistForPosting(postingId);
        if (top) {
          // I3 fix: atomically consume the waitlist Interview (WAITLIST → PASS).
          // If updateMany returns count=0, someone else already consumed it — silent skip
          // in the auto-promote path (not user-driven, so no error surface).
          // C1 fix: marks Interview as consumed so it no longer appears in waitlist queries.
          const consumed = await getPrisma().interview.updateMany({
            where: { id: top.id, result: "WAITLIST" },
            data: { result: "PASS" },
          });
          if (consumed.count === 0) {
            // Already consumed by a concurrent request — skip silently.
          } else {
            // Route through the 3-stage approval flow. Waitlist candidates
            // may not have a REFERENCE_CHECK row yet — the auto-promote path
            // therefore bypasses `offerApplication`'s status guard and calls
            // `beginOfferApproval` directly.
            await this.beginOfferApproval(top.applicationId, actorId as number);
            void writeAuditLog({
              actorId: actorId ?? 0,
              action: "APPLICATION_AUTO_PROMOTED_FROM_WAITLIST",
              targetId: top.applicationId,
              detail: { triggeredByRejectionOf: id },
            }).catch(console.error);
          }
        }
      } catch (err) {
        console.warn(`[auto-promote-waitlist] failed for posting=${postingId}:`, err);
      }
    }

    return result;
  }

  async reinstateApplication(id: number, actorId: number) {
    const app = await this.getApplication(id);
    if (app.status !== "REJECTED") throw new AppError(409, "APPLICATION_NOT_REJECTED");
    if (!(app as any).previousStatus) throw new AppError(409, "NO_PREVIOUS_STATUS");
    return this.repo.reinstateApplication(id, actorId);
  }

  /**
   * Initiates the 3-stage offer approval workflow (fix #370).
   *
   * Old behaviour was: REFERENCE_CHECK → OFFERED directly (single HR call).
   * New behaviour: REFERENCE_CHECK → OFFER_PENDING_LEADER (or skip to the
   * next stage if the LEADER/DEPT_HEAD slot is unfilled).
   *
   * The actual OFFERED transition (+ email + HiringPlanItem link) happens
   * only when HR approves (see `hrApprove`).
   */
  async offerApplication(id: number, initiatedById: number) {
    const app = await this.getApplication(id);
    if (app.status !== "REFERENCE_CHECK") throw new AppError(409, "APPLICATION_NOT_IN_REFERENCE_CHECK");
    const refCheck = await getPrisma().referenceCheck.findUnique({
      where: { applicationId: id },
      select: { result: true },
    });
    if (refCheck?.result === "FLAGGED") {
      throw new AppError(409, "REFERENCE_CHECK_FLAGGED");
    }
    return this.beginOfferApproval(id, initiatedById);
  }

  /**
   * Resolves the initial pending status for the 3-stage flow and applies it.
   *
   * Skip rules (grill Q1 c1/d1):
   *   - No LEADER in posting.department  → skip LEADER → try DEPT_HEAD
   *   - No DEPT_HEAD (headId=null)       → skip DEPT_HEAD → HR (HR substitutes)
   *   - Both absent                      → straight to OFFER_PENDING_HR
   *
   * Notification fan-out (grill Q3 c1) mirrors the resolved starting stage.
   * Called both by explicit HR-initiated offer and by the waitlist auto-
   * promote path so the two enter the same state machine.
   */
  private async beginOfferApproval(id: number, initiatedById: number) {
    // Load raw (unmasked) — we need posting.department to route.
    const raw = await this.repo.findApplicationById(id);
    if (!raw) throw new AppError(404, "JOB_APPLICATION_NOT_FOUND");
    const dept = raw.posting?.department;
    const leaderId = dept ? await this.repo.findDepartmentLeader(dept.id) : null;
    const deptHeadId = dept?.headId ?? null;

    const nextStatus: "OFFER_PENDING_LEADER" | "OFFER_PENDING_DEPT_HEAD" | "OFFER_PENDING_HR" =
      leaderId ? "OFFER_PENDING_LEADER"
        : deptHeadId ? "OFFER_PENDING_DEPT_HEAD"
        : "OFFER_PENDING_HR";

    const updated = await this.repo.setApplicationStatus(id, nextStatus, initiatedById);

    // Fire-and-forget notification (grill Q3 c1). Do not roll back the
    // status transition on a notif insert failure — matches the injury
    // and asset-request conventions.
    if (this.notifRepo) {
      const notifRepo = this.notifRepo;
      const applicantName = raw.applicantName;
      const notify = () => {
        if (nextStatus === "OFFER_PENDING_LEADER" && leaderId) {
          void notifRepo.createForUser(
            leaderId,
            "OFFER_APPROVAL_REQUESTED_LEADER",
            (lang) => ({
              title: lang === "en" ? "Offer Approval Required (Leader)" : "채용 오퍼 팀장 결재 대기",
              body:
                lang === "en"
                  ? `Application #${id} (${applicantName}) awaits your approval.`
                  : `지원자 #${id} (${applicantName})의 오퍼 결재 대기입니다.`,
            }),
            id,
          ).catch(console.error);
        } else if (nextStatus === "OFFER_PENDING_DEPT_HEAD" && deptHeadId) {
          void notifRepo.createForUser(
            deptHeadId,
            "OFFER_APPROVAL_REQUESTED_DEPT_HEAD",
            (lang) => ({
              title: lang === "en" ? "Offer Approval Required (Dept Head)" : "채용 오퍼 부서장 결재 대기",
              body:
                lang === "en"
                  ? `Application #${id} (${applicantName}) awaits your approval.`
                  : `지원자 #${id} (${applicantName})의 오퍼 결재 대기입니다.`,
            }),
            id,
          ).catch(console.error);
        } else if (nextStatus === "OFFER_PENDING_HR") {
          void notifRepo.createForHrManager(
            "OFFER_APPROVAL_REQUESTED_HR",
            (lang) => ({
              title: lang === "en" ? "Offer Approval Required (HR)" : "채용 오퍼 HR 결재 대기",
              body:
                lang === "en"
                  ? `Application #${id} (${applicantName}) awaits HR final approval.`
                  : `지원자 #${id} (${applicantName})의 HR 최종 결재 대기입니다.`,
            }),
            id,
          ).catch(console.error);
        }
      };
      notify();
    }

    return updated;
  }

  // ────────────────────────────────────────────
  // Offer 3-stage approval — LEADER
  // ────────────────────────────────────────────

  async leaderApprove(applicationId: number, reviewerId: number) {
    const raw = await this.repo.findApplicationById(applicationId);
    if (!raw) throw new AppError(404, "JOB_APPLICATION_NOT_FOUND");
    if (raw.status !== "OFFER_PENDING_LEADER") throw new AppError(409, "INVALID_STATUS");

    const dept = raw.posting?.department;
    const leaderId = dept ? await this.repo.findDepartmentLeader(dept.id) : null;
    if (!leaderId || leaderId !== reviewerId) throw new AppError(403, "NOT_LEADER");
    // Grill Q3 d1 — self-approval blocked. Reviewer must not be the offer initiator.
    if (raw.offeredById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const deptHeadId = dept?.headId ?? null;
    // Skip DEPT_HEAD when the slot is unfilled (grill Q1 d1 — HR substitutes).
    const nextStatus: "OFFER_PENDING_DEPT_HEAD" | "OFFER_PENDING_HR" =
      deptHeadId ? "OFFER_PENDING_DEPT_HEAD" : "OFFER_PENDING_HR";

    const prisma = getPrisma();
    const updated = await prisma.$transaction(async (tx) => {
      await this.repo.addOfferApproval(
        applicationId,
        { stage: "LEADER", action: "APPROVED", reviewerId },
        tx as any,
      );
      return this.repo.updateApplicationStatusInTx(applicationId, nextStatus, tx as any);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "JOB_APPLICATION_OFFER_LEADER_APPROVED",
      targetId: applicationId,
      detail: { nextStatus },
    }).catch(console.error);

    // Notify the next reviewer — dept-head or HR-manager depending on skip.
    if (this.notifRepo) {
      const applicantName = raw.applicantName;
      if (nextStatus === "OFFER_PENDING_DEPT_HEAD" && deptHeadId) {
        void this.notifRepo.createForUser(
          deptHeadId,
          "OFFER_APPROVAL_REQUESTED_DEPT_HEAD",
          (lang) => ({
            title: lang === "en" ? "Offer Approval Required (Dept Head)" : "채용 오퍼 부서장 결재 대기",
            body:
              lang === "en"
                ? `Application #${applicationId} (${applicantName}) awaits your approval.`
                : `지원자 #${applicationId} (${applicantName})의 오퍼 결재 대기입니다.`,
          }),
          applicationId,
        ).catch(console.error);
      } else if (nextStatus === "OFFER_PENDING_HR") {
        void this.notifRepo.createForHrManager(
          "OFFER_APPROVAL_REQUESTED_HR",
          (lang) => ({
            title: lang === "en" ? "Offer Approval Required (HR)" : "채용 오퍼 HR 결재 대기",
            body:
              lang === "en"
                ? `Application #${applicationId} (${applicantName}) awaits HR final approval.`
                : `지원자 #${applicationId} (${applicantName})의 HR 최종 결재 대기입니다.`,
          }),
          applicationId,
        ).catch(console.error);
      }
    }

    return updated;
  }

  async leaderReject(applicationId: number, reviewerId: number, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError(400, "REASON_REQUIRED");

    const raw = await this.repo.findApplicationById(applicationId);
    if (!raw) throw new AppError(404, "JOB_APPLICATION_NOT_FOUND");
    if (raw.status !== "OFFER_PENDING_LEADER") throw new AppError(409, "INVALID_STATUS");

    const dept = raw.posting?.department;
    const leaderId = dept ? await this.repo.findDepartmentLeader(dept.id) : null;
    if (!leaderId || leaderId !== reviewerId) throw new AppError(403, "NOT_LEADER");
    if (raw.offeredById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    // Rejection is terminal (grill Q2 d1). We record the stage-specific
    // status so the timeline still shows *where* the rejection happened.
    const prisma = getPrisma();
    const updated = await prisma.$transaction(async (tx) => {
      await this.repo.addOfferApproval(
        applicationId,
        { stage: "LEADER", action: "REJECTED", reviewerId, reason: trimmed },
        tx as any,
      );
      return this.repo.updateApplicationStatusInTx(applicationId, "OFFER_LEADER_REJECTED", tx as any);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "JOB_APPLICATION_OFFER_LEADER_REJECTED",
      targetId: applicationId,
      detail: { reason: trimmed },
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // Offer 3-stage approval — DEPT_HEAD
  // ────────────────────────────────────────────

  async deptHeadApprove(applicationId: number, reviewerId: number) {
    const raw = await this.repo.findApplicationById(applicationId);
    if (!raw) throw new AppError(404, "JOB_APPLICATION_NOT_FOUND");
    if (raw.status !== "OFFER_PENDING_DEPT_HEAD") throw new AppError(409, "INVALID_STATUS");
    if (raw.posting?.department?.headId !== reviewerId) throw new AppError(403, "NOT_DEPT_HEAD");
    if (raw.offeredById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const prisma = getPrisma();
    const updated = await prisma.$transaction(async (tx) => {
      await this.repo.addOfferApproval(
        applicationId,
        { stage: "DEPT_HEAD", action: "APPROVED", reviewerId },
        tx as any,
      );
      return this.repo.updateApplicationStatusInTx(applicationId, "OFFER_PENDING_HR", tx as any);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "JOB_APPLICATION_OFFER_DEPT_HEAD_APPROVED",
      targetId: applicationId,
    }).catch(console.error);

    if (this.notifRepo) {
      const applicantName = raw.applicantName;
      void this.notifRepo.createForHrManager(
        "OFFER_APPROVAL_REQUESTED_HR",
        (lang) => ({
          title: lang === "en" ? "Offer Approval Required (HR)" : "채용 오퍼 HR 결재 대기",
          body:
            lang === "en"
              ? `Application #${applicationId} (${applicantName}) awaits HR final approval.`
              : `지원자 #${applicationId} (${applicantName})의 HR 최종 결재 대기입니다.`,
        }),
        applicationId,
      ).catch(console.error);
    }

    return updated;
  }

  async deptHeadReject(applicationId: number, reviewerId: number, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError(400, "REASON_REQUIRED");

    const raw = await this.repo.findApplicationById(applicationId);
    if (!raw) throw new AppError(404, "JOB_APPLICATION_NOT_FOUND");
    if (raw.status !== "OFFER_PENDING_DEPT_HEAD") throw new AppError(409, "INVALID_STATUS");
    if (raw.posting?.department?.headId !== reviewerId) throw new AppError(403, "NOT_DEPT_HEAD");
    if (raw.offeredById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const prisma = getPrisma();
    const updated = await prisma.$transaction(async (tx) => {
      await this.repo.addOfferApproval(
        applicationId,
        { stage: "DEPT_HEAD", action: "REJECTED", reviewerId, reason: trimmed },
        tx as any,
      );
      return this.repo.updateApplicationStatusInTx(applicationId, "OFFER_DEPT_HEAD_REJECTED", tx as any);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "JOB_APPLICATION_OFFER_DEPT_HEAD_REJECTED",
      targetId: applicationId,
      detail: { reason: trimmed },
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // Offer 3-stage approval — HR
  // ────────────────────────────────────────────

  /**
   * Terminal APPROVE — transitions to OFFERED and fires the side-effects
   * that used to live in the old single-shot `offerApplication` (email,
   * offeredById / offeredAt on the application). The controller already
   * gates on `canWriteHR` so anyone landing here is HR-eligible.
   */
  async hrApprove(applicationId: number, reviewerId: number) {
    const raw = await this.repo.findApplicationById(applicationId);
    if (!raw) throw new AppError(404, "JOB_APPLICATION_NOT_FOUND");
    if (raw.status !== "OFFER_PENDING_HR") throw new AppError(409, "INVALID_STATUS");
    if (raw.offeredById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    // Approval row + status + offeredBy stamp must commit together — otherwise
    // a partial commit would leave the timeline out of sync with the state.
    const prisma = getPrisma();
    const updated = await prisma.$transaction(async (tx) => {
      await this.repo.addOfferApproval(
        applicationId,
        { stage: "HR", action: "APPROVED", reviewerId },
        tx as any,
      );
      // OFFERED transition also stamps offeredAt / offeredById to reviewer —
      // preserves the pre-#370 contract (raw.offeredBy = HR final approver).
      return (tx as any).jobApplication.update({
        where: { id: applicationId },
        data: { status: "OFFERED", offeredAt: new Date(), offeredById: reviewerId },
        include: {
          posting: {
            select: {
              id: true, title: true, hiringPlanItemId: true, departmentId: true,
              department: { select: { id: true, name: true, headId: true } },
            },
          },
          offeredBy: { select: { id: true, username: true } },
          interviews: { orderBy: { round: "asc" as const } },
          referenceCheck: true,
          onboarding: {
            include: { user: { select: { id: true, username: true, email: true } } },
          },
          offerApprovals: {
            orderBy: { createdAt: "asc" as const },
            include: { reviewer: { select: { id: true, username: true, nickname: true } } },
          },
        },
      });
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "JOB_APPLICATION_STATUS_CHANGED",
      targetId: applicationId,
      detail: { newStatus: "OFFERED" },
    }).catch(console.error);

    // SJ6 email side effect — preserved from the old single-shot path.
    if (raw.email) {
      void sendApplicationStatusEmail(raw.email, raw.applicantName, "OFFERED").catch(console.error);
    }

    return updated;
  }

  async hrReject(applicationId: number, reviewerId: number, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError(400, "REASON_REQUIRED");

    const raw = await this.repo.findApplicationById(applicationId);
    if (!raw) throw new AppError(404, "JOB_APPLICATION_NOT_FOUND");
    if (raw.status !== "OFFER_PENDING_HR") throw new AppError(409, "INVALID_STATUS");
    if (raw.offeredById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const prisma = getPrisma();
    const updated = await prisma.$transaction(async (tx) => {
      await this.repo.addOfferApproval(
        applicationId,
        { stage: "HR", action: "REJECTED", reviewerId, reason: trimmed },
        tx as any,
      );
      return this.repo.updateApplicationStatusInTx(applicationId, "OFFER_HR_REJECTED", tx as any);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "JOB_APPLICATION_OFFER_HR_REJECTED",
      targetId: applicationId,
      detail: { reason: trimmed },
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // Approval queue reads (list-by-role)
  // ────────────────────────────────────────────

  async listOfferApprovalQueue(
    userId: number,
    role: string,
    foRole: string | null | undefined,
    stage: "LEADER" | "DEPT_HEAD" | "HR",
  ) {
    if (stage === "LEADER") {
      const rows = await this.repo.findApplicationsPendingLeader(userId);
      return rows.map(maskApplication);
    }
    if (stage === "DEPT_HEAD") {
      const rows = await this.repo.findApplicationsPendingDeptHead(userId);
      return rows.map(maskApplication);
    }
    // HR queue is role-gated at the controller (canWriteHR). We also
    // re-check here so service-layer callers can't bypass it.
    const { canWriteHR } = await import("../lib/permissions");
    if (!canWriteHR(role, foRole)) throw new AppError(403, "FORBIDDEN");
    const rows = await this.repo.findApplicationsPendingHr();
    return rows.map(maskApplication);
  }

  // --- Interview ---

  async scheduleInterview(applicationId: number, dto: CreateInterviewDto, actorId?: number) {
    await this.getApplication(applicationId);
    const existing = await this.repo.findInterview(applicationId, dto.round);
    if (existing) throw new AppError(409, "INTERVIEW_ALREADY_EXISTS");
    const targetStatus: "INTERVIEW_1" | "INTERVIEW_2" =
      dto.round === "ROUND_1" ? "INTERVIEW_1" : "INTERVIEW_2";
    await this.repo.setApplicationStatus(applicationId, targetStatus);
    const interview = await this.repo.createInterview(applicationId, dto);

    // S3: notify assigned interviewers
    if (dto.interviewerIds && dto.interviewerIds.length > 0 && this.notifRepo) {
      void this.notifRepo.createForUsers(
        dto.interviewerIds,
        "INTERVIEW_SCHEDULED",
        () => ({
          title: "면접 일정 배정됨",
          body: `${dto.round} 면접이 배정되었습니다. 일정을 확인해주세요.`,
        }),
        interview.id,
      ).catch(console.error);
    }

    return interview;
  }

  async updateInterview(applicationId: number, round: InterviewRound, dto: UpdateInterviewDto) {
    const existing = await this.repo.findInterview(applicationId, round);
    if (!existing) throw new AppError(404, "INTERVIEW_NOT_FOUND");

    // SJ3: if confirming a final result, all three scores must be present
    if (dto.result && dto.result !== "PENDING") {
      const scoreSkill = dto.scoreSkill ?? existing.scoreSkill;
      const scoreComm = dto.scoreComm ?? existing.scoreComm;
      const scoreCulture = dto.scoreCulture ?? existing.scoreCulture;
      if (scoreSkill == null || scoreComm == null || scoreCulture == null) {
        throw new AppError(400, "INTERVIEW_SCORES_REQUIRED");
      }

      // Fix #366: threshold policy applies only when confirming PASS.
      if (dto.result === "PASS") {
        const settings = (this.repo as any).getClubSettings
          ? await (this.repo as any).getClubSettings()
          : null;
        const threshold = settings?.interviewPassThreshold ?? 3;
        const belowThreshold =
          scoreSkill < threshold || scoreComm < threshold || scoreCulture < threshold;

        if (belowThreshold) {
          if (!dto.overrideThreshold) {
            throw new AppError(400, "INTERVIEW_SCORE_BELOW_THRESHOLD");
          }
          if (!dto.overrideReason?.trim()) {
            throw new AppError(400, "OVERRIDE_REASON_REQUIRED");
          }
          // Override 승인: audit log 남김. actorId 는 controller 에서 전달받는 확장 여지.
          void writeAuditLog({
            actorId: 0,
            action: "INTERVIEW_THRESHOLD_OVERRIDE",
            targetId: existing.id,
            detail: {
              reason: dto.overrideReason,
              scores: { scoreSkill, scoreComm, scoreCulture },
              threshold,
            },
          }).catch(console.error);
        }
      }
    }

    return this.repo.updateInterview(applicationId, round, dto);
  }

  // --- ReferenceCheck ---

  async createReferenceCheck(applicationId: number, dto: CreateReferenceCheckDto, actorId?: number) {
    const app = await this.getApplication(applicationId);

    // CL5: consent must not be explicitly declined
    if ((app as any).referenceCheckConsent === false) {
      throw new AppError(409, "REFERENCE_CHECK_CONSENT_DECLINED");
    }

    await this.repo.setApplicationStatus(applicationId, "REFERENCE_CHECK");
    return this.repo.createReferenceCheck(applicationId, dto);
  }

  async updateReferenceCheck(applicationId: number, dto: UpdateReferenceCheckDto) {
    await this.getApplication(applicationId);
    return this.repo.updateReferenceCheck(applicationId, dto);
  }

  // --- Onboarding ---

  async startOnboarding(applicationId: number, userId: number) {
    const app = await this.getApplication(applicationId);
    if (app.status !== "OFFERED") throw new AppError(409, "APPLICATION_NOT_OFFERED");
    const existing = await this.repo.findOnboardingByApplication(applicationId);
    if (existing) throw new AppError(409, "ONBOARDING_ALREADY_STARTED");
    const rawOtp = randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(rawOtp, 10);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const record = await this.repo.createOnboarding(applicationId, userId, otpHash, expiresAt);
    return { ...record, otpCode: rawOtp };
  }

  async verifyEmail(applicationId: number, otp: string) {
    const onboarding = await this.repo.findOnboardingByApplication(applicationId);
    if (!onboarding) throw new AppError(404, "ONBOARDING_NOT_FOUND");
    if (onboarding.emailVerifiedAt) throw new AppError(409, "EMAIL_ALREADY_VERIFIED");
    if (onboarding.otpExpiresAt < new Date()) throw new AppError(400, "OTP_EXPIRED");
    const isValid = await bcrypt.compare(otp, onboarding.otpCode);
    if (!isValid) throw new AppError(400, "INVALID_OTP");
    return this.repo.markEmailVerified(applicationId);
  }

  async completeMfa(applicationId: number) {
    const onboarding = await this.repo.findOnboardingByApplication(applicationId);
    if (!onboarding) throw new AppError(404, "ONBOARDING_NOT_FOUND");
    if (!onboarding.emailVerifiedAt) throw new AppError(409, "EMAIL_NOT_VERIFIED");
    if (onboarding.mfaRegisteredAt) throw new AppError(409, "MFA_ALREADY_REGISTERED");
    const result = await this.repo.markMfaRegistered(applicationId);

    // Mark application as ONBOARDED (system-initiated, no human actorId — use 0 as sentinel)
    const prisma = getPrisma();
    const application = await this.repo.findApplicationById(applicationId);
    if (application) {
      await this.repo.completeOnboarding(applicationId, 0);

      // Auto-create StaffRecord if not already exists
      const existingRecord = await prisma.staffRecord.findFirst({
        where: { employeeId: String(applicationId) },
      });
      if (!existingRecord) {
        await prisma.staffRecord.create({
          data: {
            name: application.applicantName,
            role: application.posting?.title ?? "Staff",
            employeeId: String(applicationId),
            isActive: true,
            createdById: application.offeredById ?? 1,
            employmentStartDate: new Date(),
          } as any,
        });
      }

      // HiringPlanItem fulfilledCount 증가 + FULFILLED 전이 (posting 이 hiringPlanItemId 를 가진 경우만).
      // $transaction 으로 원자성 보장 — increment 와 FULFILLED 전이가 함께 성공하거나 함께 실패.
      // updateMany where: { status: "IN_PROGRESS" } 로 CANCELLED race 방어 (CANCELLED 를 FULFILLED 로 덮어쓰지 않음).
      const hiringPlanItemId = application.posting?.hiringPlanItemId;
      if (hiringPlanItemId && this.planReportRepo) {
        await prisma.$transaction(async (tx) => {
          // IN_PROGRESS 인 경우만 진행 — PLANNED/FULFILLED/CANCELLED 는 skip
          const item = await tx.hiringPlanItem.findUnique({
            where: { id: hiringPlanItemId },
            select: { id: true, headcount: true, fulfilledCount: true, status: true },
          });
          if (!item || item.status !== "IN_PROGRESS") return;

          const updated = await tx.hiringPlanItem.update({
            where: { id: hiringPlanItemId },
            data: { fulfilledCount: { increment: 1 } },
            select: { fulfilledCount: true, headcount: true },
          });

          if (updated.fulfilledCount >= updated.headcount) {
            // guard: 다른 트랜잭션이 CANCELLED 로 바꿨으면 여기서 no-op
            await tx.hiringPlanItem.updateMany({
              where: { id: hiringPlanItemId, status: "IN_PROGRESS" },
              data: { status: "FULFILLED", fulfilledAt: new Date() },
            });
          }
        });
      }
    }

    return result;
  }

  getHeadcountProgress() {
    return this.repo.getHeadcountProgress();
  }

  getTimeToHireStats() {
    return this.repo.getTimeToHireStats();
  }

  getCostPerHire() {
    return this.repo.getCostPerHire();
  }

  addInterviewerScore(interviewId: number, data: { interviewerId: number; scoreSkill?: number; scoreComm?: number; scoreCulture?: number; comment?: string }, actorId: number) {
    return this.repo.addInterviewerScore({ interviewId, ...data }, actorId);
  }

  getInterviewerScores(interviewId: number) {
    return this.repo.getInterviewerScores(interviewId);
  }

  async getInterviewerScoreAggregate(applicationId: number, round: InterviewRound) {
    const interview = await this.repo.findInterview(applicationId, round);
    if (!interview) throw new AppError(404, "INTERVIEW_NOT_FOUND");

    const agg = await this.repo.aggregateInterviewerScores(interview.id);
    if (!agg || agg._count === 0) {
      throw new AppError(400, "NO_INTERVIEWER_SCORES_YET");
    }

    const round1 = (v: number | null | undefined) => (v == null ? null : Math.round(v));
    return {
      scoreSkill: round1(agg._avg.scoreSkill),
      scoreComm: round1(agg._avg.scoreComm),
      scoreCulture: round1(agg._avg.scoreCulture),
      method: "AVG" as const,
      count: agg._count,
    };
  }

  async finalizeInterviewScore(applicationId: number, round: InterviewRound) {
    const aggregate = await this.getInterviewerScoreAggregate(applicationId, round);
    // Null values pass through but are filtered out by repo.updateInterview (`!= null` guard),
    // so partial-null aggregates only update the categories that have scores.
    return this.repo.updateInterview(applicationId, round, {
      scoreSkill: aggregate.scoreSkill as number,
      scoreComm: aggregate.scoreComm as number,
      scoreCulture: aggregate.scoreCulture as number,
    });
  }

  // --- Waitlist (fix #366) ---

  async getWaitlistForPosting(postingId: number) {
    // I5 fix: 404 if posting doesn't exist (matches listApplications pattern).
    await this.getPosting(postingId);
    const waitlisted = await (this.repo as any).findWaitlistedInterviews(postingId);
    return waitlisted
      .map((iv: any) => ({
        interviewId: iv.id,
        applicationId: iv.applicationId,
        scoreSum: (iv.scoreSkill ?? 0) + (iv.scoreComm ?? 0) + (iv.scoreCulture ?? 0),
        application: iv.application,
      }))
      .sort((a: any, b: any) => b.scoreSum - a.scoreSum);
  }

  async promoteFromWaitlist(applicationId: number, actorId: number) {
    const app = await this.getApplication(applicationId);

    // C2 fix: status guard — reject terminal/already-offered states.
    // Also refuse re-entry once approval is in flight (any OFFER_PENDING_*
    // or OFFER_*_REJECTED status) so a manual promote can't race the flow.
    const nonPromotableStatuses = [
      "OFFERED",
      "ONBOARDED",
      "REJECTED",
      "OFFER_PENDING_LEADER",
      "OFFER_PENDING_DEPT_HEAD",
      "OFFER_PENDING_HR",
      "OFFER_LEADER_REJECTED",
      "OFFER_DEPT_HEAD_REJECTED",
      "OFFER_HR_REJECTED",
    ];
    if (nonPromotableStatuses.includes(app.status)) {
      throw new AppError(409, "APPLICATION_NOT_PROMOTABLE");
    }

    const waitlistedInterview = await (this.repo as any).findWaitlistedInterviewByApplication(applicationId);
    if (!waitlistedInterview) throw new AppError(400, "NOT_WAITLISTED");

    // I3 fix: atomically consume the waitlist Interview (WAITLIST → PASS) before offering.
    // If updateMany returns count=0, a concurrent request already consumed it → 409.
    // C1 fix: marks Interview as consumed so it no longer appears in waitlist queries.
    const consumed = await getPrisma().interview.updateMany({
      where: { id: waitlistedInterview.id, result: "WAITLIST" },
      data: { result: "PASS" },
    });
    if (consumed.count === 0) {
      throw new AppError(409, "WAITLIST_ALREADY_CONSUMED");
    }

    // Grill Q3 b1 — waitlist promote also routes through the 3-stage flow.
    // The applicant email is deferred to `hrApprove` (SJ6 side effect).
    const result = await this.beginOfferApproval(applicationId, actorId);

    void writeAuditLog({
      actorId,
      action: "APPLICATION_PROMOTED_FROM_WAITLIST",
      targetId: applicationId,
    }).catch(console.error);
    return result;
  }

  /**
   * closeSeason hook. Best-effort: 남은 모든 WAITLIST Interview 를 FAIL 처리 + 지원자 이메일 통보.
   */
  async expireAllWaitlists() {
    const findAll = (this.repo as any).findAllWaitlistedInterviews;
    const updateResult = (this.repo as any).updateInterviewResult;
    if (typeof findAll !== "function" || typeof updateResult !== "function") return;

    const allWaitlisted = await findAll.call(this.repo);
    for (const iv of allWaitlisted) {
      await updateResult.call(this.repo, iv.id, "FAIL");
      const app = await this.repo.findApplicationById(iv.applicationId);
      if (app?.email) {
        void sendApplicationStatusEmail(app.email, app.applicantName, "WAITLIST_EXPIRED").catch(console.error);
      }
    }
  }
}
