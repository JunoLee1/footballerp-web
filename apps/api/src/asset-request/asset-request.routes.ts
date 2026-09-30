import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";
import { OperatingExpenseRepository } from "../operating-expense/operating-expense.repo";
import { AssetRequestController } from "./asset-request.controller";
import { AssetRequestRepository } from "./asset-request.repo";
import { AssetRequestService } from "./asset-request.service";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new AssetRequestRepository(prisma);
const expenseRepo = new OperatingExpenseRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const service = new AssetRequestService(repo, expenseRepo, notifRepo, prisma);
const controller = new AssetRequestController(service);

router.get("/", auth, controller.list);
router.get("/:id", auth, controller.getById);
router.post("/", auth, controller.create);
router.patch("/:id/submit", auth, controller.submit);
router.patch("/:id/leader-approve", auth, controller.leaderApprove);
router.patch("/:id/leader-reject", auth, controller.leaderReject);
router.patch("/:id/approve", auth, controller.approve);
router.patch("/:id/reject", auth, controller.reject);
router.patch("/:id/cancel", auth, controller.cancel);
router.patch("/:id/fulfill", auth, controller.fulfill);

export default router;
