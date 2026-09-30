import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { TransferController } from "./transfer.controller";
import { TransferService } from "./transfer.service";
import { TransferRepository } from "./transfer.repo";
import { ContractRepository } from "../contract/contract.repo";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new TransferRepository(getPrisma());
const contractRepo = new ContractRepository(getPrisma());
const service = new TransferService(repo, contractRepo);
const controller = new TransferController(service);


// 선수별 이적 목록
router.get("/player/:playerId", auth, controller.getByPlayer);

// 복귀 요청 목록 (ADMIN, GM · ?status=PENDING|APPROVED|REJECTED)
router.get("/recalls", auth, controller.getRecalls);
// 복귀 요청 생성 (인증 사용자 누구나)
router.post("/recalls", auth, controller.createRecall);
// 복귀 요청 승인/거절 (ADMIN)
router.patch("/recalls/:id/status", auth, controller.updateRecallStatus);

// LOAN_IN 데이터 export (ADMIN, GM, TD)
router.get("/:id/export", auth, controller.exportLoanIn);
// 이적 단건
router.get("/:id", auth, controller.getById);
// 이적 등록 (ADMIN, FRONT_OFFICE)
router.post("/", auth, controller.createTransfer);

export default router;
