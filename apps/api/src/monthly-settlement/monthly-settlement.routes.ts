import { auth } from "../lib/authMiddleware";
import { MonthlySettlementController } from "./monthly-settlement.controller";
import { MonthlySettlementService } from "./monthly-settlement.service";
import { MonthlySettlementRepository } from "./monthly-settlement.repo";
import { getPrisma } from "../lib/prisma";
import { cuidRouter } from "../lib/cuidGuard";
const router = cuidRouter();
const prisma = getPrisma();
const repo = new MonthlySettlementRepository(prisma);
const service = new MonthlySettlementService(repo, prisma);
const controller = new MonthlySettlementController(service);

router.get("/",                     auth, controller.getAll);
router.post("/generate",            auth, controller.generate);
router.get("/:id",                  auth, controller.getById);
router.patch("/:id/note",           auth, controller.updateNote);
router.post("/:id/submit-first",    auth, controller.submitFirst);
router.post("/:id/approve-first",   auth, controller.approveFirst);
router.post("/:id/approve",         auth, controller.approve);
router.post("/:id/reject",          auth, controller.reject);
router.get("/:id/export",           auth, controller.export);

export { router as monthlySettlementRouter };
