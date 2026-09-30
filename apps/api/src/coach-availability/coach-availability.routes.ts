import { auth, requireRole } from "../lib/authMiddleware";
import { Router } from "express";
import { CoachAvailabilityController } from "./coach-availability.controller";
import { CoachAvailabilityService } from "./coach-availability.service";
import { CoachAvailabilityRepository } from "./coach-availability.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new CoachAvailabilityRepository(getPrisma());
const service = new CoachAvailabilityService(repo);
const controller = new CoachAvailabilityController(service);

router.get("/", auth, requireRole('ADMIN', 'GM', 'SUPER_ADMIN', 'COACHING_STAFF'), controller.getAll);
router.get("/conflicts", auth, requireRole('ADMIN', 'GM', 'SUPER_ADMIN', 'COACHING_STAFF'), controller.getConflicts);
router.post("/", auth, controller.create);
router.delete("/:id", auth, controller.delete);

export default router;
