import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { canWriteFinance, isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import type {
  BudgetOverrideService,
  ListOverrideLogsQuery,
  OverrideRequestDto,
} from "./override.service";

/**
 * #444: 목록 조회 read gate.
 * FM (FRONT_OFFICE + FINANCE_MANAGER) / GM / ADMIN / SUPER_ADMIN 만 전 시즌 로그 조회 가능.
 * 팀장/부서장의 본인 스코프 로그 조회는 후속 이슈 (scope 매칭이 category → BudgetCategoryPlan
 * → FinancialReport.seasonId 조인 필요) — MVP 는 403.
 */
const canListOverrideLogs = (role: string, foRole: string | null | undefined): boolean =>
  isAdminLike(role) || (role === "FRONT_OFFICE" && foRole === "FINANCE_MANAGER");

export class BudgetOverrideController {
  constructor(private service: BudgetOverrideService) {}

  requestOverride = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId } = requireUser(req);
      const seasonId = Number(req.params["seasonId"]);
      const body = req.body as Partial<OverrideRequestDto>;
      if (typeof body.categoryId !== "string" || body.categoryId.length === 0) throw new AppError(400, "INVALID_CATEGORY_ID");
      if (!Number.isInteger(body.amount)) throw new AppError(400, "INVALID_AMOUNT");
      if (typeof body.reason !== "string") throw new AppError(400, "REASON_REQUIRED");
      const result = await this.service.requestOverride(seasonId, userId, {
        categoryId: body.categoryId,
        amount: body.amount!,
        reason: body.reason,
      });
      res.status(201).json(result);
    } catch (err) { next(err); }
  };

  review = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id: userId } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const logId = assertCuid(req.params["id"]);
      const body = req.body as { decision?: "APPROVED" | "REJECTED"; note?: string };
      if (body.decision !== "APPROVED" && body.decision !== "REJECTED") {
        throw new AppError(400, "DECISION_MUST_BE_APPROVED_OR_REJECTED");
      }
      await this.service.reviewOverride(logId, userId, body.decision, body.note);
      res.status(204).end();
    } catch (err) { next(err); }
  };

  /**
   * GET /financial-reports/:seasonId/override-logs
   * Query: status? (PENDING|APPROVED|REJECTED), limit? (default 50, max 200), cursor? (id, DESC)
   * FM/GM/ADMIN 만 접근. FE FinanceManagerReview 의 `usePendingOverrideLogs` hook 이 소비.
   */
  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canListOverrideLogs(role, frontOfficeRole)) {
        throw new AppError(403, "FORBIDDEN");
      }
      const seasonId = Number(req.params["seasonId"]);
      if (!Number.isInteger(seasonId) || seasonId <= 0) {
        throw new AppError(400, "INVALID_SEASON_ID");
      }

      const q = req.query as { status?: string; limit?: string; cursor?: string };
      const query: ListOverrideLogsQuery = {};
      if (q.status !== undefined) {
        if (q.status !== "PENDING" && q.status !== "APPROVED" && q.status !== "REJECTED") {
          throw new AppError(400, "INVALID_STATUS");
        }
        query.status = q.status;
      }
      if (q.limit !== undefined) {
        const n = Number(q.limit);
        if (!Number.isInteger(n) || n <= 0) throw new AppError(400, "INVALID_LIMIT");
        if (n > 200) throw new AppError(400, "LIMIT_EXCEEDS_MAX");
        query.limit = n;
      }
      if (q.cursor !== undefined) {
        if (typeof q.cursor !== "string" || q.cursor.length === 0) throw new AppError(400, "INVALID_CURSOR");
        query.cursor = q.cursor;
      }

      const logs = await this.service.list(seasonId, query);
      res.status(200).json(logs);
    } catch (err) {
      next(err);
    }
  };
}
