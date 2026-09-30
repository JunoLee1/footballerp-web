import { AppError } from "../lib/appError";
import { OperatingExpenseRepository } from "./operating-expense.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { ExpenseCategoryService } from "../expense-category/expense-category.service";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import { cached } from "../lib/cache";
import type { CreateOperatingExpenseDto, UpdateOperatingExpenseDto } from "./dto/operating-expense.dto";

export const APPROVAL_THRESHOLD = 1_000_000;

export class OperatingExpenseService {
  constructor(
    private repo: OperatingExpenseRepository,
    private notifRepo: NotificationRepository,
    private categoryService: ExpenseCategoryService,
  ) {}

  async list(seasonId: number, actorClubId?: number | null) {
    const key = `operating-expenses:list:${seasonId}:${actorClubId ?? "null"}`;
    return cached(key, 30, async () => {
      const rows = await this.repo.findBySeasonId(seasonId, actorClubId);
      // categoryId is NOT NULL post-cutover, so expenseCategory relation is always present.
      return rows.map((r) => ({
        ...r,
        category: r.expenseCategory.code,
        budgetLine: r.budgetLine
          ? {
              ...r.budgetLine,
              category: r.budgetLine.expenseCategory.code,
            }
          : r.budgetLine,
      }));
    });
  }

  async create(data: CreateOperatingExpenseDto) {
    if (data.amount <= 0) throw new AppError(400, "INVALID_AMOUNT");
    if (!(await this.categoryService.isValidCode(data.category))) {
      throw new AppError(400, "INVALID_CATEGORY");
    }
    const categoryId = await this.categoryService.resolveCategoryId(data.category);

    // Resolve budget line: caller may pass an explicit id, otherwise auto-match by
    // (season, category). If exactly one line matches, use it. Zero → 400 asks the
    // planner to create the line; more than one → 400 asks the caller to disambiguate
    // (typically by picking the department-scoped line in the UI).
    let budgetLineId = data.budgetLineId;
    if (budgetLineId === undefined) {
      const candidates = await this.repo.findBudgetLinesForSeasonCategory(data.seasonId, categoryId);
      if (candidates.length === 0) throw new AppError(400, "BUDGET_LINE_NOT_FOUND");
      if (candidates.length > 1) throw new AppError(400, "BUDGET_LINE_AMBIGUOUS");
      budgetLineId = candidates[0]!.id;
    } else {
      const line = await this.repo.findBudgetLine(budgetLineId);
      if (!line) throw new AppError(404, "BUDGET_LINE_NOT_FOUND");
    }

    let expense;
    try {
      expense = await this.repo.createWithBudgetCheck({
        seasonId: data.seasonId,
        categoryId,
        ...(data.costType && { costType: data.costType }),
        amount: data.amount,
        date: new Date(data.date),
        note: data.note ?? null,
        createdById: data.createdById,
        budgetLineId,
        clubId: data.actorClubId ?? null,
      });
    } catch (err: any) {
      if (err.message === "BUDGET_EXCEEDED") throw new AppError(409, "BUDGET_EXCEEDED");
      if (err.message === "CATEGORY_MISMATCH") throw new AppError(400, "CATEGORY_MISMATCH");
      if (err.message === "BUDGET_LINE_NOT_FOUND") throw new AppError(404, "BUDGET_LINE_NOT_FOUND");
      throw err;
    }

    const categoryCode = expense.expenseCategory.code;
    await this.notifRepo.createForFinanceStaff(
      "EXPENSE_PENDING",
      (lang) => ({
        title: lang === "en" ? "New Expense Request" : "지출 기안 접수",
        body: lang === "en"
          ? `₩${expense.amount.toLocaleString()} ${categoryCode} expense pending approval.`
          : `₩${expense.amount.toLocaleString()} ${categoryCode} 지출 기안이 결재 대기 중입니다.`,
      }),
      expense.id,
    );

    return expense;
  }

  async firstApprove(id: number, approverId: string, role: string, foRole: string | null | undefined, departmentCategories?: string[], actorClubId?: number | null) {
    if (!canReadFinance(role, foRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
    const expense = await this.repo.findById(id, actorClubId);
    if (!expense || expense.deletedAt) throw new AppError(404, "NOT_FOUND");
    if (expense.status !== "PENDING") throw new AppError(400, "INVALID_STATUS");
    if (expense.amount < APPROVAL_THRESHOLD) throw new AppError(400, "USE_SINGLE_STAGE_APPROVE");
    if (expense.createdById === approverId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const updated = await this.repo.updateStatus(id, {
      status: "FIRST_APPROVED",
      firstApprovedById: approverId,
      firstApprovedAt: new Date(),
    });

    const categoryCode = expense.expenseCategory.code;
    await this.notifRepo.createForFinanceManager(
      "EXPENSE_FIRST_APPROVED",
      (lang) => ({
        title: lang === "en" ? "Expense Awaiting Final Approval" : "지출 기안 최종 결재 대기",
        body: lang === "en"
          ? `₩${expense.amount.toLocaleString()} ${categoryCode} expense requires your approval.`
          : `₩${expense.amount.toLocaleString()} ${categoryCode} 기안이 최종 결재를 기다립니다.`,
      }),
      expense.id,
    );
    return updated;
  }

  async approve(id: number, approverId: string, role: string, foRole: string | null | undefined, departmentCategories?: string[], actorClubId?: number | null) {
    const expense = await this.repo.findById(id, actorClubId);
    if (!expense || expense.deletedAt) throw new AppError(404, "NOT_FOUND");

    if (expense.amount < APPROVAL_THRESHOLD) {
      if (!canReadFinance(role, foRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      if (expense.status !== "PENDING") throw new AppError(400, "INVALID_STATUS");
    } else {
      if (!canWriteFinance(role, foRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      if (expense.status !== "FIRST_APPROVED") throw new AppError(400, "REQUIRES_FIRST_APPROVAL");
    }

    if (expense.createdById === approverId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");

    const updated = await this.repo.updateStatus(id, {
      status: "APPROVED",
      approvedById: approverId,
      approvedAt: new Date(),
    });

    const categoryCode = expense.expenseCategory.code;
    await this.notifRepo.createForUser(
      expense.createdById,
      "EXPENSE_APPROVED",
      (lang) => ({
        title: lang === "en" ? "Expense Approved" : "지출 기안 승인",
        body: lang === "en"
          ? `Your ₩${expense.amount.toLocaleString()} ${categoryCode} expense has been approved.`
          : `₩${expense.amount.toLocaleString()} ${categoryCode} 지출 기안이 승인됐습니다.`,
      }),
      expense.id,
    );
    return updated;
  }

  async reject(id: number, rejectorId: string, reason: string, role: string, foRole: string | null | undefined, departmentCategories?: string[], actorClubId?: number | null) {
    if (!canReadFinance(role, foRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
    const expense = await this.repo.findById(id, actorClubId);
    if (!expense || expense.deletedAt) throw new AppError(404, "NOT_FOUND");
    if (!["PENDING", "FIRST_APPROVED"].includes(expense.status)) throw new AppError(400, "INVALID_STATUS");

    const updated = await this.repo.updateStatus(id, {
      status: "REJECTED",
      rejectedById: rejectorId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    });

    await this.notifRepo.createForUser(
      expense.createdById,
      "EXPENSE_REJECTED",
      (lang) => ({
        title: lang === "en" ? "Expense Rejected" : "지출 기안 반려",
        body: lang === "en"
          ? `Your expense was rejected: ${reason}`
          : `지출 기안이 반려됐습니다: ${reason}`,
      }),
      expense.id,
    );
    return updated;
  }

  async cancel(id: number, cancellerId: string, reason: string, role: string, foRole: string | null | undefined, departmentCategories?: string[], actorClubId?: number | null) {
    const expense = await this.repo.findById(id, actorClubId);
    if (!expense || expense.deletedAt) throw new AppError(404, "NOT_FOUND");
    if (expense.status !== "APPROVED") throw new AppError(400, "INVALID_STATUS");

    const isSelf = expense.createdById === cancellerId;
    const isManager = canWriteFinance(role, foRole, departmentCategories);
    if (!isSelf && !isManager) throw new AppError(403, "FORBIDDEN");

    const updated = await this.repo.updateStatus(id, {
      status: "CANCELLED",
      cancelledById: cancellerId,
      cancelledAt: new Date(),
      cancellationReason: reason,
    });

    await this.notifRepo.createForUser(
      expense.createdById,
      "EXPENSE_CANCELLED",
      (lang) => ({
        title: lang === "en" ? "Expense Cancelled" : "지출 기안 취소",
        body: lang === "en"
          ? `Expense of ₩${expense.amount.toLocaleString()} has been cancelled.`
          : `₩${expense.amount.toLocaleString()} 지출 기안이 취소됐습니다.`,
      }),
      expense.id,
    );
    return updated;
  }

  async markPaid(id: number, paidById: string, actorClubId?: number | null) {
    const expense = await this.repo.findById(id, actorClubId);
    if (!expense || expense.deletedAt) throw new AppError(404, "NOT_FOUND");
    if (expense.status !== "APPROVED") throw new AppError(400, "INVALID_STATUS");

    const updated = await this.repo.updateStatus(id, {
      status: "PAID",
      paidAt: new Date(),
      paidById,
    });

    const categoryCode = expense.expenseCategory.code;
    await this.notifRepo.createForUser(
      expense.createdById,
      "EXPENSE_PAID",
      (lang) => ({
        title: lang === "en" ? "Expense Paid" : "지출 지급 완료",
        body: lang === "en"
          ? `₩${expense.amount.toLocaleString()} ${categoryCode} expense has been paid.`
          : `₩${expense.amount.toLocaleString()} ${categoryCode} 지출이 지급됐습니다.`,
      }),
      expense.id,
    );
    return updated;
  }

  async update(id: number, userId: string, data: UpdateOperatingExpenseDto, actorClubId?: number | null) {
    const expense = await this.repo.findById(id, actorClubId);
    if (!expense || expense.deletedAt) throw new AppError(404, "NOT_FOUND");
    if (expense.paidAt) throw new AppError(409, "ALREADY_PAID");
    if (expense.createdById !== userId) throw new AppError(403, "FORBIDDEN");

    const newAmount = data.amount ?? expense.amount;
    if (newAmount <= 0) throw new AppError(400, "INVALID_AMOUNT");

    if (data.category !== undefined && !(await this.categoryService.isValidCode(data.category))) {
      throw new AppError(400, "INVALID_CATEGORY");
    }

    const newCategoryId = data.category !== undefined
      ? await this.categoryService.resolveCategoryId(data.category)
      : expense.categoryId;

    if (data.amount !== undefined && data.amount > expense.amount) {
      const plan = await this.repo.findBudgetPlan(expense.seasonId, newCategoryId);
      if (!plan) throw new AppError(400, "BUDGET_PLAN_NOT_FOUND");
      const ceiling = plan.mandatoryMinimum + (plan.knapsackAllocated ?? 0);
      const currentSpend = await this.repo.sumSpendBySeasonAndCategory(expense.seasonId, newCategoryId);
      const additional = data.amount - expense.amount;
      if (currentSpend + additional > ceiling) throw new AppError(400, "BUDGET_EXCEEDED");
    }

    const payload: { amount?: number; categoryId?: number; note?: string } = {};
    if (data.amount !== undefined) payload.amount = data.amount;
    if (data.category !== undefined) {
      payload.categoryId = newCategoryId;
    }
    if (data.note !== undefined) payload.note = data.note;

    return this.repo.update(id, payload);
  }

  async delete(id: number, requesterId: string, requesterRole: string, reason: string, actorClubId?: number | null) {
    const expense = await this.repo.findById(id, actorClubId);
    if (!expense) throw new AppError(404, "NOT_FOUND");
    if (expense.deletedAt) throw new AppError(404, "NOT_FOUND");
    if (expense.status !== "PENDING") throw new AppError(400, "ONLY_PENDING_DELETABLE");
    if (expense.createdById !== requesterId && requesterRole !== "ADMIN") throw new AppError(403, "FORBIDDEN");
    return this.repo.softDelete(id, reason);
  }

  purgeExpired() {
    return this.repo.purgeExpired();
  }
}
