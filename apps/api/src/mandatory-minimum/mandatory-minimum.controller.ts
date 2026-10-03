import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import type {
  MandatoryMinimumService,
  ProposeDto,
  ReviewDecision,
} from "./mandatory-minimum.service";
import type { MinimumEvidenceType } from "../generated/enums";

const isFinanceManager = (role: string, foRole: string | null | undefined): boolean =>
  role === "FRONT_OFFICE" && foRole === "FINANCE_MANAGER";

const isGM = (role: string): boolean => role === "GM";

const isSuperAdmin = (role: string): boolean => role === "SUPER_ADMIN";

const canReadHistory = (role: string, foRole: string | null | undefined): boolean =>
  isSuperAdmin(role) || isGM(role) || isFinanceManager(role, foRole);

const canReadPending = (role: string, foRole: string | null | undefined): boolean =>
  isGM(role) || isFinanceManager(role, foRole);

const parseIntParam = (req: Request, key: string, errCode: string): number => {
  const raw = req.params[key];
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) throw new AppError(400, errCode);
  return num;
};

const isValidEvidenceType = (v: unknown): v is MinimumEvidenceType =>
  v === "CONTRACT" || v === "LEGAL" || v === "FIXED_COST";

export class MandatoryMinimumController {
  constructor(private service: MandatoryMinimumService) {}

  // POST /budget-category-plans/:id/mandatory-minimum — FM only
  propose = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole } = requireUser(req);
      if (!isFinanceManager(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");

      const categoryPlanId = assertCuid(req.params["id"]);
      const body = req.body as Partial<{
        newAmount: number;
        evidenceType: string;
        evidenceUrl: string | null;
        reason: string;
        effectiveDate: string;
      }>;

      if (typeof body.newAmount !== "number") throw new AppError(400, "AMOUNT_MUST_BE_NON_NEGATIVE");
      if (!isValidEvidenceType(body.evidenceType)) throw new AppError(400, "INVALID_EVIDENCE_TYPE");
      if (typeof body.reason !== "string") throw new AppError(400, "REASON_REQUIRED");
      if (typeof body.effectiveDate !== "string" || body.effectiveDate.length === 0) {
        throw new AppError(400, "INVALID_EFFECTIVE_DATE");
      }
      const effectiveDate = new Date(body.effectiveDate);
      if (Number.isNaN(effectiveDate.getTime())) {
        throw new AppError(400, "INVALID_EFFECTIVE_DATE");
      }

      const dto: ProposeDto = {
        newAmount: body.newAmount,
        evidenceType: body.evidenceType,
        evidenceUrl: body.evidenceUrl ?? null,
        reason: body.reason,
        effectiveDate,
      };
      const log = await this.service.propose(categoryPlanId, dto, userId);
      res.status(201).json(log);
    } catch (err) {
      next(err);
    }
  };

  // POST /mandatory-minimum-changes/:id/review — GM only
  review = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role } = requireUser(req);
      if (!isGM(role)) throw new AppError(403, "FORBIDDEN");

      const logId = assertCuid(req.params["id"]);
      const body = req.body as Partial<{ decision: ReviewDecision; note: string }>;
      if (body.decision !== "APPROVED" && body.decision !== "REJECTED") {
        throw new AppError(400, "DECISION_MUST_BE_APPROVED_OR_REJECTED");
      }
      const updated = await this.service.review(logId, body.decision, body.note, userId);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  };

  // GET /budget-category-plans/:id/mandatory-minimum/history — FM/GM/SUPER_ADMIN read
  listHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canReadHistory(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");

      const categoryPlanId = assertCuid(req.params["id"]);
      const history = await this.service.listHistory(categoryPlanId, role, frontOfficeRole);
      res.status(200).json(history);
    } catch (err) {
      next(err);
    }
  };

  // GET /financial-reports/:seasonId/mandatory-minimum/pending — FM/GM read
  listPending = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canReadPending(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");

      const seasonId = parseIntParam(req, "seasonId", "INVALID_SEASON_ID");
      const pending = await this.service.listPending(seasonId, role, frontOfficeRole);
      res.status(200).json(pending);
    } catch (err) {
      next(err);
    }
  };
}
