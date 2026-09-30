import { Router } from "express";
import { TransferRequestController } from "./transfer-request.controller";
import { TransferRequestService } from "./transfer-request.service";
import { TransferRequestRepository } from "./transfer-request.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { WageCapService } from "../contract/wage-cap.service";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new TransferRequestRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const wageCapService = new WageCapService(prisma);
const service = new TransferRequestService(repo, notifRepo, wageCapService);
const controller = new TransferRequestController(service);

router.get("/", auth, controller.list);
router.get("/:id", auth, controller.getById);
router.post("/", auth, controller.create);
router.patch("/:id", auth, controller.update);
router.patch("/:id/submit", auth, controller.submit);
router.patch("/:id/review", auth, controller.review);
router.patch("/:id/confirm", auth, controller.confirm);
router.patch("/:id/medical", auth, controller.recordMedicalResult);
router.patch("/:id/register", auth, controller.register);
router.get("/:id/negotiation-logs", auth, controller.getNegotiationLogs);
router.post("/:id/negotiation-logs", auth, controller.addNegotiationLog);
router.delete("/:id", auth, controller.remove);

export default router;
