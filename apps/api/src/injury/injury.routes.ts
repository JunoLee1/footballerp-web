import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { InjuryController } from "./injury.controller";
import { InjuryService } from "./injury.service";
import { InjuryRepository } from "./injury.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { TrainingLoadRepository } from "../training-load/training-load.repo";
import { getPrisma } from "../lib/prisma";
import { canReadActiveInjury, canReadInjuryReport } from "../lib/permissions";
import { AppError } from "../lib/appError";

const router = Router();
const prisma = getPrisma();
const repo = new InjuryRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const loadRepo = new TrainingLoadRepository(prisma);
const service = new InjuryService(repo, notifRepo, loadRepo);
const controller = new InjuryController(service);


router.get("/stats", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadInjuryReport(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.getStats);
router.get("/active", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadActiveInjury(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.getActive);
router.get("/player/:playerId", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadActiveInjury(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.getByPlayer);
router.get("/:id", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadActiveInjury(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.getById);
router.post("/", auth, controller.create);
router.patch("/:id/status", auth, controller.updateStatus);
router.get("/:id/report", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadInjuryReport(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.getReport);
router.put("/:id/report", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadInjuryReport(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.saveReport);
router.post("/:id/report/sign", auth, controller.signReport);
router.delete("/:id/report/sign", auth, controller.unsignReport);

// Assessment (issue #575 · GDPR — 의무팀·감독진·관리자만)
router.get("/:id/assessment", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadInjuryReport(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.getAssessment);
router.put("/:id/assessment", auth, controller.processAssessment);

// External Reports (issue #575)
router.get("/:id/external-reports", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadInjuryReport(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.getExternalReports);
router.patch("/:id/external-reports/:reportId/status", auth, controller.updateExternalReportStatus);

export default router;
