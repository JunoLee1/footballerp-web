import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { SeasonController } from "./season.controller";
import { SeasonService } from "./season.service";
import { SeasonRepository } from "./season.repo";
import { getPrisma } from "../lib/prisma";
import { RecruitmentService } from "../recruitment/recruitment.service";
import { RecruitmentRepository } from "../recruitment/recruitment.repo";
import { BudgetAutomationService } from "../budget-automation/budget-automation.service";
import { BudgetAutomationRepository } from "../budget-automation/budget-automation.repo";
import { expenseCategoryService } from "../expense-category/expense-category.routes";
import { createDraftForNextSeason } from "../budget-plan/draft";
import { NotificationRepository } from "../notification/notification.repo";
import { notifyBudgetPlanEvent } from "../budget-plan/notify";
import { intIdRouter } from "../lib/idParamGuard";
import {
  sendCapacityFailedEmail,
  sendReviewOpenedEmail,
  sendReviewDeadlineD1Email,
} from "../lib/email";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new SeasonRepository(prisma);
// Fix #366: wire RecruitmentService so closeSeason can expire remaining waitlists.
const recruitmentService = new RecruitmentService(new RecruitmentRepository(prisma));
// Fix #400: wire budget draft hook so closeSeason 이 다음 시즌 편성 Draft 를 자동 생성.
const budgetAutomationService = new BudgetAutomationService(
  new BudgetAutomationRepository(prisma),
  expenseCategoryService,
);
// Fix #404: wire notify hook (ADR 0021 channel routing).
const notificationRepo = new NotificationRepository(prisma);
const emailSender = { sendCapacityFailedEmail, sendReviewOpenedEmail, sendReviewDeadlineD1Email };
const notifyHook = (event: Parameters<typeof notifyBudgetPlanEvent>[0], ctx: Parameters<typeof notifyBudgetPlanEvent>[1]) =>
  notifyBudgetPlanEvent(event, ctx, { notificationRepo, email: emailSender });
const budgetPlanDraftHook = {
  createDraftForNextSeason: (closedSeasonId: number) =>
    createDraftForNextSeason(prisma, budgetAutomationService, expenseCategoryService, closedSeasonId, notifyHook),
};
const service = new SeasonService(repo, recruitmentService, budgetPlanDraftHook);
const controller = new SeasonController(service);


// 시즌 생성 (ADMIN)
router.post("/", auth, controller.createSeason);

// 시즌 목록 조회 (?status=UPCOMING|ACTIVE|CLOSED)
router.get("/", auth, controller.getSeasons);

// 현재 활성 시즌 조회 — /:id 보다 먼저 등록
router.get("/active", auth, controller.getActiveSeason);

// 활성 시즌 임금 KPI — /active/wage-cap-kpi 는 /:id 보다 먼저 등록
router.get("/active/wage-cap-kpi", auth, controller.getWageCapKPI);

// 시즌 단건 조회
router.get("/:id", auth, controller.getSeasonById);

// 시즌 활성화 UPCOMING → ACTIVE (ADMIN)
router.patch("/:id/activate", auth, controller.activateSeason);

// 시즌 종료 ACTIVE → CLOSED (ADMIN)
router.patch("/:id/close", auth, controller.closeSeason);

// 시즌 임금상한 설정 (ADMIN)
router.patch("/:id/wage-cap", auth, controller.setWageCap);

export default router;
