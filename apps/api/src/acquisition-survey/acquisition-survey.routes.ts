import { Router, Request, Response, NextFunction } from "express";
import { auth } from "../lib/authMiddleware";
import { AppError } from "../lib/appError";
import { AcquisitionSurveyController } from "./acquisition-survey.controller";
import { AcquisitionSurveyService } from "./acquisition-survey.service";
import { AcquisitionSurveyRepository } from "./acquisition-survey.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new AcquisitionSurveyRepository(getPrisma());
const service = new AcquisitionSurveyService(repo);
const controller = new AcquisitionSurveyController(service);

const canCreate = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user!;
  const allowed =
    user.role === "GM" ||
    (user.role === "FRONT_OFFICE" && user.frontOfficeRole === "TD");
  if (!allowed) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const canClose = canCreate;

router.get("/", auth, controller.list);
router.post("/", auth, canCreate, controller.create);
router.get("/:id", auth, controller.getById);
router.patch("/:id/close", auth, canClose, controller.close);
router.post("/:id/responses", auth, controller.submitResponse);
router.get("/:id/responses", auth, controller.getResponses);

export default router;
