import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import multer from "multer";
import { gcsUpload } from "../lib/gcs";
import { ReportController } from "./report.controller";
import { ReportService } from "./report.service";
import { ReportRepository } from "./report.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";
import { isAdminLike } from "../lib/permissions";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { intIdRouter } from "../lib/idParamGuard";
import { assertCuid } from "../lib/cuidGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new ReportRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const service = new ReportService(repo, notifRepo);
const controller = new ReportController(service);

const storage = multer.memoryStorage();

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

function requireHeadOfDept(deptIdParam: string) {
  return async (req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) => {
    try {
      const user = requireUser(req);
      if (isAdminLike(user.role) || user.role === "GM") return next();
      const deptId = assertCuid(req.params[deptIdParam]);
      const dept = await prisma.department.findUnique({ where: { id: deptId }, select: { headId: true } });
      if (!dept || dept.headId !== user.id) throw new AppError(403, "NOT_DEPT_HEAD");
      next();
    } catch (err) {
      next(err);
    }
  };
}

function requireAdmin(req: import("express").Request, _res: import("express").Response, next: import("express").NextFunction) {
  try {
    const user = requireUser(req);
    if (!isAdminLike(user.role)) throw new AppError(403, "FORBIDDEN");
    next();
  } catch (err) {
    next(err);
  }
}

router.get("/", auth, controller.list);
router.post("/", auth, upload.single("file"), gcsUpload("reports"), controller.create);

// Admin: ReviewRuleSet CRUD — must be before /:id to avoid param collision
router.get("/rule-sets", auth, requireAdmin, controller.listRuleSets);
router.post("/rule-sets", auth, requireAdmin, controller.createRuleSet);
router.delete("/rule-sets/:ruleId", auth, requireAdmin, controller.deleteRuleSet);

router.get("/:id", auth, controller.get);
router.patch("/:id", auth, upload.single("file"), gcsUpload("reports"), controller.update);
router.post("/:id/submit", auth, controller.submit);
router.post("/:id/approve", auth, controller.approve);
router.post("/:id/reject", auth, controller.reject);

// Department review actions — dept head only
router.post("/:id/reviews/:deptId/confirm", auth, requireHeadOfDept("deptId"), controller.confirmReview);
router.post("/:id/reviews/:deptId/reject", auth, requireHeadOfDept("deptId"), controller.rejectReview);

export default router;
