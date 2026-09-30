import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { PlayerCallupController } from "./player-callup.controller";
import { PlayerCallupService } from "./player-callup.service";
import { PlayerCallupRepository } from "./player-callup.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new PlayerCallupRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const service = new PlayerCallupService(repo, notifRepo);
const controller = new PlayerCallupController(service);


router.get("/", auth, controller.getAll);
router.get("/:id", auth, controller.getById);
router.post("/", auth, controller.create);
router.patch("/:id/approve", auth, controller.approve);
router.patch("/:id/reject", auth, controller.reject);
router.patch("/:id/complete", auth, controller.complete);
router.patch("/:id/confirm-youth", auth, controller.confirmYouth);
router.patch("/:id/confirm-medical", auth, controller.confirmMedical);

export default router;
