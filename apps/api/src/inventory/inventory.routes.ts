import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { InventoryRepository } from "./inventory.repo";
import { InventoryService } from "./inventory.service";
import { InventoryController } from "./inventory.controller";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new InventoryRepository(getPrisma());
const service = new InventoryService(repo);
const ctrl = new InventoryController(service);

router.get("/alerts", auth, ctrl.alerts);  // BEFORE /:id to avoid route conflict
router.get("/", auth, ctrl.list);
router.post("/", auth, ctrl.create);
router.patch("/:id/quantity", auth, ctrl.adjust);

export default router;
