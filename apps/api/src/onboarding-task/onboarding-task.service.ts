import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { canWriteHR } from "../lib/permissions";
import type { NotificationRepository } from "../notification/notification.repo";
import type { SkipOnboardingTaskDto } from "./dto/skip.dto";
import type { VerifyOnboardingTaskDto } from "./dto/verify.dto";
import type { OnboardingTaskRepository } from "./onboarding-task.repo";

const MAX_VERIFY_NOTES = 2000;
const MAX_SKIP_REASON = 500;

/**
 * OnboardingTask state machine (Q3):
 *   PENDING  →  DONE           (self-report, requiresVerification=false)
 *   PENDING  →  SELF_REPORTED  (self-report, requiresVerification=true)
 *   SELF_REPORTED → DONE       (HR/dept.head verify APPROVE)
 *   SELF_REPORTED → PENDING    (HR/dept.head verify REJECT — verifyNotes required)
 *   PENDING or SELF_REPORTED → SKIPPED  (optional=true only, skipReason required)
 *
 * Self-verify is blocked — trainee cannot promote their own SELF_REPORTED
 * row to DONE (Q6, matches asset-request self-approval lock).
 *
 * Completion hook: after every DONE / SKIPPED transition, the service checks
 * whether every non-optional task is terminal. If so, `Onboarding.contentCompletedAt`
 * is set atomically (idempotent — safe under concurrent verifies).
 */
export class OnboardingTaskService {
  constructor(
    private repo: OnboardingTaskRepository,
    private notifRepo: NotificationRepository,
    private prisma: PrismaClient,
  ) {}

  // ────────────────────────────────────────────
  // Reads
  // ────────────────────────────────────────────

  list(onboardingId: string) {
    return this.repo.findByOnboardingId(onboardingId);
  }

  verifyQueue(filter?: { departmentId?: string }) {
    return this.repo.findVerifyQueue(filter);
  }

  // ────────────────────────────────────────────
  // selfReport — trainee marks task done
  // ────────────────────────────────────────────

  async selfReport(taskId: string, actorId: string) {
    const task = await this.repo.findById(taskId);
    if (!task) throw new AppError(404, "TASK_NOT_FOUND");

    if (task.onboarding.userId !== actorId) {
      throw new AppError(403, "NOT_TASK_OWNER");
    }
    if (task.status !== "PENDING") {
      throw new AppError(409, "INVALID_STATE_TRANSITION");
    }

    // Two-branch: requiresVerification decides whether trainee's self-report
    // is terminal (DONE) or triggers a review round (SELF_REPORTED).
    const nextStatus = task.requiresVerification ? "SELF_REPORTED" : "DONE";
    const updated = await this.repo.updateStatus(taskId, {
      status: nextStatus,
      selfReportedAt: new Date(),
    });

    void writeAuditLog({
      actorId,
      action: task.requiresVerification
        ? "ONBOARDING_TASK_SELF_REPORTED"
        : "ONBOARDING_TASK_DONE_BY_TRAINEE",
      targetId: taskId,
      detail: { onboardingId: task.onboardingId, requiresVerification: task.requiresVerification },
    }).catch(console.error);

    if (nextStatus === "SELF_REPORTED") {
      // Fire-and-forget — HR / dept.head verify request notification.
      void this.notifyVerifyRequested(task).catch(console.error);
    } else {
      // Immediate DONE — trigger completion hook.
      void this.checkContentCompletion(task.onboardingId).catch(console.error);
    }
    return updated;
  }

  // ────────────────────────────────────────────
  // verify — HR/dept.head reviews SELF_REPORTED
  // ────────────────────────────────────────────

  async verify(
    taskId: string,
    dto: VerifyOnboardingTaskDto,
    actorId: string,
    actorRole: string,
    actorFoRole: string | null | undefined,
    actorDeptCategories?: string[],
  ) {
    if (dto.action !== "APPROVE" && dto.action !== "REJECT") {
      throw new AppError(400, "INVALID_VERIFY_ACTION");
    }
    const notes = dto.verifyNotes?.trim() ?? "";
    if (dto.action === "REJECT" && notes.length === 0) {
      throw new AppError(400, "VERIFY_NOTES_REQUIRED");
    }
    if (notes.length > MAX_VERIFY_NOTES) {
      throw new AppError(400, "VERIFY_NOTES_TOO_LONG");
    }

    const task = await this.repo.findById(taskId);
    if (!task) throw new AppError(404, "TASK_NOT_FOUND");

    // Self-verify block — trainee cannot approve their own report (Q6).
    if (task.onboarding.userId === actorId) {
      throw new AppError(403, "CANNOT_SELF_VERIFY");
    }
    if (task.status !== "SELF_REPORTED") {
      throw new AppError(409, "INVALID_STATE_TRANSITION");
    }

    // Verifier gate: HR write OR the department's head. Kept in the service
    // (not the controller) because we need the task row to resolve the
    // department, and duplicating that lookup would race under load.
    const deptHeadId = task.onboarding.hiringDispatch?.department?.headId ?? null;
    const isDeptHead = deptHeadId != null && deptHeadId === actorId;
    if (!isDeptHead && !canWriteHR(actorRole, actorFoRole, actorDeptCategories)) {
      throw new AppError(403, "NOT_VERIFIER");
    }

    const nextStatus = dto.action === "APPROVE" ? "DONE" : "PENDING";
    const updated = await this.repo.updateStatus(taskId, {
      status: nextStatus,
      verifiedById: actorId,
      verifiedAt: new Date(),
      // On REJECT keep the reason; on APPROVE either notes or null.
      verifyNotes: notes || null,
    });

    void writeAuditLog({
      actorId,
      action: dto.action === "APPROVE" ? "ONBOARDING_TASK_APPROVED" : "ONBOARDING_TASK_REJECTED",
      targetId: taskId,
      detail: { onboardingId: task.onboardingId, verifyNotes: notes || null },
    }).catch(console.error);

    // Trainee always gets the outcome — approve or reject.
    void this.notifyVerifyResult(task, dto.action, notes || null).catch(console.error);

    if (nextStatus === "DONE") {
      void this.checkContentCompletion(task.onboardingId).catch(console.error);
    }
    return updated;
  }

  // ────────────────────────────────────────────
  // skip — optional-only, self or HR
  // ────────────────────────────────────────────

  async skip(
    taskId: string,
    dto: SkipOnboardingTaskDto,
    actorId: string,
    actorRole: string,
    actorFoRole: string | null | undefined,
    actorDeptCategories?: string[],
  ) {
    const reason = dto.skipReason?.trim() ?? "";
    if (!reason) throw new AppError(400, "SKIP_REASON_REQUIRED");
    if (reason.length > MAX_SKIP_REASON) throw new AppError(400, "SKIP_REASON_TOO_LONG");

    const task = await this.repo.findById(taskId);
    if (!task) throw new AppError(404, "TASK_NOT_FOUND");
    if (!task.optional) throw new AppError(400, "TASK_NOT_OPTIONAL");

    const isOwner = task.onboarding.userId === actorId;
    const deptHeadId = task.onboarding.hiringDispatch?.department?.headId ?? null;
    const isDeptHead = deptHeadId != null && deptHeadId === actorId;
    const isHR = canWriteHR(actorRole, actorFoRole, actorDeptCategories);
    if (!isOwner && !isHR && !isDeptHead) {
      throw new AppError(403, "NOT_AUTHORIZED");
    }
    if (task.status === "DONE" || task.status === "SKIPPED") {
      throw new AppError(409, "ALREADY_TERMINAL");
    }

    const updated = await this.repo.updateStatus(taskId, {
      status: "SKIPPED",
      skipReason: reason,
    });

    void writeAuditLog({
      actorId,
      action: "ONBOARDING_TASK_SKIPPED",
      targetId: taskId,
      detail: { onboardingId: task.onboardingId, skipReason: reason, byOwner: isOwner },
    }).catch(console.error);

    void this.checkContentCompletion(task.onboardingId).catch(console.error);
    return updated;
  }

  // ────────────────────────────────────────────
  // Completion hook — fire-and-forget from every terminal transition
  // ────────────────────────────────────────────

  /**
   * Check whether every non-optional task is terminal (DONE / SKIPPED).
   * When zero incompletes remain, atomically set
   * `Onboarding.contentCompletedAt` (idempotent — race-safe via updateMany
   * with a null guard) and fire the completion notification.
   *
   * Kept public so it can be re-invoked from admin repair paths (e.g. a
   * task manually re-opened and re-DONE) without duplicating the guard.
   */
  async checkContentCompletion(onboardingId: string): Promise<void> {
    const incompleteRequired = await this.repo.countIncompleteRequired(onboardingId);
    if (incompleteRequired > 0) return;

    const updated = await this.repo.setContentCompletedIfNull(onboardingId);
    if (!updated) return; // already set — no duplicate notif
    void this.notifyContentCompleted(updated).catch(console.error);
  }

  // ────────────────────────────────────────────
  // Notification helpers (Q7-B — 4 notif types)
  // ────────────────────────────────────────────

  private async notifyVerifyRequested(task: { id: string; title: string; onboardingId: string; onboarding: { hiringDispatch: { id: string; departmentId: string; department: { headId: string | null } } | null } }): Promise<void> {
    const dispatchId = task.onboarding.hiringDispatch?.id ?? task.onboardingId;
    const deptHeadId = task.onboarding.hiringDispatch?.department?.headId ?? null;
    const msg = (lang?: string) => ({
      title:
        lang === "en"
          ? "Onboarding Task Awaiting Verification"
          : "온보딩 태스크 검증 대기",
      body:
        lang === "en"
          ? `Task "${task.title}" was self-reported and needs your review.`
          : `"${task.title}" 태스크가 자체 완료 보고됐습니다. 검증을 진행해주세요.`,
    });

    // HR managers always get it; dept.head gets a targeted copy when set.
    await this.notifRepo.createForHrManager(
      "ONBOARDING_TASK_VERIFY_REQUESTED",
      msg,
      dispatchId,
    );
    if (deptHeadId != null) {
      await this.notifRepo.createForUser(
        deptHeadId,
        "ONBOARDING_TASK_VERIFY_REQUESTED",
        msg,
        dispatchId,
      );
    }
  }

  private async notifyVerifyResult(
    task: { id: string; title: string; onboardingId: string; onboarding: { userId: string | null; hiringDispatch: { id: string } | null } },
    action: "APPROVE" | "REJECT",
    notes: string | null,
  ): Promise<void> {
    const traineeId = task.onboarding.userId;
    if (traineeId == null) return;
    const dispatchId = task.onboarding.hiringDispatch?.id ?? task.onboardingId;
    const type = action === "APPROVE" ? "ONBOARDING_TASK_VERIFIED" : "ONBOARDING_TASK_REJECTED";
    await this.notifRepo.createForUser(
      traineeId,
      type,
      (lang) => ({
        title:
          action === "APPROVE"
            ? lang === "en"
              ? "Onboarding Task Approved"
              : "온보딩 태스크 승인됨"
            : lang === "en"
              ? "Onboarding Task Rejected"
              : "온보딩 태스크 반려됨",
        body:
          action === "APPROVE"
            ? lang === "en"
              ? `"${task.title}" was approved.`
              : `"${task.title}" 태스크가 승인됐습니다.`
            : lang === "en"
              ? `"${task.title}" was rejected: ${notes ?? ""}`
              : `"${task.title}" 태스크가 반려됐습니다: ${notes ?? ""}`,
      }),
      dispatchId,
    );
  }

  private async notifyContentCompleted(onboarding: {
    id: string;
    userId: string | null;
    hiringDispatch: { id: string; department: { headId: string | null } | null } | null;
  }): Promise<void> {
    const dispatchId = onboarding.hiringDispatch?.id ?? onboarding.id;
    const msg = (lang?: string) => ({
      title:
        lang === "en"
          ? "Onboarding Content Completed"
          : "온보딩 컨텐츠 완료",
      body:
        lang === "en"
          ? "All required onboarding tasks are complete."
          : "필수 온보딩 태스크가 모두 완료됐습니다.",
    });

    // Trainee, HR, dept.head each get their own row.
    if (onboarding.userId != null) {
      await this.notifRepo.createForUser(
        onboarding.userId,
        "ONBOARDING_CONTENT_COMPLETED",
        msg,
        dispatchId,
      );
    }
    await this.notifRepo.createForHrManager(
      "ONBOARDING_CONTENT_COMPLETED",
      msg,
      dispatchId,
    );
    const deptHeadId = onboarding.hiringDispatch?.department?.headId ?? null;
    if (deptHeadId != null) {
      await this.notifRepo.createForUser(
        deptHeadId,
        "ONBOARDING_CONTENT_COMPLETED",
        msg,
        dispatchId,
      );
    }
  }
}
