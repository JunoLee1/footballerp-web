import { Router, Request, Response, NextFunction } from "express";
import { DepartmentReviewerConfigRepository } from "./department-review-config.repo";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { isAdminLike } from "../lib/permissions";
import { AppError } from "../lib/appError";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new DepartmentReviewerConfigRepository(prisma);

const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!isAdminLike(req.user!.role)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

// GET /department-review-configs?subjectDepartmentId=
router.get("/", auth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const subjectDepartmentId = Number(req.query["subjectDepartmentId"]);
    if (!subjectDepartmentId) {
      res.status(400).json({ message: "subjectDepartmentId is required" });
      return;
    }
    res.status(200).json(await repo.findBySubject(subjectDepartmentId));
  } catch (err) { next(err); }
});

// POST /department-review-configs
router.post("/", auth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subjectDepartmentId, reviewerDepartmentId } = req.body as {
      subjectDepartmentId: number;
      reviewerDepartmentId: number;
    };
    if (!subjectDepartmentId || !reviewerDepartmentId) {
      res.status(400).json({ message: "subjectDepartmentId and reviewerDepartmentId are required" });
      return;
    }
    res.status(201).json(await repo.create(subjectDepartmentId, reviewerDepartmentId));
  } catch (err) { next(err); }
});

// DELETE /department-review-configs/:id
router.delete("/:id", auth, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await repo.delete(Number(req.params["id"]));
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
