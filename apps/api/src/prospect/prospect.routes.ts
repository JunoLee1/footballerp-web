import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { ProspectController } from "./prospect.controller";
import { ProspectService } from "./prospect.service";
import { ProspectRepository } from "./prospect.repo";
import { VideoAnalysisController } from "./video-analysis.controller";
import { VideoAnalysisService } from "./video-analysis.service";
import { getPrisma } from "../lib/prisma";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";


const router = Router();
const repo = new ProspectRepository(getPrisma());
const service = new ProspectService(repo);
const controller = new ProspectController(service);
const videoAnalysisService = new VideoAnalysisService(getPrisma());
const videoAnalysisController = new VideoAnalysisController(videoAnalysisService);

// #582: acquisition-gate-check 는 스카우팅·감독진·관리자 전용.
// canReadProspect 는 role === 'FRONT_OFFICE' 를 통째로 허용하여 HR/ASSET/FACILITY 도 통과 → 별도 좁은 helper.
const requireAcquisitionAccess = (req: Request, _res: Response, next: NextFunction) => {
  const user = req.user!;
  const role = user.role;
  const foRole = user.frontOfficeRole;
  const coachingRole = user.coachingRole;
  const deptCats = user.departmentCategories ?? [];
  const allowed =
    isAdminLike(role) ||
    (role === "FRONT_OFFICE" && (foRole === "TD" || foRole === "SCOUT")) ||
    (role === "COACHING_STAFF" && coachingRole === "HEAD_COACH") ||
    deptCats.includes("SCOUTING");
  if (!allowed) return next(new AppError(403, "FORBIDDEN"));
  next();
};

router.get("/check-duplicate", auth, controller.checkDuplicate);
router.get("/shortlist-capacity", auth, controller.getShortlistCapacity);
router.get("/", auth, controller.list);
router.post("/", auth, controller.create);
router.get("/:id", auth, controller.getById);
router.patch("/:id/status", auth, controller.updateStatus);
router.post("/:id/sign", auth, controller.sign);
router.patch("/:id/medical", auth, controller.recordMedicalResult);
router.get("/:id/negotiation-logs", auth, controller.getNegotiationLogs);
router.post("/:id/negotiation-logs", auth, controller.addNegotiationLog);
router.get("/:id/video-evaluations", auth, controller.getVideoEvaluations);
router.post("/:id/video-evaluations", auth, controller.addVideoEvaluation);
router.patch("/:id/video-evaluations/:evalId", auth, controller.updateVideoEvaluation);
router.post("/:prospectId/video-analysis", auth, videoAnalysisController.createJob);
router.get("/:prospectId/video-analysis/:jobId", auth, videoAnalysisController.getJob);
router.get("/:id/evaluation-logs", auth, controller.getEvaluationLogs);
router.post("/:id/evaluation-logs", auth, controller.addEvaluationLog);
router.get("/:id/acquisition-gate-check", auth, requireAcquisitionAccess, controller.checkAcquisitionGate);
router.patch("/:id", auth, controller.update);

export default router;
