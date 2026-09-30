import { auth } from "../lib/authMiddleware";
import { Router, Request, Response, NextFunction } from "express";
import { getPrisma } from "../lib/prisma";
import { SponsorshipRepository } from "./sponsorship.repo";
import { SponsorshipService } from "./sponsorship.service";
import { SponsorshipController } from "./sponsorship.controller";
import { ledgerService } from "../ledger/ledger.routes";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import { AppError } from "../lib/appError";
import { ClauseRepository } from "./clause/clause.repo";
import { ClauseService } from "./clause/clause.service";
import { ClauseController } from "./clause/clause.controller";
import { ExposureRepository } from "./exposure/exposure.repo";
import { ExposureService } from "./exposure/exposure.service";
import { ExposureController } from "./exposure/exposure.controller";
import { cuidRouter } from "../lib/cuidGuard";

const router = cuidRouter("id", "paymentId", "clauseId", "sourceId");

const repo = new SponsorshipRepository(getPrisma());
const service = new SponsorshipService(repo, ledgerService);
const controller = new SponsorshipController(service);

const clauseRepo = new ClauseRepository(getPrisma());
const clauseService = new ClauseService(clauseRepo);
const clauseController = new ClauseController(clauseService);

const exposureRepo = new ExposureRepository(getPrisma());
const exposureService = new ExposureService(exposureRepo);
const exposureController = new ExposureController(exposureService);

const checkReadFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canReadFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkWriteFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canWriteFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

router.get("/",          auth, checkReadFinance, controller.list);
router.get("/roi",       auth, checkReadFinance, controller.getRoiSummary);
router.get("/expiring",  auth, checkReadFinance, controller.getExpiring);
router.post("/",         auth, checkWriteFinance, controller.create);
router.get("/:id",       auth, checkReadFinance, controller.get);
router.patch("/:id",     auth, checkWriteFinance, controller.update);
router.delete("/:id",    auth, checkWriteFinance, controller.delete);
router.get("/:id/payments", auth, checkReadFinance, controller.getPayments);
router.patch("/:id/payments/:paymentId", auth, checkWriteFinance, controller.markPaid);

router.get("/:id/clauses",                            auth, checkReadFinance,  clauseController.list);
router.post("/:id/clauses",                           auth, checkWriteFinance, clauseController.create);
router.post("/:id/clauses/copy-from/:sourceId",       auth, checkWriteFinance, clauseController.copyFrom);
router.post("/:id/clauses/:clauseId/apply",           auth, checkWriteFinance, clauseController.apply);
router.post("/:id/clauses/:clauseId/waive",           auth, checkWriteFinance, clauseController.waive);

router.get("/:id/exposure-events",  auth, checkReadFinance, exposureController.list);
router.post("/:id/exposure-events", auth, checkWriteFinance, exposureController.create);

export default router;
