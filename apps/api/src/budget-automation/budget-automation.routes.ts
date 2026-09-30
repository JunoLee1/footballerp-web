import { Router, type Request, type Response, type NextFunction } from "express";
import { auth } from "../lib/authMiddleware";
import { AppError } from "../lib/appError";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import { getPrisma } from "../lib/prisma";
import { BudgetAutomationRepository } from "./budget-automation.repo";
import { BudgetAutomationService } from "./budget-automation.service";
import type { BudgetPreviewRequestDto, BudgetApplyRequestDto } from "./dto/budget-automation.dto";
import { expenseCategoryService } from "../expense-category/expense-category.routes";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new BudgetAutomationRepository(getPrisma());
const service = new BudgetAutomationService(repo, expenseCategoryService);

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

router.post("/preview", auth, checkRead, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as BudgetPreviewRequestDto;
    if (!body.targetSeasonId) throw new AppError(400, "TARGET_SEASON_REQUIRED");
    if (!body.revenueGoal || !body.expenseGoal) throw new AppError(400, "GOAL_REQUIRED");
    const result = await service.preview(body);
    res.json(result);
  } catch (err) { next(err); }
});

router.post("/apply", auth, checkWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as BudgetApplyRequestDto;
    if (!body.targetSeasonId) throw new AppError(400, "TARGET_SEASON_REQUIRED");
    if (!body.revenueGoal || !body.expenseGoal) throw new AppError(400, "GOAL_REQUIRED");
    if (!body.name?.trim()) throw new AppError(400, "NAME_REQUIRED");
    const result = await service.apply({ ...body, name: body.name.trim() }, req.user!.id);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

export default router;
