import { auth } from "../lib/authMiddleware";
import { requireReadMedical } from "../lib/medicalGuards";
import { Router } from "express";
import multer from "multer";
import { gcsUpload } from "../lib/gcs";
import { MedicalExpenseController } from "./medical-expense.controller";
import { MedicalExpenseService } from "./medical-expense.service";
import { MedicalExpenseRepository } from "./medical-expense.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new MedicalExpenseRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const service = new MedicalExpenseService(repo, notifRepo);
const controller = new MedicalExpenseController(service);


const storage = multer.memoryStorage();

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/", auth, requireReadMedical, controller.list);
router.post("/", auth, requireReadMedical, upload.single("file"), gcsUpload('medical-expenses'), controller.create);
router.get("/:id", auth, requireReadMedical, controller.get);
router.patch("/:id", auth, upload.single("file"), gcsUpload('medical-expenses'), controller.update);
router.post("/:id/submit", auth, controller.submit);
router.post("/:id/leader-approve", auth, controller.leaderApprove);
router.post("/:id/leader-reject", auth, controller.leaderReject);
router.post("/:id/approve", auth, controller.approve);
router.post("/:id/reject", auth, controller.reject);

export default router;
