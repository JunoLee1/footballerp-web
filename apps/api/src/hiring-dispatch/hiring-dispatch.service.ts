import crypto from "crypto";
import { PrismaClient } from "../generated/client";
import { EmployeeContractService } from "../employee-contract/employee-contract.service";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { encrypt } from "../lib/crypto";
import { hashPassword } from "../lib/hash";
import { isAdminLike } from "../lib/permissions";
import { cached } from "../lib/cache";
import type { HiringDocumentService } from "../hiring-document/hiring-document.service";
import { NotificationRepository } from "../notification/notification.repo";
import { HiringDispatchRepository } from "./hiring-dispatch.repo";
import { populateOnboardingTasks } from "./populate-onboarding-tasks";
import { provisionNewEmployeeAssets } from "./provision-assets";
import {
  BudgetReverifyDto,
  CreateHiringDispatchDto,
} from "./dto/hiring-dispatch.dto";

/**
 * 4-stage post-hiring dispatch workflow (자유수당 + 재검증 + 승인 + 실행).
 *
 * Flow:
 *   CREATED → BUDGET_REVERIFIED → DISPATCH_APPROVED → DISPATCHED → ONBOARDING → COMPLETED
 *      ↓            ↓                     ↓
 *   CANCELLED   REJECTED             REJECTED
 *
 * Stage owners (Q4):
 *   BUDGET_REVERIFIED  — FINANCE_MANAGER  (or isAdminLike)
 *   DISPATCH_APPROVED  — isAdminLike      (임원)
 *   DISPATCHED         — HR_MANAGER       (or isAdminLike)
 *
 * Every stage blocks self-approval (asset-request 교훈, Q4 lock).
 *
 * DISPATCHED wraps User + PhoneNumber + UserDepartment + StaffRecord + Onboarding
 * + status transition in a single `prisma.$transaction` so a partial failure
 * (e.g. email uniqueness collision surfacing late) cannot leave dangling rows.
 */
export class HiringDispatchService {
  constructor(
    private repo: HiringDispatchRepository,
    private notifRepo: NotificationRepository,
    private prisma: PrismaClient,
    // Both optional so existing tests that don't touch EXECUTION gates still
    // work without setup. Production wiring (hiring-dispatch.routes.ts) injects
    // both singletons. When undefined, the respective gate is skipped.
    private documentService?: HiringDocumentService,
    private employeeContractService?: EmployeeContractService,
  ) {}

  // ────────────────────────────────────────────
  // Read
  // ────────────────────────────────────────────

  async getById(id: string) {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError(404, "NOT_FOUND");
    return row;
  }

  async list(
    userId: string,
    role: string,
    filter?: "me" | "pending-budget" | "pending-dispatch" | "pending-execution" | "all",
    status?: string,
  ) {
    const asStatus = status as any;//TODO 타입 as ant 캐스팅 지우기
    const cacheKey = `hiring-dispatches:list:${userId}:${role}:${filter ?? ""}:${status ?? ""}`;
    switch (filter) {
      case "me":
        return this.repo.findByCreator(userId, asStatus);
      case "pending-budget":
        return cached(cacheKey, 30, () => this.repo.findPendingForBudget());
      case "pending-dispatch":
        return cached(cacheKey, 30, () => this.repo.findPendingForDispatch());
      case "pending-execution":
        return cached(cacheKey, 30, () => this.repo.findPendingForExecution());
      case "all":
        if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
        return this.repo.findAll(asStatus);
      default:
        return this.repo.findByCreator(userId, asStatus);
    }
  }

  // ────────────────────────────────────────────
  // Create
  // ────────────────────────────────────────────

  /**
   * HR creates a dispatch, either off an OFFERED Application (default path)
   * or free-form (임원 스카웃 / 계약직 즉시 채용).
   */
  async create(
    dto: CreateHiringDispatchDto,
    hrUserId: string,
    hrRole: string,
    hrFoRole: string | null | undefined,
  ) {
    // Required-field validation (Q5).
    const missingBasics =
      !dto.candidateName?.trim() ||
      !dto.candidateEmail?.trim() ||
      !dto.jobTitle?.trim() ||
      !dto.jobGrade ||
      !dto.employmentType ||
      !dto.departmentId ||
      !dto.startDate ||
      !dto.targetRole;
    if (missingBasics) throw new AppError(400, "MISSING_REQUIRED_FIELD");

    const salary = BigInt(dto.monthlySalary);
    if (salary < 0n) throw new AppError(400, "INVALID_SALARY");

    // Q2: applicationId is optional.
    if (dto.applicationId !== undefined) {
      const application = await this.prisma.jobApplication.findUnique({
        where: { id: dto.applicationId },
        select: { id: true, status: true },
      });
      if (!application) throw new AppError(400, "APPLICATION_NOT_FOUND");
      // Q2 default flow — Application must be OFFERED before it can be dispatched.
      if (application.status !== "OFFERED") throw new AppError(400, "APPLICATION_NOT_OFFERED");
    } else {
      // Q2 exception path — only HR (or admin-like) may open a dispatch
      // without an Application, since it bypasses the entire hiring pipeline.
      const canOpenFree =
        isAdminLike(hrRole) || (hrRole === "FRONT_OFFICE" && hrFoRole === "HR_MANAGER");
      if (!canOpenFree) throw new AppError(403, "HR_ONLY_FOR_FREE_FORM");
    }

    const created = await this.repo.create(dto, hrUserId);

    writeAuditLog({
      actorId: hrUserId,
      action: "HIRING_DISPATCH_CREATED",
      targetId: created.id,
      detail: {
        applicationId: dto.applicationId ?? null,
        departmentId: dto.departmentId,
        jobTitle: dto.jobTitle,
      },
    }).catch(console.error);

    // Finance reviewer needs to see the queue land immediately.
    void this.notifRepo
      .createForFinanceManager(
        "HIRING_DISPATCH_CREATED",
        (lang) => ({
          title:
            lang === "en"
              ? "Hiring Dispatch Awaiting Budget Reverification"
              : "발령 요청 예산 재검증 대기",
          body:
            lang === "en"
              ? `Hiring dispatch #${created.id} (${dto.candidateName}) awaits your reverification.`
              : `발령 요청 #${created.id} (${dto.candidateName}) 예산 재검증을 기다립니다.`,
        }),
        created.id,
      )
      .catch(console.error);

    return created;
  }

  // ────────────────────────────────────────────
  // Stage 1 — Budget reverification (FINANCE_MANAGER)
  // ────────────────────────────────────────────

  async budgetReverify(
    id: string,
    reviewerId: string,
    role: string,
    foRole: string | null | undefined,
    body: BudgetReverifyDto,
  ) {
    const dispatch = await this.repo.findById(id);
    if (!dispatch) throw new AppError(404, "NOT_FOUND");
    if (dispatch.status !== "CREATED") throw new AppError(400, "INVALID_STATUS");

    const canReverify =
      isAdminLike(role) || (role === "FRONT_OFFICE" && foRole === "FINANCE_MANAGER");
    if (!canReverify) throw new AppError(403, "NOT_FINANCE_MANAGER");
    if (dispatch.createdById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    // Q10 D: three checks. TO warning + Offer warning (both overridable);
    // department monthly labor-budget check is deferred (see TODO below).
    if (dispatch.applicationId != null) {
      // Q10-1: TO ceiling sourced from HiringPlanItem.headcount via the posting.
      const headcount =
        dispatch.application?.posting?.hiringPlanItem?.headcount ??
        dispatch.application?.posting?.headcount ??
        null;
      if (headcount != null) {
        const memberCount = await this.repo.countDeptMembers(dispatch.departmentId);
        if (memberCount + 1 > headcount && !body?.toOverride) {
          throw new AppError(400, "TO_EXCEEDED");
        }
      }

      // TODO(Q10 D 3): Offer mismatch — JobApplication has no `offeredSalary`
      // field today (only `offeredAt` / `offeredById`). Skip the mismatch
      // check until a salary field lands on Application, then compare
      // `dispatch.monthlySalary` vs `application.offeredSalary` and gate on
      // `body.offerMismatchOverride` the same way TO does.
    }
    // Application-free path skips both TO and offer checks (Q10-1: no
    // HiringPlanItem to reference; Q10 D 3: no Application offer to compare).

    // TODO(Q10 D 2): Department monthly labor-budget check. `Department`
    // has no `monthlyLaborBudget` field today, and BudgetLine is scoped to
    // ExpenseCategory not headcount. Deferring — a follow-up will add a
    // `HR_SALARY` BudgetLine mapping so we can hard-fail with 409
    // BUDGET_EXCEEDED here.

    // Atomic — approval row + status transition must commit together.
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.repo.addApproval(
        id,
        {
          stage: "BUDGET_REVIEW",
          action: "APPROVED",
          reviewerId,
          // Preserve the reviewer's override flags in the approval trail so an
          // audit can reconstruct why a TO-exceeded dispatch went through.
          reason:
            body && (body.toOverride || body.offerMismatchOverride)
              ? JSON.stringify(body)
              : null,
        },
        tx,
      );
      return this.repo.updateStatus(id, { status: "BUDGET_REVERIFIED" }, tx);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "HIRING_DISPATCH_BUDGET_REVERIFIED",
      targetId: id,
      detail: {
        toOverride: !!body?.toOverride,
        offerMismatchOverride: !!body?.offerMismatchOverride,
      },
    }).catch(console.error);

    // Notify the executive layer — Q4: DISPATCH_APPROVED owner = isAdminLike.
    void this.notifRepo
      .createForGM(
        "HIRING_DISPATCH_BUDGET_REVERIFIED",
        (lang) => ({
          title:
            lang === "en"
              ? "Hiring Dispatch Awaiting Executive Approval"
              : "발령 요청 임원 승인 대기",
          body:
            lang === "en"
              ? `Hiring dispatch #${id} (${dispatch.candidateName}) awaits your approval.`
              : `발령 요청 #${id} (${dispatch.candidateName}) 임원 승인을 기다립니다.`,
        }),
        id,
      )
      .catch(console.error);

    return updated;
  }

  async budgetReject(
    id: string,
    reviewerId: string,
    role: string,
    foRole: string | null | undefined,
    reason: string,
  ) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError(400, "REASON_REQUIRED");

    const dispatch = await this.repo.findById(id);
    if (!dispatch) throw new AppError(404, "NOT_FOUND");
    if (dispatch.status !== "CREATED") throw new AppError(400, "INVALID_STATUS");

    const canReverify =
      isAdminLike(role) || (role === "FRONT_OFFICE" && foRole === "FINANCE_MANAGER");
    if (!canReverify) throw new AppError(403, "NOT_FINANCE_MANAGER");
    if (dispatch.createdById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.repo.addApproval(
        id,
        { stage: "BUDGET_REVIEW", action: "REJECTED", reviewerId, reason: trimmed },
        tx,
      );
      return this.repo.updateStatus(id, { status: "REJECTED" }, tx);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "HIRING_DISPATCH_BUDGET_REJECTED",
      targetId: id,
      detail: { reason: trimmed },
    }).catch(console.error);

    // Q11-2 B: Application status stays OFFERED. We only notify the HR
    // requester so they can decide whether to resubmit.
    void this.notifRepo
      .createForUser(
        dispatch.createdById,
        "HIRING_DISPATCH_REJECTED",
        (lang) => ({
          title:
            lang === "en" ? "Hiring Dispatch Rejected (Budget)" : "발령 요청 예산 반려",
          body:
            lang === "en"
              ? `Hiring dispatch #${id} was rejected by finance: ${trimmed}`
              : `발령 요청 #${id}이 재무팀에 의해 반려됐습니다: ${trimmed}`,
        }),
        id,
      )
      .catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // Stage 2 — Dispatch approval (임원)
  // ────────────────────────────────────────────

  async dispatchApprove(id: string, reviewerId: string, role: string) {
    const dispatch = await this.repo.findById(id);
    if (!dispatch) throw new AppError(404, "NOT_FOUND");
    if (dispatch.status !== "BUDGET_REVERIFIED") throw new AppError(400, "INVALID_STATUS");
    if (!isAdminLike(role)) throw new AppError(403, "NOT_EXECUTIVE");
    if (dispatch.createdById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.repo.addApproval(
        id,
        { stage: "DISPATCH_APPROVAL", action: "APPROVED", reviewerId },
        tx,
      );
      return this.repo.updateStatus(id, { status: "DISPATCH_APPROVED" }, tx);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "HIRING_DISPATCH_DISPATCH_APPROVED",
      targetId: id,
    }).catch(console.error);

    // Notify HR — Stage 3 owner (Q4: HR_MANAGER).
    void this.notifRepo
      .createForHrManager(
        "HIRING_DISPATCH_DISPATCH_APPROVED",
        (lang) => ({
          title:
            lang === "en" ? "Hiring Dispatch Ready to Execute" : "발령 요청 실행 대기",
          body:
            lang === "en"
              ? `Hiring dispatch #${id} (${dispatch.candidateName}) is approved and ready to dispatch.`
              : `발령 요청 #${id} (${dispatch.candidateName}) 임원 승인 완료 — HR 실행 대기.`,
        }),
        id,
      )
      .catch(console.error);

    return updated;
  }

  async dispatchReject(id: string, reviewerId: string, role: string, reason: string) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError(400, "REASON_REQUIRED");

    const dispatch = await this.repo.findById(id);
    if (!dispatch) throw new AppError(404, "NOT_FOUND");
    if (dispatch.status !== "BUDGET_REVERIFIED") throw new AppError(400, "INVALID_STATUS");
    if (!isAdminLike(role)) throw new AppError(403, "NOT_EXECUTIVE");
    if (dispatch.createdById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.repo.addApproval(
        id,
        { stage: "DISPATCH_APPROVAL", action: "REJECTED", reviewerId, reason: trimmed },
        tx,
      );
      return this.repo.updateStatus(id, { status: "REJECTED" }, tx);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "HIRING_DISPATCH_DISPATCH_REJECTED",
      targetId: id,
      detail: { reason: trimmed },
    }).catch(console.error);

    void this.notifRepo
      .createForUser(
        dispatch.createdById,
        "HIRING_DISPATCH_REJECTED",
        (lang) => ({
          title:
            lang === "en"
              ? "Hiring Dispatch Rejected (Executive)"
              : "발령 요청 임원 반려",
          body:
            lang === "en"
              ? `Hiring dispatch #${id} was rejected by executive: ${trimmed}`
              : `발령 요청 #${id}이 임원에 의해 반려됐습니다: ${trimmed}`,
        }),
        id,
      )
      .catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // Stage 3 — Execution (HR): User + UserDepartment + StaffRecord + Onboarding
  // ────────────────────────────────────────────

  /**
   * HR executes the dispatch: provisions the User, department membership,
   * staff record, and onboarding row inside a single `$transaction`. Rolls
   * back atomically on any failure (email dup surfacing late, PII encryption,
   * etc.).
   */
  async dispatch(
    id: string,
    reviewerId: string,
    role: string,
    foRole: string | null | undefined,
  ) {
    const dispatch = await this.repo.findById(id);
    if (!dispatch) throw new AppError(404, "NOT_FOUND");
    if (dispatch.status !== "DISPATCH_APPROVED") throw new AppError(400, "INVALID_STATUS");

    const canDispatch =
      isAdminLike(role) || (role === "FRONT_OFFICE" && foRole === "HR_MANAGER");
    if (!canDispatch) throw new AppError(403, "NOT_HR_MANAGER");
    if (dispatch.createdById === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    // EXECUTION gates — each is a pure `await gate(x)` call so future gates
    // (task population #374, etc.) drop in the same shape. Order matters
    // only for the *first* failure message: docs → contract. Both raise 400
    // on failure and keep dispatch in DISPATCH_APPROVED so HR can fix
    // preconditions and re-hit /dispatch.
    //
    // #372 docs gate: latest row per (target, docType) must be APPROVED.
    await this.assertHiringDocsGate(dispatch);
    // #371 contract gate: latest non-CANCELLED EmployeeContract must be SIGNED.
    // Optional — skipped when `employeeContractService` isn't wired.
    if (this.employeeContractService) {
      await this.employeeContractService.assertContractSigned(dispatch.id);
    }

    // Fail fast on email collision before we start the tx — the User.email
    // unique index would raise inside the tx anyway, but pre-check gives a
    // clean error code without polluting the connection with a rollback.
    const existingUser = await this.repo.findUserByEmail(dispatch.candidateEmail);
    if (existingUser) throw new AppError(400, "EMAIL_ALREADY_IN_USE");

    // Generate the ephemeral password + OTP outside the tx. Both derive from
    // `crypto` which is deterministic in behavior but sync, so no risk of
    // holding the tx open.
    const tempPassword = crypto.randomUUID();
    const hashedPw = await hashPassword(tempPassword);
    const otpCode = crypto.randomUUID().slice(0, 6).toUpperCase();
    const otpExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // TODO: Spec has no candidate phoneNumber field — the User model demands
    // one (phoneNumberId is required + unique). We seed a placeholder that
    // the onboarding flow will let the candidate replace via `/onboarding`.
    // Follow-up: propagate candidatePhone through JobApplication → dispatch.
    const encPhone = encrypt("000-0000-0000");

    // Nickname is unique — collide on candidateName without a suffix would
    // block DISPATCHED for the second person named the same. Salt with the
    // dispatch id (unique) so uniqueness is guaranteed.
    const uniqueNickname = `${dispatch.candidateName}#${id}`;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. PhoneNumber first — User needs the FK.
      const phone = await this.repo.createPhoneNumber(
        { encrypted: encPhone.encrypted, iv: encPhone.iv },
        tx,
      );

      // 2. User with role / foRole / coachingRole from the dispatch target
      //    fields (Q6). Placeholder DOB + nationalityId; onboarding fills in.
      const user = await this.repo.createUser(
        {
          email: dispatch.candidateEmail,
          username: dispatch.candidateName,
          nickname: uniqueNickname,
          password: hashedPw,
          role: dispatch.targetRole,
          ...(dispatch.targetFrontOfficeRole !== null && {
            frontOfficeRole: dispatch.targetFrontOfficeRole,
          }),
          ...(dispatch.targetCoachingRole !== null && {
            coachingRole: dispatch.targetCoachingRole,
          }),
          phoneNumberId: phone.id,
          // TODO: nationalityId defaults to 1 (KR seed) — real onboarding
          // should collect this. Same follow-up as candidatePhone.
          nationalityId: 1,
          dateOfBirth: new Date("2000-01-01"),
        },
        tx,
      );

      // 3. UserDepartment (leaf dept membership, MEMBER by default).
      await this.repo.createUserDepartment(
        { userId: user.id, departmentId: dispatch.departmentId },
        tx,
      );

      // 4. StaffRecord — HR-facing employee row. `email` links back to the User.
      //    #375: seed probation tracking so the D-7 cron notifier can pick
      //    the record up for 3MO/6MO reminders to the dept head.
      await this.repo.createStaffRecord(
        {
          name: dispatch.candidateName,
          role: dispatch.jobTitle,
          email: dispatch.candidateEmail,
          departmentId: dispatch.departmentId,
          startDate: dispatch.startDate,
          createdById: reviewerId,
          probationStartedAt: new Date(),
          probationStatus: "IN_PROGRESS",
        },
        tx,
      );

      // 5. Onboarding (Q11-1 b: hiringDispatchId FK, applicationId stays null
      //    for Application-free path). OTP delivered by the notif fire below.
      const onboarding = await this.repo.createOnboarding(
        {
          hiringDispatchId: id,
          userId: user.id,
          otpCode,
          otpExpiresAt,
        },
        tx,
      );

      // 5b. Populate OnboardingTask rows from the Department's OnboardingTemplate
      //     (Q4 — must run inside the same tx so a template read failure rolls
      //     back the entire dispatch, keeping User/Onboarding consistent).
      //     Silent no-op when the Department has no template (backward-compat
      //     with pre-#374 dispatches).
      await populateOnboardingTasks(
        tx,
        onboarding.id,
        dispatch.departmentId,
        dispatch.startDate,
      );

      // 6. Approval + status transition. Set ONBOARDING as the final state
      //    (Q7: reuse existing Onboarding flow → COMPLETED comes later).
      await this.repo.addApproval(
        id,
        { stage: "EXECUTION", action: "APPROVED", reviewerId },
        tx,
      );
      return this.repo.updateStatus(
        id,
        { status: "ONBOARDING", createdUserId: user.id },
        tx,
      );
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "HIRING_DISPATCH_DISPATCHED",
      targetId: id,
      detail: {
        createdUserId: result.createdUserId,
        departmentId: dispatch.departmentId,
        targetRole: dispatch.targetRole,
      },
    }).catch(console.error);

    // Fire-and-forget notifs (Q9-C). Ordering doesn't matter — a notif
    // failure must not roll back the dispatch that just committed.

    // Team lead (신청 팀장) = department.headId.
    const leadId = dispatch.department.headId;
    if (leadId && leadId !== reviewerId) {
      void this.notifRepo
        .createForUser(
          leadId,
          "HIRING_DISPATCH_DISPATCHED",
          (lang) => ({
            title:
              lang === "en" ? "New Team Member Dispatched" : "새 팀원 발령 완료",
            body:
              lang === "en"
                ? `${dispatch.candidateName} has been dispatched to your team (dispatch #${id}).`
                : `${dispatch.candidateName}님이 팀에 발령됐습니다 (요청 #${id}).`,
          }),
          id,
        )
        .catch(console.error);
    }

    // HR — only when the requester wrote permissionNotes (Q9-B/C: manual
    // follow-up channel for 특정 권한 부여).
    if (dispatch.permissionNotes && dispatch.permissionNotes.trim()) {
      void this.notifRepo
        .createForHrManager(
          "HIRING_DISPATCH_PERMISSION_REQUESTED",
          (lang) => ({
            title:
              lang === "en"
                ? "Hiring Dispatch: Permission Follow-up Requested"
                : "발령: 특수 권한 부여 후속 요청",
            body:
              lang === "en"
                ? `Dispatch #${id} requires manual permission follow-up: ${dispatch.permissionNotes}`
                : `발령 #${id} 특수 권한 부여가 필요합니다: ${dispatch.permissionNotes}`,
          }),
          id,
        )
        .catch(console.error);
    }

    // Candidate (OTP email — placeholder notif; actual email delivery happens
    // when onboarding email flow lands, Task 5 or later).
    if (result.createdUserId) {
      void this.notifRepo
        .createForUser(
          result.createdUserId,
          "HIRING_DISPATCH_DISPATCHED",
          (lang) => ({
            title:
              lang === "en"
                ? "Welcome — Set Up Your Account"
                : "환영합니다 — 계정 설정을 완료해주세요",
            body:
              lang === "en"
                ? `Your account is ready. Use OTP ${otpCode} to complete onboarding within 7 days.`
                : `계정이 준비됐습니다. OTP ${otpCode}로 7일 이내에 온보딩을 완료해주세요.`,
          }),
          id,
        )
        .catch(console.error);
    }

    // Onboarding tasks populate notification (#374). Fire-and-forget: a
    // notification failure must never roll back a completed dispatch.
    // Counts tasks after the tx commits so we can include "X 개 태스크".
    if (result.createdUserId) {
      void this.notifyNewEmployeeTasksAssigned(id, result.createdUserId).catch(
        console.error,
      );
    }

    // Auto-provision default asset kit as DRAFT AssetRequests for the new
    // employee (#373). Fire-and-forget outside the dispatch tx (grill c1) —
    // any failure here (kit-lookup / draft create / notif) must not roll
    // back the dispatch that just committed. Runs even when createdUserId
    // is null (defensive) — the helper checks and returns early.
    void provisionNewEmployeeAssets(this.prisma, this.notifRepo, id).catch(
      (err) => console.error("[provisionNewEmployeeAssets] failed", err),
    );

    return result;
  }

  /**
   * Fire-and-forget notification (#374). Counts freshly-populated
   * OnboardingTask rows via a dispatch → onboarding → tasks join so we don't
   * need to pass the count from inside the tx. Silent no-op when 0 tasks
   * (Department has no template) — no notif surface for zero content.
   */
  private async notifyNewEmployeeTasksAssigned(
    dispatchId: string,
    newUserId: string,
  ): Promise<void> {
    const onboarding = await this.prisma.onboarding.findFirst({
      where: { hiringDispatchId: dispatchId },
      select: { id: true, _count: { select: { tasks: true } } },
    });
    const taskCount = onboarding?._count?.tasks ?? 0;
    if (taskCount === 0) return;
    await this.notifRepo.createForUser(
      newUserId,
      "ONBOARDING_TASKS_ASSIGNED",
      (lang) => ({
        title:
          lang === "en"
            ? "Onboarding Tasks Assigned"
            : "온보딩 태스크가 배정됐습니다",
        body:
          lang === "en"
            ? `You have ${taskCount} onboarding task(s) to complete.`
            : `완료해야 할 온보딩 태스크 ${taskCount}개가 있습니다.`,
      }),
      dispatchId,
    );
  }

  // ────────────────────────────────────────────
  // Cancel (HR, pre-execution only)
  // ────────────────────────────────────────────

  async cancel(
    id: string,
    userId: string,
    role: string,
    foRole: string | null | undefined,
    reason: string,
  ) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError(400, "REASON_REQUIRED");

    const dispatch = await this.repo.findById(id);
    if (!dispatch) throw new AppError(404, "NOT_FOUND");
    // Q11-3: cancel only in pre-execution states. Anything past
    // DISPATCH_APPROVED (approved but not yet dispatched) still cannot
    // cancel — a rollback there is out of scope for MVP.
    if (!["CREATED", "BUDGET_REVERIFIED"].includes(dispatch.status)) {
      throw new AppError(400, "INVALID_STATUS");
    }
    const canCancel =
      isAdminLike(role) || (role === "FRONT_OFFICE" && foRole === "HR_MANAGER");
    if (!canCancel) throw new AppError(403, "NOT_HR_MANAGER");

    const updated = await this.repo.updateStatus(id, { status: "CANCELLED" });

    writeAuditLog({
      actorId: userId,
      action: "HIRING_DISPATCH_CANCELLED",
      targetId: id,
      detail: { previousStatus: dispatch.status, reason: trimmed },
    }).catch(console.error);

    // Notify the requester (createdBy) — cancelation may be initiated by
    // another HR / admin, so the original requester needs to see it.
    if (dispatch.createdById !== userId) {
      void this.notifRepo
        .createForUser(
          dispatch.createdById,
          "HIRING_DISPATCH_CANCELLED",
          (lang) => ({
            title:
              lang === "en" ? "Hiring Dispatch Cancelled" : "발령 요청 취소",
            body:
              lang === "en"
                ? `Hiring dispatch #${id} was cancelled: ${trimmed}`
                : `발령 요청 #${id}이 취소됐습니다: ${trimmed}`,
          }),
          id,
        )
        .catch(console.error);
    }

    return updated;
  }

  // ────────────────────────────────────────────
  // Complete (post-onboarding)
  // ────────────────────────────────────────────

  /**
   * Manual completion endpoint. In practice, Onboarding.completedAt being
   * set should call this automatically (Task 5 or a follow-up onboarding
   * webhook); the API is exposed so HR / admin can force-close a lingering
   * dispatch when the candidate finishes onboarding through a legacy path.
   */
  async complete(
    id: string,
    userId: string,
    role: string,
    foRole: string | null | undefined,
  ) {
    const dispatch = await this.repo.findById(id);
    if (!dispatch) throw new AppError(404, "NOT_FOUND");
    if (dispatch.status !== "ONBOARDING") throw new AppError(400, "INVALID_STATUS");

    const canComplete =
      isAdminLike(role) || (role === "FRONT_OFFICE" && foRole === "HR_MANAGER");
    if (!canComplete) throw new AppError(403, "NOT_HR_MANAGER");

    const updated = await this.repo.updateStatus(id, { status: "COMPLETED" });

    writeAuditLog({
      actorId: userId,
      action: "HIRING_DISPATCH_COMPLETED",
      targetId: id,
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // EXECUTION gates (fix #372, then #371, #374)
  // ────────────────────────────────────────────

  /**
   * Delegates to `HiringDocumentService.assertRequiredDocsApproved` with the
   * right target + required list resolved from the dispatch row. Kept private
   * so it stays a single call-site helper — the sibling gates for #371/#374
   * will follow the exact same shape.
   *
   * Skip semantics: if the service isn't wired in (tests) we no-op rather
   * than throw. Production must always inject it (see hiring-dispatch.routes.ts).
   */
  private async assertHiringDocsGate(dispatch: {
    id: string;
    applicationId: string | null;
    requiredDocuments: string[];
    application: { posting: { requiredDocuments: string[] } | null } | null;
  }): Promise<void> {
    if (!this.documentService) return;
    const target =
      dispatch.applicationId != null
        ? { applicationId: dispatch.applicationId }
        : { hiringDispatchId: dispatch.id };
    // Application-anchored dispatches source the required list from the
    // parent JobPosting (Q3); Application-free dispatches carry it on the
    // dispatch row directly (Q10).
    const required =
      dispatch.applicationId != null
        ? dispatch.application?.posting?.requiredDocuments ?? []
        : dispatch.requiredDocuments;
    await this.documentService.assertRequiredDocsApproved(target, required);
  }
}
