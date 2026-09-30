import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { CoachRepository } from "./coach.repo";
import { CoachService } from "./coach.service";
import { CoachController } from "./coach.controller";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const repo = new CoachRepository(getPrisma());
const service = new CoachService(repo);
const controller = new CoachController(service);

const router = intIdRouter();

// HiringRound
router.get("/rounds", auth, controller.listRounds);
router.post("/rounds", auth, controller.createRound);
router.patch("/rounds/:id/status", auth, controller.updateRoundStatus);

// Coach
router.get("/", auth, controller.list);
router.post("/", auth, controller.create);
router.get("/:id", auth, controller.getById);
router.patch("/:id", auth, controller.update);
router.patch("/:id/status", auth, controller.updateStatus);

// Evaluation
router.put("/:id/evaluation", auth, controller.upsertEvaluation);

// TutorAssignment
router.get("/:id/tutors", auth, controller.listTutors);
router.post("/:id/tutors", auth, controller.createTutor);
router.patch("/:id/tutors/:tutorId", auth, controller.updateTutor);

export default router;
