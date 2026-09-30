import { Router, type Request, type Response, type NextFunction } from "express";
import { auth } from "../lib/authMiddleware";
import { AppError } from "../lib/appError";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import { getPrisma } from "../lib/prisma";
import { BudgetControlRepository } from "./budget-control.repo";
import { BudgetControlService } from "./budget-control.service";
import { BudgetControlController } from "./budget-control.controller";
import { expenseCategoryService } from "../expense-category/expense-category.routes";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new BudgetControlRepository(getPrisma());
const service = new BudgetControlService(repo, expenseCategoryService);
const controller = new BudgetControlController(service);

const checkRead = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canReadFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkWrite = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canWriteFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

router.get("/",                                auth, checkRead,  controller.getAll);
router.post("/",                               auth, checkWrite, controller.create);
router.get("/:id",                             auth, checkRead,  controller.getById);
router.patch("/:id",                           auth, checkWrite, controller.update);
router.get("/:id/available",                   auth, checkRead,  controller.getAvailableBudget);
router.post("/:id/submit",                     auth, checkWrite, controller.submit);
router.post("/:id/approve",                    auth, checkWrite, controller.approve);
router.post("/:id/lines",                      auth, checkWrite, controller.addLine);
router.patch("/:id/lines/:lineId",             auth, checkWrite, controller.updateLine);
router.delete("/:id/lines/:lineId",            auth, checkWrite, controller.deleteLine);
router.post("/:id/adjustments",                auth, checkWrite, controller.requestAdjustment);
router.post("/:id/adjustments/:adjId/approve", auth, checkWrite, controller.approveAdjustment);
router.post("/:id/adjustments/:adjId/reject",  auth, checkWrite, controller.rejectAdjustment);

export default router;
