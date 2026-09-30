import { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { isAdminLike } from "../lib/permissions";
import { cached } from "../lib/cache";
import { NotificationRepository } from "../notification/notification.repo";
import { OperatingExpenseRepository } from "../operating-expense/operating-expense.repo";
import { AssetRequestRepository } from "./asset-request.repo";
import { CreateAssetRequestDto } from "./dto/asset-request.dto";

/**
 * Two-stage department approval for asset requests.
 *
 * Flow:
 *   DRAFT → SUBMITTED → LEADER_APPROVED → APPROVED → FULFILLED
 *                ↓            ↓                  ↓
 *            CANCELLED  LEADER_REJECTED     REJECTED
 *
 * Leader = requester's leaf `Department.head` (팀장).
 * Dept-head = requester's leaf `Department.parent.head` (부서장).
 * At dept-head approve, an `OperatingExpense` (status=PENDING) is auto-created
 * against a matching APPROVED BudgetLine — dept-scoped first, then club-wide.
 * BUDGET_EXCEEDED propagates as 409 (Q5-2 Y).
 */
export class AssetRequestService {
  constructor(
    private repo: AssetRequestRepository,
    private expenseRepo: OperatingExpenseRepository,
    private notifRepo: NotificationRepository,
    private prisma: PrismaClient,
  ) {}

  // ────────────────────────────────────────────
  // Read
  // ────────────────────────────────────────────

  async getById(id: number, actorClubId?: number) {
    const request = await this.repo.findById(id, actorClubId);
    if (!request) throw new AppError(404, "NOT_FOUND");
    return request;
  }

  async list(
    userId: string,
    role: string,
    filter?: "me" | "pending-leader" | "pending-dept-head" | "all",
    status?: string,
    actorClubId?: number,
  ) {
    const asStatus = status as any;
    const cacheKey = `asset-requests:list:${userId}:${role}:${filter ?? ""}:${status ?? ""}:${actorClubId ?? "all"}`;
    switch (filter) {
      case "me":
        return cached(cacheKey, 30, () => this.repo.findByRequester(userId, asStatus, actorClubId));
      case "pending-leader":
        return cached(cacheKey, 30, () => this.repo.findPendingForLeader(userId, actorClubId));
      case "pending-dept-head":
        return cached(cacheKey, 30, () => this.repo.findPendingForDeptHead(userId, actorClubId));
      case "all":
        if (!isAdminLike(role)) throw new AppError(403, "FORBIDDEN");
        return cached(cacheKey, 30, () => this.repo.findAll(asStatus, actorClubId));
      default:
        return cached(cacheKey, 30, () => this.repo.findByRequester(userId, asStatus, actorClubId));
    }
  }

  // ────────────────────────────────────────────
  // Create
  // ────────────────────────────────────────────

  async create(dto: CreateAssetRequestDto, requesterId: string, actorClubId?: number) {
    // Payload alignment first — the hybrid rule (Q2-i c): exactly one of
    // equipmentItemId / softwareLicenseId / customName.
    const payloadKeys = [
      dto.equipmentItemId !== undefined ? "equipmentItemId" : null,
      dto.softwareLicenseId !== undefined ? "softwareLicenseId" : null,
      dto.customName !== undefined && dto.customName.trim() !== "" ? "customName" : null,
    ].filter((k): k is string => k !== null);
    if (payloadKeys.length !== 1) throw new AppError(400, "INVALID_PAYLOAD");

    // Type/master alignment: SOFTWARE ↔ softwareLicenseId only, HARDWARE ↔
    // equipmentItemId only. customName is allowed with either type.
    if (dto.type === "SOFTWARE" && dto.equipmentItemId !== undefined) {
      throw new AppError(400, "INVALID_PAYLOAD");
    }
    if (dto.type === "HARDWARE" && dto.softwareLicenseId !== undefined) {
      throw new AppError(400, "INVALID_PAYLOAD");
    }

    if (!Number.isFinite(dto.expectedAmount) || dto.expectedAmount <= 0) {
      throw new AppError(400, "INVALID_AMOUNT");
    }
    if (!dto.justification || dto.justification.trim() === "") {
      throw new AppError(400, "JUSTIFICATION_REQUIRED");
    }

    // Resolve requester's leaf department via UserDepartment.
    // Convention: MEMBER row = leaf. If a user belongs to multiple depts we take
    // the most recent membership (joinedAt desc). Admins without membership
    // cannot file — 400 tells the caller to have their dept lead add them.
    const membership = await this.prisma.userDepartment.findFirst({
      where: { userId: requesterId },
      orderBy: { joinedAt: "desc" },
      select: { departmentId: true },
    });
    if (!membership) throw new AppError(400, "NO_DEPARTMENT");

    return this.repo.create(dto, requesterId, membership.departmentId, actorClubId);
  }

  // ────────────────────────────────────────────
  // Requester actions
  // ────────────────────────────────────────────

  async submit(id: number, userId: string, actorClubId?: number) {
    const request = await this.repo.findById(id, actorClubId);
    if (!request) throw new AppError(404, "NOT_FOUND");
    if (request.requesterId !== userId) throw new AppError(403, "NOT_YOUR_REQUEST");
    if (request.status !== "DRAFT") throw new AppError(400, "INVALID_STATUS");

    const updated = await this.repo.updateStatus(id, { status: "SUBMITTED" });

    writeAuditLog({
      actorId: userId,
      action: "ASSET_REQUEST_SUBMITTED",
      targetId: id,
      detail: { type: request.type, expectedAmount: request.expectedAmount },
    }).catch(console.error);

    // Notify the leader (leaf dept.head).
    // Fire-and-forget: a notif insert failure must not roll back the caller
    // (the status change already committed). Matches injury/player-callup convention.
    const leaderId = request.department.headId;
    if (leaderId && leaderId !== userId) {
      void this.notifRepo.createForUser(
        leaderId,
        "ASSET_REQUEST_SUBMITTED",
        (lang) => ({
          title: lang === "en" ? "Asset Request Awaiting Your Approval" : "자산 신청 결재 대기",
          body:
            lang === "en"
              ? `Asset request #${id} for ₩${request.expectedAmount.toLocaleString()} awaits your approval.`
              : `자산 신청 #${id} (₩${request.expectedAmount.toLocaleString()})이 팀장 결재를 기다립니다.`,
        }),
        id,
      ).catch(console.error);
    }

    return updated;
  }

  async cancel(id: number, userId: string, actorClubId?: number) {
    const request = await this.repo.findById(id, actorClubId);
    if (!request) throw new AppError(404, "NOT_FOUND");
    if (request.requesterId !== userId) throw new AppError(403, "NOT_YOUR_REQUEST");
    // LEADER_APPROVED is considered committed downstream — cancellation would
    // strand the pending approval trail. Only DRAFT / SUBMITTED are cancellable.
    if (!["DRAFT", "SUBMITTED"].includes(request.status)) {
      throw new AppError(400, "INVALID_STATUS");
    }

    const updated = await this.repo.updateStatus(id, { status: "CANCELLED" });

    writeAuditLog({
      actorId: userId,
      action: "ASSET_REQUEST_CANCELLED",
      targetId: id,
      detail: { previousStatus: request.status },
    }).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // Leader (leaf dept.head) approvals
  // ────────────────────────────────────────────

  async leaderApprove(id: number, reviewerId: string, actorClubId?: number) {
    const request = await this.repo.findById(id, actorClubId);
    if (!request) throw new AppError(404, "NOT_FOUND");
    if (request.status !== "SUBMITTED") throw new AppError(400, "INVALID_STATUS");
    if (request.department.headId !== reviewerId) throw new AppError(403, "NOT_LEADER");
    if (request.requesterId === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    // Approval row + status transition must be atomic — a failed status update
    // must not leave an approval row hanging with no matching state change.
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.repo.addApproval(
        id,
        { stage: "LEADER", action: "APPROVED", reviewerId },
        tx,
      );
      return this.repo.updateStatus(id, { status: "LEADER_APPROVED" }, tx);
    });

    writeAuditLog({
      actorId: reviewerId,
      action: "ASSET_REQUEST_LEADER_APPROVED",
      targetId: id,
      detail: { requesterId: request.requesterId },
    }).catch(console.error);

    const deptHeadId = request.department.parent?.headId;
    if (deptHeadId && deptHeadId !== reviewerId) {
      // Fire-and-forget — notif failure must not roll back the caller.
      void this.notifRepo.createForUser(
        deptHeadId,
        "ASSET_REQUEST_LEADER_APPROVED",
        (lang) => ({
          title: lang === "en" ? "Asset Request Awaiting Dept-Head Approval" : "자산 신청 부서장 결재 대기",
          body:
            lang === "en"
              ? `Asset request #${id} for ₩${request.expectedAmount.toLocaleString()} awaits your approval.`
              : `자산 신청 #${id} (₩${request.expectedAmount.toLocaleString()})이 부서장 결재를 기다립니다.`,
        }),
        id,
      ).catch(console.error);
    }

    return updated;
  }

  async leaderReject(id: number, reviewerId: string, reason: string, actorClubId?: number) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError(400, "REASON_REQUIRED");

    const request = await this.repo.findById(id, actorClubId);
    if (!request) throw new AppError(404, "NOT_FOUND");
    if (request.status !== "SUBMITTED") throw new AppError(400, "INVALID_STATUS");
    if (request.department.headId !== reviewerId) throw new AppError(403, "NOT_LEADER");
    if (request.requesterId === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    await this.repo.addApproval(id, {
      stage: "LEADER",
      action: "REJECTED",
      reviewerId,
      reason: trimmed,
    });
    const updated = await this.repo.updateStatus(id, { status: "LEADER_REJECTED" });

    writeAuditLog({
      actorId: reviewerId,
      action: "ASSET_REQUEST_LEADER_REJECTED",
      targetId: id,
      detail: { reason: trimmed, requesterId: request.requesterId },
    }).catch(console.error);

    // Fire-and-forget — notif failure must not roll back the caller.
    void this.notifRepo.createForUser(
      request.requesterId,
      "ASSET_REQUEST_LEADER_REJECTED",
      (lang) => ({
        title: lang === "en" ? "Asset Request Rejected by Leader" : "자산 신청 팀장 반려",
        body:
          lang === "en"
            ? `Your asset request #${id} was rejected: ${trimmed}`
            : `자산 신청 #${id}이 팀장에 의해 반려됐습니다: ${trimmed}`,
      }),
      id,
    ).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // Dept-head (parent dept.head) approvals
  // ────────────────────────────────────────────

  async approve(id: number, reviewerId: string, actorClubId?: number) {
    const request = await this.repo.findById(id, actorClubId);
    if (!request) throw new AppError(404, "NOT_FOUND");
    if (request.status !== "LEADER_APPROVED") throw new AppError(400, "INVALID_STATUS");
    if (request.department.parent?.headId !== reviewerId) throw new AppError(403, "NOT_DEPT_HEAD");
    if (request.requesterId === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    // Active season is required — we bind the OperatingExpense to it.
    const season = await this.prisma.season.findFirst({ where: { status: "ACTIVE" } });
    if (!season) throw new AppError(400, "NO_ACTIVE_SEASON");

    // Auto-match BudgetLine (Q5-1 c): dept-scoped first, then club-wide.
    const now = new Date();
    let budgetLine = await this.expenseRepo.findBudgetLineForSeasonCategoryDept({
      seasonId: season.id,
      categoryId: request.expenseCategoryId,
      departmentId: request.departmentId,
      date: now,
    });
    if (!budgetLine) {
      budgetLine = await this.expenseRepo.findBudgetLineForSeasonCategoryDept({
        seasonId: season.id,
        categoryId: request.expenseCategoryId,
        departmentId: null,
        date: now,
      });
    }
    if (!budgetLine) throw new AppError(400, "BUDGET_LINE_NOT_FOUND");

    // Atomic block: OperatingExpense creation + approval row + status update
    // must all commit together. Without this, a failure between the expense
    // insert and the status update would leave a dangling OperatingExpense
    // with no AssetRequest pointer back to it. BUDGET_EXCEEDED and friends
    // still propagate as their mapped AppError codes.
    // NOTE: OperatingExpense.departmentId is a separate column (Task 2 addition)
    // but createWithBudgetCheck doesn't yet accept it — the department tag is
    // implicit via the BudgetLine.departmentId. Backfill left for a follow-up.
    let updated;
    let expense;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const createdExpense = await this.expenseRepo.createWithBudgetCheck(
          {
            seasonId: season.id,
            categoryId: request.expenseCategoryId,
            costType: "VARIABLE",
            amount: request.expectedAmount,
            date: now,
            note: `Asset request #${id}`,
            createdById: reviewerId,
            budgetLineId: budgetLine.id,
          },
          tx,
        );
        await this.repo.addApproval(
          id,
          { stage: "DEPT_HEAD", action: "APPROVED", reviewerId },
          tx,
        );
        const updatedRequest = await this.repo.updateStatus(
          id,
          { status: "APPROVED", operatingExpenseId: createdExpense.id },
          tx,
        );
        return { expense: createdExpense, updated: updatedRequest };
      });
      expense = result.expense;
      updated = result.updated;
    } catch (err: any) {
      if (err?.message === "BUDGET_EXCEEDED") throw new AppError(409, "BUDGET_EXCEEDED");
      if (err?.message === "BUDGET_LINE_NOT_FOUND") throw new AppError(400, "BUDGET_LINE_NOT_FOUND");
      if (err?.message === "CATEGORY_MISMATCH") throw new AppError(400, "CATEGORY_MISMATCH");
      throw err;
    }

    writeAuditLog({
      actorId: reviewerId,
      action: "ASSET_REQUEST_APPROVED",
      targetId: id,
      detail: {
        operatingExpenseId: expense.id,
        budgetLineId: budgetLine.id,
        amount: request.expectedAmount,
      },
    }).catch(console.error);

    // Notify finance (they will execute payment) + requester.
    // Fire-and-forget — the tx has committed; a notif failure must not 500 the caller.
    void this.notifRepo.createForFinanceStaff(
      "ASSET_REQUEST_APPROVED",
      (lang) => ({
        title: lang === "en" ? "Asset Request Approved (Payment Pending)" : "자산 신청 승인 (지급 대기)",
        body:
          lang === "en"
            ? `Asset request #${id} approved — ₩${request.expectedAmount.toLocaleString()} awaits payment.`
            : `자산 신청 #${id} 승인 완료. ₩${request.expectedAmount.toLocaleString()} 지급 대기 중입니다.`,
      }),
      id,
    ).catch(console.error);
    void this.notifRepo.createForUser(
      request.requesterId,
      "ASSET_REQUEST_APPROVED",
      (lang) => ({
        title: lang === "en" ? "Asset Request Approved" : "자산 신청 승인",
        body:
          lang === "en"
            ? `Your asset request #${id} for ₩${request.expectedAmount.toLocaleString()} has been approved.`
            : `자산 신청 #${id} (₩${request.expectedAmount.toLocaleString()})이 승인됐습니다.`,
      }),
      id,
    ).catch(console.error);

    return updated;
  }

  async reject(id: number, reviewerId: string, reason: string, actorClubId?: number) {
    const trimmed = reason?.trim();
    if (!trimmed) throw new AppError(400, "REASON_REQUIRED");

    const request = await this.repo.findById(id, actorClubId);
    if (!request) throw new AppError(404, "NOT_FOUND");
    if (request.status !== "LEADER_APPROVED") throw new AppError(400, "INVALID_STATUS");
    if (request.department.parent?.headId !== reviewerId) throw new AppError(403, "NOT_DEPT_HEAD");
    if (request.requesterId === reviewerId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    await this.repo.addApproval(id, {
      stage: "DEPT_HEAD",
      action: "REJECTED",
      reviewerId,
      reason: trimmed,
    });
    const updated = await this.repo.updateStatus(id, { status: "REJECTED" });

    writeAuditLog({
      actorId: reviewerId,
      action: "ASSET_REQUEST_REJECTED",
      targetId: id,
      detail: { reason: trimmed, requesterId: request.requesterId },
    }).catch(console.error);

    // Fire-and-forget — notif failure must not roll back the caller.
    void this.notifRepo.createForUser(
      request.requesterId,
      "ASSET_REQUEST_REJECTED",
      (lang) => ({
        title: lang === "en" ? "Asset Request Rejected" : "자산 신청 반려",
        body:
          lang === "en"
            ? `Your asset request #${id} was rejected: ${trimmed}`
            : `자산 신청 #${id}이 반려됐습니다: ${trimmed}`,
      }),
      id,
    ).catch(console.error);

    return updated;
  }

  // ────────────────────────────────────────────
  // Fulfillment (management)
  // ────────────────────────────────────────────

  /**
   * Marks the request as FULFILLED. Only APPROVED requests are eligible.
   *
   * Role gate (Q4 doesn't lock this): ADMIN-like OR the type-matched manager.
   *   - HARDWARE → EQUIPMENT_MANAGER
   *   - SOFTWARE → ASSET_MANAGER
   * Since no `canFulfillAsset` helper exists yet in permissions.ts, we inline
   * the check here. TODO: extract to permissions.ts once a second caller
   * appears (Task 5 or 6).
   *
   * If the request was custom (no master link) we create the corresponding
   * Equipment/SoftwareLicense record and link it back so the master catalog
   * reflects the newly-purchased asset.
   */
  async fulfill(
    id: number,
    userId: string,
    role: string,
    foRole: string | null | undefined,
    actorClubId?: number,
  ) {
    const request = await this.repo.findById(id, actorClubId);
    if (!request) throw new AppError(404, "NOT_FOUND");
    if (request.status !== "APPROVED") throw new AppError(400, "INVALID_STATUS");

    const isAdmin = isAdminLike(role);
    const isEquipmentMgr =
      role === "FRONT_OFFICE" && (foRole === "EQUIPMENT_MANAGER" || foRole === "ASSET_MANAGER");
    const isSoftwareMgr =
      role === "FRONT_OFFICE" && (foRole === "ASSET_MANAGER" || foRole === "ASSET_STAFF");

    if (!isAdmin) {
      if (request.type === "HARDWARE" && !isEquipmentMgr) throw new AppError(403, "FORBIDDEN");
      if (request.type === "SOFTWARE" && !isSoftwareMgr) throw new AppError(403, "FORBIDDEN");
    }

    // Custom payload → create master record and link back.
    if (request.customName && !request.equipmentItemId && !request.softwareLicenseId) {
      if (request.type === "HARDWARE") {
        const item = await this.prisma.equipmentItem.create({
          data: {
            name: request.customName,
            category: "OTHER",
            trackedIndividually: false,
            quantity: 1,
            // Phase 2.5: 신규 EquipmentItem 은 요청의 clubId 를 승계
            clubId: request.clubId ?? actorClubId ?? null,
          },
        });
        await this.repo.linkEquipmentItem(id, item.id);
      } else {
        const license = await this.prisma.softwareLicense.create({
          data: {
            name: request.customName,
            vendor: request.customDescription ?? "(unspecified)",
            totalSeats: 1,
            usedSeats: 0,
            createdById: userId,
          },
        });
        await this.repo.linkSoftwareLicense(id, license.id);
      }
    }

    const updated = await this.repo.updateStatus(id, { status: "FULFILLED" });

    writeAuditLog({
      actorId: userId,
      action: "ASSET_REQUEST_FULFILLED",
      targetId: id,
      detail: { type: request.type, requesterId: request.requesterId },
    }).catch(console.error);

    // Notify the requester that their asset is ready to collect / installed.
    // Fire-and-forget — status change already committed.
    if (request.requesterId !== userId) {
      void this.notifRepo.createForUser(
        request.requesterId,
        "ASSET_REQUEST_FULFILLED",
        (lang) => ({
          title: lang === "en" ? "Asset Request Fulfilled" : "자산 신청 지급 완료",
          body:
            lang === "en"
              ? `Your asset request #${id} has been fulfilled.`
              : `자산 신청 #${id}이 지급 완료 처리됐습니다.`,
        }),
        id,
      ).catch(console.error);
    }

    return updated;
  }
}
