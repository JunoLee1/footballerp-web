import { Router } from "express";
import { AgencyController } from "./agency.controller";
import { AgencyService } from "./agency.service";
import { AgencyRepository } from "./agency.repo";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new AgencyRepository(getPrisma());
const service = new AgencyService(repo);
const controller = new AgencyController(service);

router.get("/", auth, controller.list);
router.get("/:id", auth, controller.get);
router.post("/", auth, controller.create);
router.patch("/:id", auth, controller.update);
router.delete("/:id", auth, controller.delete);

export default router;
