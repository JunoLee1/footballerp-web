import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import { cached } from "../lib/cache";
import type { BudgetControlRepository } from "./budget-control.repo";
import type { CreateBudgetHeaderDto, UpdateBudgetHeaderDto, CreateBudgetLineDto, UpdateBudgetLineDto, CreateAdjustmentDto } from "./dto/budget-control.dto";
import type { ExpenseCategoryService } from "../expense-category/expense-category.service";

export class BudgetControlService {
  constructor(
    private repo: BudgetControlRepository,
    private categoryService: ExpenseCategoryService,
  ) {}

  async create(dto: CreateBudgetHeaderDto, createdById: number) {
    if (dto.totalBudget < 0) throw new AppError(400, "INVALID_BUDGET");
    const header = await this.repo.createHeader(dto, createdById);
    await writeAuditLog({ actorId: createdById, action: "BUDGET_CREATED", targetId: header.id });
    return header;
  }

  getAll(seasonId?: number) {
    const key = `budget-control:list:${seasonId ?? "null"}`;
    return cached(key, 30, () => this.repo.findAll(seasonId));
  }

  async getById(id: number) {
    const header = await this.repo.findById(id);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    return header;
  }

  async update(id: number, dto: UpdateBudgetHeaderDto) {
    const header = await this.repo.findById(id);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    if (header.status === "APPROVED" || header.status === "LOCKED")
      throw new AppError(400, "BUDGET_ALREADY_APPROVED");
    return this.repo.updateHeader(id, dto);
  }

  async submit(id: number, userId: number) {
    const header = await this.repo.findById(id);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    if (header.status === "APPROVED" || header.status === "LOCKED")
      throw new AppError(400, "BUDGET_ALREADY_APPROVED");
    if (header.totalBudget <= 0) throw new AppError(400, "BUDGET_AMOUNT_REQUIRED");
    return this.repo.updateStatus(id, "SUBMITTED");
  }

  async approve(id: number, approverId: number) {
    const header = await this.repo.findById(id);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    if (header.status !== "SUBMITTED") throw new AppError(400, "BUDGET_NOT_SUBMITTED");
    if (header.createdById === approverId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");
    const result = await this.repo.updateStatus(id, "APPROVED", approverId);
    await writeAuditLog({ actorId: approverId, action: "BUDGET_APPROVED", targetId: id });
    return result;
  }

  async getAvailableBudget(id: number) {
    const header = await this.repo.findById(id);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");

    const adjSums = await this.repo.sumApprovedAdjustments(id);
    const byType = Object.fromEntries(adjSums.map(r => [r.type, r._sum.amount ?? 0]));

    const approvedBudget = header.totalBudget;
    const carryover = byType["CARRYOVER"] ?? 0;
    const increase  = byType["INCREASE"]  ?? 0;
    const decrease  = byType["DECREASE"]  ?? 0;

    const { commitment, actual, byCategory } =
      await this.repo.sumCommitmentAndActual(header.seasonId);

    const available = approvedBudget + carryover + increase - decrease - commitment - actual;

    const lineBreakdown = header.lines.map((line: any) => {
      const cat = line.expenseCategory?.code ?? null;
      const spent = cat ? (byCategory[cat] ?? 0) : 0;
      return {
        id: line.id,
        category: cat,
        note: line.note,
        originalAmount: line.originalAmount,
        spent,
        remaining: line.originalAmount - spent,
      };
    });

    return {
      headerId: id,
      status: header.status,
      approvedBudget,
      carryover,
      increase,
      decrease,
      commitment,
      actual,
      available,
      lineBreakdown,
    };
  }

  async addLine(headerId: number, dto: CreateBudgetLineDto) {
    const header = await this.repo.findById(headerId);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    if (header.status === "APPROVED" || header.status === "LOCKED")
      throw new AppError(400, "BUDGET_ALREADY_APPROVED");
    if (!(await this.categoryService.isValidCode(dto.category))) {
      throw new AppError(400, "INVALID_CATEGORY");
    }
    const categoryId = await this.categoryService.resolveCategoryId(dto.category);
    return this.repo.createLine(headerId, { ...dto, categoryId });
  }

  async updateLine(headerId: number, lineId: number, dto: UpdateBudgetLineDto) {
    const header = await this.repo.findById(headerId);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    if (header.status === "APPROVED" || header.status === "LOCKED")
      throw new AppError(400, "BUDGET_ALREADY_APPROVED");
    const line = header.lines.find(l => l.id === lineId);
    if (!line) throw new AppError(404, "BUDGET_LINE_NOT_FOUND");
    return this.repo.updateLine(lineId, dto);
  }

  async deleteLine(headerId: number, lineId: number) {
    const header = await this.repo.findById(headerId);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    if (header.status === "APPROVED" || header.status === "LOCKED")
      throw new AppError(400, "BUDGET_ALREADY_APPROVED");
    const line = header.lines.find(l => l.id === lineId);
    if (!line) throw new AppError(404, "BUDGET_LINE_NOT_FOUND");
    return this.repo.deleteLine(lineId);
  }

  async requestAdjustment(headerId: number, dto: CreateAdjustmentDto, createdById: number) {
    const header = await this.repo.findById(headerId);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    if (header.status !== "APPROVED" && header.status !== "LOCKED")
      throw new AppError(400, "BUDGET_NOT_APPROVED");
    if (dto.amount <= 0) throw new AppError(400, "INVALID_ADJUSTMENT_AMOUNT");
    return this.repo.createAdjustment(headerId, dto, createdById);
  }

  async approveAdjustment(headerId: number, adjId: number, approverId: number) {
    const header = await this.repo.findById(headerId);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    const adj = header.adjustments.find(a => a.id === adjId);
    if (!adj) throw new AppError(404, "ADJUSTMENT_NOT_FOUND");
    if (adj.status !== "PENDING") throw new AppError(400, "ADJUSTMENT_NOT_PENDING");
    if (adj.createdById === approverId) throw new AppError(403, "SELF_APPROVAL_FORBIDDEN");
    const result = await this.repo.updateAdjustmentStatus(adjId, "APPROVED", approverId);
    await writeAuditLog({ actorId: approverId, action: "BUDGET_ADJUSTMENT_APPROVED", targetId: adjId, detail: { headerId } });
    return result;
  }

  async rejectAdjustment(headerId: number, adjId: number, approverId: number) {
    const header = await this.repo.findById(headerId);
    if (!header) throw new AppError(404, "BUDGET_NOT_FOUND");
    const adj = header.adjustments.find(a => a.id === adjId);
    if (!adj) throw new AppError(404, "ADJUSTMENT_NOT_FOUND");
    if (adj.status !== "PENDING") throw new AppError(400, "ADJUSTMENT_NOT_PENDING");
    const result = await this.repo.updateAdjustmentStatus(adjId, "REJECTED", approverId);
    await writeAuditLog({ actorId: approverId, action: "BUDGET_ADJUSTMENT_REJECTED", targetId: adjId, detail: { headerId } });
    return result;
  }
}
