import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { PiiAccessRepository } from "./pii-access.repo";
import { PiiAccessService } from "./pii-access.service";
import { PiiAccessController } from "./pii-access.controller";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new PiiAccessRepository(getPrisma());
const service = new PiiAccessService(repo);
const controller = new PiiAccessController(service);

router.post("/requests", auth, controller.request);
router.get("/requests", auth, controller.listPending);
router.get("/requests/mine", auth, controller.myRequests);
router.patch("/requests/:id/approve", auth, controller.approve);
router.patch("/requests/:id/deny", auth, controller.deny);

export default router;
