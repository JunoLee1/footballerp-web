import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { BudgetPlanRequestService } from "./plan-request.service";
import { BudgetPlanRequestController } from "./plan-request.controller";
import { KnapsackService } from "../budget/knapsack.service";
import { NotificationRepository } from "../notification/notification.repo";
import { notifyBudgetPlanEvent, resolveBudgetPlanReviewers } from "./notify";
import {
  sendCapacityFailedEmail,
  sendReviewOpenedEmail,
  sendReviewDeadlineD1Email,
} from "../lib/email";
import { BudgetOverrideService } from "./override.service";
import { BudgetOverrideController } from "./override.controller";
import { intIdRouter } from "../lib/idParamGuard";

const prisma = getPrisma();
const notificationRepo = new NotificationRepository(prisma);
const emailSender = {
  sendCapacityFailedEmail,
  sendReviewOpenedEmail,
  sendReviewDeadlineD1Email,
};
const notifyHook = (event: Parameters<typeof notifyBudgetPlanEvent>[0], ctx: Parameters<typeof notifyBudgetPlanEvent>[1]) =>
  notifyBudgetPlanEvent(event, ctx, { notificationRepo, email: emailSender });
const reviewersFn = () => resolveBudgetPlanReviewers(prisma);

const router = intIdRouter();
const service = new BudgetPlanRequestService(prisma, new KnapsackService(), notifyHook, reviewersFn);
const controller = new BudgetPlanRequestController(service);

// FinanceManager: DRAFT → AWAITING_REVIEW, 팀장·부서장 신청 창 개방 (14일)
router.post("/financial-reports/:seasonId/open-review", auth, controller.openReview);

// 팀장/부서장: 편성 신청서 제출 (스코프 자동 판정)
router.post("/financial-reports/:seasonId/plan-requests", auth, controller.submit);

// FinanceManager: 심사 신청 현황 조회
router.get("/financial-reports/:seasonId/plan-requests", auth, controller.list);

// FinanceManager: knapsack 실행 (심사 마감 or 전원 신청 완료 후)
router.post("/financial-reports/:seasonId/execute-knapsack", auth, controller.executeKnapsack);

// FinanceManager: KNAPSACK_EXECUTED → FINALIZED (자체 신청 있으면 AWAITING_GM_APPROVAL escalate)
router.post("/financial-reports/:seasonId/finalize", auth, controller.finalize);

// GM: AWAITING_GM_APPROVAL → FINALIZED
router.post("/financial-reports/:seasonId/gm-approve", auth, controller.gmApprove);

// GM: FINALIZED → AWAITING_REVIEW 재개방 (reason 필수)
router.post("/financial-reports/:seasonId/re-plan", auth, controller.rePlan);

// #407: BudgetOverrideLog 편성 이의 신청/승인
const overrideService = new BudgetOverrideService(prisma);
const overrideController = new BudgetOverrideController(overrideService);
router.post("/financial-reports/:seasonId/override-request", auth, overrideController.requestOverride);
router.post("/budget-override-logs/:id/review", auth, overrideController.review);

// #444: FM/GM/ADMIN — BudgetOverrideLog 목록 조회 (status filter/limit/cursor)
router.get("/financial-reports/:seasonId/override-logs", auth, overrideController.list);

export default router;
