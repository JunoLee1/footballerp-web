import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { requireGuardian, requireGuardianChild } from "./guardian.middleware";
import { GuardianController } from "./guardian.controller";
import { GuardianService } from "./guardian.service";
import { GuardianRepository } from "./guardian.repo";
import { TrainingRepository } from "../training/training.repo";
import { InjuryRepository } from "../injury/injury.repo";
import { AcademyFeeRepository } from "../academy-fee/academy-fee.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const prisma = getPrisma();
const repo = new GuardianRepository(prisma);
const trainingRepo = new TrainingRepository(prisma);
const injuryRepo = new InjuryRepository(prisma);
const feeRepo = new AcademyFeeRepository(prisma);
const service = new GuardianService(repo, trainingRepo, injuryRepo, feeRepo);
const controller = new GuardianController(service);

const router = intIdRouter();

// 초대 코드 발급 — auth만 (ADMIN/FRONT_OFFICE/GM, controller에서 체크)
router.post("/invite-code", auth, controller.issueInviteCode);

// 자녀 연동 — auth + requireGuardian
router.post("/link/search", auth, requireGuardian, controller.linkBySearch);
router.post("/link/code", auth, requireGuardian, controller.linkByCode);

// 자녀 목록 — auth + requireGuardian
router.get("/me/children", auth, requireGuardian, controller.getChildren);

// 특정 자녀 엔드포인트 — auth + requireGuardian + requireGuardianChild (소유권 검증)
router.get("/me/children/:playerId/dashboard", auth, requireGuardian, requireGuardianChild, controller.getDashboard);
router.get("/me/children/:playerId/attendance", auth, requireGuardian, requireGuardianChild, controller.getChildAttendance);
router.get("/me/children/:playerId/injuries", auth, requireGuardian, requireGuardianChild, controller.getChildInjuries);
router.get("/me/children/:playerId/fees", auth, requireGuardian, requireGuardianChild, controller.getChildFees);
router.patch("/me/children/:playerId/fees/:feeId/submit-proof", auth, requireGuardian, requireGuardianChild, controller.submitFeeProof);

export default router;
