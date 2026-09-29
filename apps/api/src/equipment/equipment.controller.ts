import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike, requireClubScope } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { EquipmentService } from "./equipment.service";

const canWrite = (role: string, frontOfficeRole: string | null | undefined): boolean =>
  isAdminLike(role) ||
  role === "GM" ||
  (role === "FRONT_OFFICE" && frontOfficeRole === "EQUIPMENT_MANAGER");

const canRead = (role: string): boolean =>
  isAdminLike(role) || role === "FRONT_OFFICE" || role === "COACHING_STAFF";

export class EquipmentController {
  constructor(private service: EquipmentService) {}

  listItems = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.status(200).json(await this.service.getAllItems(clubScope));
    } catch (err) { next(err); }
  };

  getItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.status(200).json(await this.service.getItemById(Number(req.params["id"]), clubScope));
    } catch (err) { next(err); }
  };

  createItem = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.status(201).json(await this.service.createItem(req.body, clubScope));
    } catch (err) { next(err); }
  };

  adjustQuantity = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.status(200).json(await this.service.adjustQuantity(Number(req.params["id"]), req.body, clubScope));
    } catch (err) { next(err); }
  };

  addUnit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.status(201).json(await this.service.addUnit(Number(req.params["id"]), undefined, clubScope));
    } catch (err) { next(err); }
  };

  transitionUnit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.status(200).json(await this.service.transitionUnitStatus(Number(req.params["unitId"]), req.body, user.id, clubScope));
    } catch (err) { next(err); }
  };

  updateUnitSanitation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.json(await this.service.updateUnitSanitation(Number(req.params["unitId"]), req.body, clubScope));
    } catch (err) { next(err); }
  };

  createAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.createAssignment(req.body));
    } catch (err) { next(err); }
  };

  getUnreturnedByPlayer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canRead(user.role)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.getUnreturnedByPlayer(String(req.params["playerId"])));
    } catch (err) { next(err); }
  };

  returnAssignment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(200).json(await this.service.returnAssignment(Number(req.params["assignmentId"])));
    } catch (err) { next(err); }
  };

  listLoans = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      // Phase 2.5 (Q3): listLoans 는 canWrite 관리자 전용 (본인 대여는 /loans/my)
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      const status = req.query["status"] as any;
      res.status(200).json(await this.service.listLoans(status, clubScope));
    } catch (err) { next(err); }
  };

  listMyLoans = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      res.status(200).json(await this.service.listMyLoans(user.id, clubScope));
    } catch (err) { next(err); }
  };

  requestLoan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const clubScope = requireClubScope(user);
      res.status(201).json(await this.service.requestLoan(user.id, req.body, clubScope));
    } catch (err) { next(err); }
  };

  approveLoan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.status(200).json(await this.service.approveLoan(Number(req.params["loanId"]), user.id, clubScope));
    } catch (err) { next(err); }
  };

  rejectLoan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      res.status(200).json(await this.service.rejectLoan(Number(req.params["loanId"]), user.id, clubScope));
    } catch (err) { next(err); }
  };

  issueLoan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      const { equipmentUnitId } = req.body as { equipmentUnitId?: number };
      res.status(200).json(await this.service.issueLoan(Number(req.params["loanId"]), equipmentUnitId, clubScope));
    } catch (err) { next(err); }
  };

  returnLoan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWrite(user.role, user.frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const clubScope = requireClubScope(user);
      const { returnNote } = req.body as { returnNote?: string };
      res.status(200).json(await this.service.returnLoan(Number(req.params["loanId"]), user.id, returnNote, clubScope));
    } catch (err) { next(err); }
  };
}
