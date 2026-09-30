import { Router, Request, Response, NextFunction } from "express";
import { auth } from "../lib/authMiddleware";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import { getPrisma } from "../lib/prisma";
import { AppError } from "../lib/appError";
import { LedgerRepository } from "./ledger.repo";
import { LedgerService } from "./ledger.service";
import { LedgerController } from "./ledger.controller";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new LedgerRepository(getPrisma());
export const ledgerService = new LedgerService(repo);
const ctrl = new LedgerController(ledgerService);

const checkReadFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole, departmentCategories } = req.user!;
  if (!canReadFinance(role, frontOfficeRole, departmentCategories)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkWriteFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole, departmentCategories } = req.user!;
  if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkFinanceManager = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "GM" &&
      !(role === "FRONT_OFFICE" && frontOfficeRole === "FINANCE_MANAGER")) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
};

router.get("/", auth, checkReadFinance, ctrl.list);
router.post("/", auth, checkWriteFinance, ctrl.create);
router.post("/lock", auth, checkFinanceManager, ctrl.lockPeriod);
router.get("/:id", auth, checkReadFinance, ctrl.get);
router.post("/:id/refund", auth, checkWriteFinance, ctrl.refund);

export default router;
