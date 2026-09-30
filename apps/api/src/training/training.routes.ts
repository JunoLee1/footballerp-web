import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { TrainingController } from "./training.controller";
import { TrainingService } from "./training.service";
import { TrainingRepository } from "./training.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new TrainingRepository(getPrisma());
const notifRepo = new NotificationRepository(getPrisma());
const service = new TrainingService(repo, notifRepo);
const controller = new TrainingController(service);


router.get("/", auth, controller.getSessions);
router.get("/results", auth, controller.getResults);
router.get("/results/:resultId", auth, controller.getResultById);
router.get("/:id", auth, controller.getSessionById);
router.post("/", auth, controller.createSession);
router.patch("/:id/approve", auth, controller.approveSession);
router.post("/:id/contents", auth, controller.addContent);
router.post("/:id/participants", auth, controller.addParticipants);
router.put("/:id/results", auth, controller.upsertResult);
router.patch("/results/:resultId/correct", auth, controller.correctAttendance);

export default router;
