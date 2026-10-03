import { Router, Request, Response, NextFunction } from "express";
import { PlanReviewRepository } from "./plan-review.repo";
import { PlanReviewService } from "./plan-review.service";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { assertCuid } from "../lib/cuidGuard";

const router = Router();
const prisma = getPrisma();
const repo = new PlanReviewRepository(prisma);
const service = new PlanReviewService(repo, prisma);

// GET /plan-reviews/:planId — 계획서의 모든 검토 레코드 반환
router.get("/:planId", auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json(await service.list(assertCuid(req.params["planId"])));
  } catch (err) { next(err); }
});

// POST /plan-reviews/:planId/confirm — 검토 확인
router.post("/:planId/confirm", auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { comment } = req.body as { comment?: string };
    res.status(200).json(
      await service.confirm(assertCuid(req.params["planId"]), req.user!.id, comment)
    );
  } catch (err) { next(err); }
});

// PATCH /plan-reviews/:planId/reviewer/:reviewerDeptId/reject — 검토 거절 (Y5)
router.patch("/:planId/reviewer/:reviewerDeptId/reject", auth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason?.trim()) return res.status(400).json({ code: "REASON_REQUIRED" });
    res.json(
      await service.reject(
        assertCuid(req.params["planId"]),
        assertCuid(req.params["reviewerDeptId"]),
        req.user!.id,
        reason,
      )
    );
  } catch (err) { next(err); }
});

export default router;
