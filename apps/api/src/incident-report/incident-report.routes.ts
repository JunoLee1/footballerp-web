import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { IncidentReportController } from "./incident-report.controller";
import { IncidentReportService } from "./incident-report.service";
import { IncidentReportRepository } from "./incident-report.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new IncidentReportRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const service = new IncidentReportService(repo, notifRepo);
const controller = new IncidentReportController(service);


router.get("/", auth, controller.getAll);
router.get("/:id", auth, controller.getById);
router.post("/", auth, controller.create);
router.patch("/:id/submit", auth, controller.submit);
router.patch("/:id/sign", auth, controller.sign);

export default router;
