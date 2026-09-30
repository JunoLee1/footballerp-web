import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { MandatoryMinimumService } from "./mandatory-minimum.service";
import { MandatoryMinimumController } from "./mandatory-minimum.controller";
import { NotificationRepository } from "../notification/notification.repo";
import { notifyMinimumViolation } from "./notify";
import { intIdRouter } from "../lib/idParamGuard";

const prisma = getPrisma();

// #449 B3: review() APPROVED 후 위반 → GM 재편성 요청 알림 훅
const notificationRepo = new NotificationRepository(prisma);
const violationNotifier = (
  seasonId: number,
  categoryPlanId: number,
  detection: Parameters<typeof notifyMinimumViolation>[2],
) => notifyMinimumViolation(seasonId, categoryPlanId, detection, { prisma, notificationRepo });

const service = new MandatoryMinimumService(prisma, violationNotifier);
const controller = new MandatoryMinimumController(service);

const router = intIdRouter();

// #448 B2: mandatoryMinimum 워크플로우 API (ADR 0022)
// Cross-resource path 라서 apiRouter root ("/") 에 mount — override.routes 와 동일한 패턴.

// FinanceManager 제안 (기존 PENDING 자동 CANCELED — grill Q5)
router.post(
  "/budget-category-plans/:id/mandatory-minimum",
  auth,
  controller.propose,
);

// GM 리뷰 (APPROVED 시 categoryPlan.mandatoryMinimum 즉시 반영 — grill Q9)
router.post(
  "/mandatory-minimum-changes/:id/review",
  auth,
  controller.review,
);

// 이력 조회 — FM/GM/SUPER_ADMIN
router.get(
  "/budget-category-plans/:id/mandatory-minimum/history",
  auth,
  controller.listHistory,
);

// 시즌별 PENDING 목록 — FM/GM
router.get(
  "/financial-reports/:seasonId/mandatory-minimum/pending",
  auth,
  controller.listPending,
);

export default router;
