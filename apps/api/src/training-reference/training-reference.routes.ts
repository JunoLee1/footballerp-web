import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { TrainingReferenceController } from "./training-reference.controller";
import { TrainingReferenceService } from "./training-reference.service";
import { TrainingReferenceRepository } from "./training-reference.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new TrainingReferenceRepository(getPrisma());
const service = new TrainingReferenceService(repo);
const controller = new TrainingReferenceController(service);


router.get("/", auth, controller.list);
router.get("/recommendations", auth, controller.getRecommendations);
router.post("/", auth, controller.create);
router.delete("/:id", auth, controller.delete);

export default router;
