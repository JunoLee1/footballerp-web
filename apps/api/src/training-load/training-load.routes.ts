import { auth } from "../lib/authMiddleware";
import { Router, Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike, canReadInjuryReport, canManageTD } from "../lib/permissions";
import { TrainingLoadController } from "./training-load.controller";
import { TrainingLoadService } from "./training-load.service";
import { TrainingLoadRepository } from "./training-load.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new TrainingLoadRepository(getPrisma());
const notifRepo = new NotificationRepository(getPrisma());
const service = new TrainingLoadService(repo, notifRepo);
const controller = new TrainingLoadController(service);

const checkTrainingRead = (req: Request, _res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (isAdminLike(role) || role === "COACHING_STAFF" || canManageTD(role, frontOfficeRole)) return next();
  next(new AppError(403, "FORBIDDEN"));
};

const checkTrainingWrite = (req: Request, _res: Response, next: NextFunction) => {
  const { role } = req.user!;
  if (isAdminLike(role) || role === "COACHING_STAFF") return next();
  next(new AppError(403, "FORBIDDEN"));
};

const checkMedicalRead = (req: Request, _res: Response, next: NextFunction) => {
  const { role, coachingRole, departmentCategories } = req.user!;
  if (canReadInjuryReport(role, coachingRole, departmentCategories)) return next();
  next(new AppError(403, "FORBIDDEN"));
};

router.get("/", auth, checkTrainingRead, controller.getAll);
router.get("/weekly-summary", auth, checkTrainingRead, controller.getWeeklySummary);
router.get("/anomalies", auth, checkTrainingRead, controller.getAnomalies);
router.get("/injury-correlation/:playerId", auth, checkMedicalRead, controller.getInjuryCorrelation);
router.get("/growth-trajectory/:playerId", auth, checkTrainingRead, controller.getGrowthTrajectory);
router.get("/acute-chronic/:playerId", auth, checkTrainingRead, controller.getAcuteChronicRatio);
router.post("/", auth, checkTrainingWrite, controller.upsert);

export default router;
