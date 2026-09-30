import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { EquipmentController } from "./equipment.controller";
import { EquipmentService } from "./equipment.service";
import { EquipmentRepository } from "./equipment.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { NotificationService } from "../notification/notification.service";
import { DisposalRepository } from "./disposal/disposal.repo";
import { DisposalService } from "./disposal/disposal.service";
import { DisposalController } from "./disposal/disposal.controller";
import { getPrisma } from "../lib/prisma";
import { ledgerService } from "../ledger/ledger.routes";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const equipmentRepo = new EquipmentRepository(getPrisma());
const notificationRepo = new NotificationRepository(getPrisma());
const service = new EquipmentService(equipmentRepo, notificationRepo, ledgerService);
const controller = new EquipmentController(service);
const notificationService = new NotificationService(notificationRepo);
const disposalRepo = new DisposalRepository(getPrisma());
const disposalService = new DisposalService(disposalRepo);
const disposalController = new DisposalController(disposalService, notificationService);


// Loan routes (static paths first)
router.get("/loans", auth, controller.listLoans);
router.get("/loans/my", auth, controller.listMyLoans);
router.post("/loans", auth, controller.requestLoan);
router.post("/loans/:loanId/approve", auth, controller.approveLoan);
router.post("/loans/:loanId/reject", auth, controller.rejectLoan);
router.post("/loans/:loanId/issue", auth, controller.issueLoan);
router.post("/loans/:loanId/return", auth, controller.returnLoan);

// static paths first to avoid shadowing by /:id
router.post("/assignments", auth, controller.createAssignment);
router.patch("/assignments/:assignmentId/return", auth, controller.returnAssignment);
router.get("/assignments/player/:playerId", auth, controller.getUnreturnedByPlayer);
router.patch("/units/:unitId/status", auth, controller.transitionUnit);
router.patch("/units/:unitId/sanitation", auth, controller.updateUnitSanitation);

router.get("/", auth, controller.listItems);
router.post("/", auth, controller.createItem);
router.get("/:id", auth, controller.getItem);
router.patch("/:id/quantity", auth, controller.adjustQuantity);
router.post("/:id/units", auth, controller.addUnit);

router.get("/units/:unitId/disposal", auth, disposalController.getVerification);
router.post("/units/:unitId/disposal", auth, disposalController.requestDisposal);
router.post("/units/:unitId/disposal/fm-verify", auth, disposalController.fmVerify);
router.post("/units/:unitId/disposal/gm-approve", auth, disposalController.gmApprove);
router.post("/units/:unitId/disposal/reject", auth, disposalController.rejectVerification);

export default router;
