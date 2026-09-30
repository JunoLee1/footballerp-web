import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { OnboardingTemplateController } from "./onboarding-template.controller";
import { OnboardingTemplateRepository } from "./onboarding-template.repo";
import { OnboardingTemplateService } from "./onboarding-template.service";
import { intIdRouter } from "../lib/idParamGuard";

const prisma = getPrisma();
const repo = new OnboardingTemplateRepository(prisma);
const service = new OnboardingTemplateService(repo, prisma);
const controller = new OnboardingTemplateController(service);

const router = intIdRouter();

// GET /onboarding-templates/:departmentId — HR + admin-like + dept.head (readers).
// Auth-only for now; page-level access filters handle the read audience.
router.get("/:departmentId", auth, controller.get);

// PUT /onboarding-templates/:departmentId — dept.head + HR + admin-like.
router.put("/:departmentId", auth, controller.upsert);

// DELETE /onboarding-templates/:departmentId — dept.head + HR + admin-like.
router.delete("/:departmentId", auth, controller.remove);

export { service as onboardingTemplateService, repo as onboardingTemplateRepo };

export default router;
