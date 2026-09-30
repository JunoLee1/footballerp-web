import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";
import { TeamRepository } from "./team.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new TeamRepository(getPrisma());
const service = new TeamService(repo);
const controller = new TeamController(service);

router.get("/", auth, controller.getAll);
router.get("/:id", auth, controller.getById);
router.post("/", auth, controller.create);
router.patch("/:id/deactivate", auth, controller.deactivate);
router.patch("/:id", auth, controller.update);

export default router;
