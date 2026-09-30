import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { StaffRecordRepository } from "./staff-record.repo";
import { StaffRecordService } from "./staff-record.service";
import { StaffRecordController } from "./staff-record.controller";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new StaffRecordRepository(getPrisma());
const service = new StaffRecordService(repo);
const controller = new StaffRecordController(service);

router.get("/", auth, controller.list);
router.post("/", auth, controller.create);
router.get("/:id", auth, controller.get);
router.patch("/:id/terminate", auth, controller.terminate);
router.patch("/:id", auth, controller.update);
router.delete("/:id", auth, controller.delete);

export default router;
