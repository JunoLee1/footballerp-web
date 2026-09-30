import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { NotificationController } from "./notification.controller";
import { NotificationService } from "./notification.service";
import { NotificationRepository } from "./notification.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new NotificationRepository(getPrisma());
const service = new NotificationService(repo);
const controller = new NotificationController(service);


router.get("/my", auth, controller.getMy);
router.patch("/:id/read", auth, controller.markRead);
router.get("/partners", auth, controller.getPartners);

export default router;
