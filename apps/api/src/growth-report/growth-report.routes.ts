import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { GrowthReportController } from "./growth-report.controller";
import { GrowthReportService } from "./growth-report.service";
import { GrowthReportRepository } from "./growth-report.repo";
import { DevelopmentPlanRepository } from "../development-plan/development-plan.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { GuardianRepository } from "../guardian/guardian.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new GrowthReportRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const planRepo = new DevelopmentPlanRepository(prisma);
const guardianRepo = new GuardianRepository(prisma);
const service = new GrowthReportService(repo, notifRepo, planRepo, guardianRepo);
const controller = new GrowthReportController(service);


router.get("/position-average", auth, controller.getPositionAverage);
router.get("/player/:playerId", auth, controller.getEvaluationsByPlayer);
router.get("/:id", auth, controller.getEvaluationById);
router.post("/", auth, controller.createEvaluation);
router.patch("/:id", auth, controller.updateEvaluation);
router.patch("/:id/publish", auth, controller.publishEvaluation);

router.get("/badges/player/:playerId", auth, controller.getBadgesByPlayer);
router.post("/badges", auth, controller.awardBadge);

export default router;
