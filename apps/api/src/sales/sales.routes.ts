import { Router, Request, Response, NextFunction } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { SalesRepository } from "./sales.repo";
import { SalesService } from "./sales.service";
import { SalesController } from "./sales.controller";
import { FanController } from "./fan/fan.controller";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import { AppError } from "../lib/appError";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new SalesRepository(getPrisma());
const service = new SalesService(repo, getPrisma());
const ctrl = new SalesController(service);
const fanCtrl = new FanController();

const checkReadFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole, departmentCategories } = req.user!;
  if (!canReadFinance(role, frontOfficeRole, departmentCategories)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkWriteFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole, departmentCategories } = req.user!;
  if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

router.get("/summary",              auth, checkReadFinance, ctrl.summary);
router.get("/ticket-summary",       auth, checkReadFinance, ctrl.ticketSummary);
router.get("/ticket-season-total",  auth, checkReadFinance, ctrl.seasonTicketTotal);
router.get("/tickets",              auth, checkReadFinance, ctrl.listTicketsBySeason);
router.get("/search",               auth, checkReadFinance, ctrl.search);
router.get("/by-match/:matchId",    auth, checkReadFinance, ctrl.byMatch);
router.get("/",                     auth, checkReadFinance, ctrl.list);
router.post("/batch",               auth, checkWriteFinance, ctrl.createBatch);
router.post("/",                    auth, checkWriteFinance, ctrl.create);
router.patch("/:id",                auth, checkWriteFinance, ctrl.update);
router.delete("/:id",               auth, checkWriteFinance, ctrl.delete);
router.post("/:id/cancel",          auth, checkWriteFinance, ctrl.cancel);

router.get("/fans/membership-stats", auth, checkReadFinance,  fanCtrl.membershipStats);
router.get("/fans/:id",              auth, checkReadFinance,  fanCtrl.getById);
router.get("/fans",                  auth, checkReadFinance,  fanCtrl.list);
router.post("/fans",                 auth, checkWriteFinance, fanCtrl.create);
router.post("/fans/:id/memberships", auth, checkWriteFinance, fanCtrl.createMembership);
router.get("/seat-zones/:matchId",   auth, checkReadFinance,  fanCtrl.getSeatZones);
router.post("/seat-zones",           auth, checkWriteFinance, fanCtrl.createSeatZone);

export default router;
