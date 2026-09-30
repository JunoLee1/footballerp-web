import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";
import { OnboardingTaskController } from "./onboarding-task.controller";
import { OnboardingTaskRepository } from "./onboarding-task.repo";
import { OnboardingTaskService } from "./onboarding-task.service";
import { intIdRouter } from "../lib/idParamGuard";

const prisma = getPrisma();
const repo = new OnboardingTaskRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const service = new OnboardingTaskService(repo, notifRepo, prisma);
const controller = new OnboardingTaskController(service);

const router = intIdRouter();

// GET /onboarding-tasks/onboarding/:onboardingId — trainee sees own, HR sees any.
router.get("/onboarding/:onboardingId", auth, controller.list);

// GET /onboarding-tasks/verify-queue?departmentId=xxx — verify inbox.
router.get("/verify-queue", auth, controller.verifyQueue);

// PATCH /onboarding-tasks/:taskId/self-report — trainee marks task done/self-reported.
router.patch("/:taskId/self-report", auth, controller.selfReport);

// PATCH /onboarding-tasks/:taskId/verify — HR/dept.head APPROVE/REJECT.
router.patch("/:taskId/verify", auth, controller.verify);

// PATCH /onboarding-tasks/:taskId/skip — optional-task escape hatch (self or HR).
router.patch("/:taskId/skip", auth, controller.skip);

export { service as onboardingTaskService, repo as onboardingTaskRepo };

export default router;
