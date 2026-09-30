import { Router, Request, Response, NextFunction } from "express";
import { auth } from "../lib/authMiddleware";
import { canReadFinance, isAdminLike } from "../lib/permissions";
import { getPrisma } from "../lib/prisma";
import { AppError } from "../lib/appError";
import { AccountCodeRepository } from "./account-code.repo";
import type { AccountCodeType } from "../generated/client";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new AccountCodeRepository(getPrisma());

const checkReadFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canReadFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkAdminOnly = (req: Request, res: Response, next: NextFunction) => {
  const { role } = req.user!;
  if (!isAdminLike(role)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

// GET /account-codes — canReadFinance
router.get("/", auth, checkReadFinance, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await repo.findAll();
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /account-codes — ADMIN/SUPER_ADMIN only
router.post("/", auth, checkAdminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, name, type } = req.body;
    if (!code || !name || !type) return next(new AppError(400, "MISSING_FIELDS"));
    const item = await repo.create({ code, name, type: type as AccountCodeType });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// PUT /account-codes/:id — ADMIN/SUPER_ADMIN only
router.put("/:id", auth, checkAdminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params["id"]);
    const { name, type } = req.body;
    const item = await repo.update(id, {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type: type as AccountCodeType }),
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// DELETE /account-codes/:id — ADMIN/SUPER_ADMIN only
router.delete("/:id", auth, checkAdminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params["id"]);
    await repo.delete(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as accountCodeRouter };
