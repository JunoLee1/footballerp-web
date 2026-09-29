import { auth } from "../lib/authMiddleware";
import { Router, Request, Response, NextFunction } from "express";
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

// #584: PLAYER self-scope 지원 — role-guard 통과 못하면 본인 리소스인지 검사.
// role 이 PLAYER 이거나 unlinked user 도 self-check 로 들어와야 함 (관리자면 이미 통과).
type SelfCheck = (req: Request, userId: number) => Promise<boolean>;
const guardOrSelf = (
  perm: (role: string, coachingRole?: string | null, deptCategories?: string[]) => boolean,
  selfCheck: SelfCheck,
) => async (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user!;
  if (perm(user.role, user.coachingRole, user.departmentCategories)) return next();
  try {
    if (await selfCheck(req, user.id)) return next();
  } catch (err) {
    return next(err);
  }
  next(new AppError(403, "FORBIDDEN"));
};

const selfByInjuryId: SelfCheck = (req, uid) =>
  service.isSelfOwnedInjury(Number(req.params["id"]), uid);
const selfByPlayerId: SelfCheck = (req, uid) =>
  service.isSelfOwnedPlayer(String(req.params["playerId"]), uid);


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
router.get("/player/:playerId", auth,
  guardOrSelf(canReadActiveInjury, selfByPlayerId),
  controller.getByPlayer);
router.get("/:id", auth,
  guardOrSelf(canReadActiveInjury, selfByInjuryId),
  controller.getById);
router.post("/", auth, controller.create);
router.patch("/:id/status", auth, controller.updateStatus);
router.get("/:id/report", auth,
  guardOrSelf(canReadInjuryReport, selfByInjuryId),
  controller.getReport);
router.put("/:id/report", auth, (req, res, next) => {
  const user = req.user!;
  if (!canReadInjuryReport(user.role, user.coachingRole, user.departmentCategories)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
}, controller.saveReport);
router.post("/:id/report/sign", auth, controller.signReport);
router.delete("/:id/report/sign", auth, controller.unsignReport);

// #575 (medical GDPR) + #584 (PLAYER self-scope)
router.get("/:id/assessment", auth,
  guardOrSelf(canReadInjuryReport, selfByInjuryId),
  controller.getAssessment);
router.put("/:id/assessment", auth, controller.processAssessment);

router.get("/:id/external-reports", auth,
  guardOrSelf(canReadInjuryReport, selfByInjuryId),
  controller.getExternalReports);
router.patch("/:id/external-reports/:reportId/status", auth, controller.updateExternalReportStatus);

export default router;
