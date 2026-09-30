import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { requireReadMedical } from "../lib/medicalGuards";
import * as controller from "./medical-equipment-loan.controller";
import { cuidRouter } from "../lib/cuidGuard";

const router = cuidRouter();

router.get("/", auth, requireReadMedical, controller.listLoans);
router.post("/request", auth, controller.requestNormal);
router.post("/emergency", auth, controller.requestEmergency);
router.get("/:id", auth, requireReadMedical, controller.getById);
router.post("/:id/approve", auth, controller.approve);
router.post("/:id/reject", auth, controller.reject);

export default router;
