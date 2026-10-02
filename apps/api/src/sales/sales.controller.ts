import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { canReadFinance, canWriteFinance } from "../lib/permissions";
import type { SalesService } from "./sales.service";
import type { CreateSalesRecordDto } from "./dto/sales.dto";
import { assertCuid } from "../lib/cuidGuard";

export class SalesController {
  constructor(private service: SalesService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.findAll());
    } catch (e) { next(e); }
  };

  byMatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const matchId = assertCuid(req.params["matchId"]);
      if (!matchId) throw new AppError(400, "MATCH_ID_REQUIRED");
      res.json(await this.service.findByMatch(matchId));
    } catch (e) { next(e); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body, id));
    } catch (e) { next(e); }
  };

  createBatch = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dtos = req.body as CreateSalesRecordDto[];
      if (!Array.isArray(dtos)) throw new AppError(400, "ARRAY_REQUIRED");
      res.status(201).json(await this.service.createBatch(dtos, id));
    } catch (e) { next(e); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = Number(req.params["id"]);
      if (!id) throw new AppError(400, "ID_REQUIRED");
      res.json(await this.service.update(id, req.body, userId));
    } catch (e) { next(e); }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = Number(req.params["id"]);
      if (!id) throw new AppError(400, "ID_REQUIRED");
      await this.service.delete(id, userId);
      res.status(204).end();
    } catch (e) { next(e); }
  };

  summary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getSummary());
    } catch (e) { next(e); }
  };

  ticketSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const seasonId = Number(req.query["seasonId"]);
      if (!seasonId) throw new AppError(400, "SEASON_ID_REQUIRED");
      res.json(await this.service.ticketSummaryByMatch(seasonId));
    } catch (e) { next(e); }
  };

  listTicketsBySeason = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const seasonId = Number(req.query["seasonId"]);
      if (!seasonId) throw new AppError(400, "SEASON_ID_REQUIRED");
      res.json(await this.service.findTicketsBySeason(seasonId));
    } catch (e) { next(e); }
  };

  seasonTicketTotal = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const seasonId = Number(req.query["seasonId"]);
      if (!seasonId) throw new AppError(400, "SEASON_ID_REQUIRED");
      const total = await this.service.seasonTicketTotal(seasonId);
      res.json({ total });
    } catch (e) { next(e); }
  };

  search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const { type, matchId, fromDate, toDate, minAmount, maxAmount } = req.query as Record<string, string>;
      res.json(await this.service.searchSales({
        ...(type !== undefined ? { type } : {}),
        ...(matchId ? { matchId: Number(matchId) } : {}),
        ...(fromDate !== undefined ? { fromDate } : {}),
        ...(toDate !== undefined ? { toDate } : {}),
        ...(minAmount ? { minAmount: Number(minAmount) } : {}),
        ...(maxAmount ? { maxAmount: Number(maxAmount) } : {}),
      }));
    } catch (e) { next(e); }
  };

  cancel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWriteFinance(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const id = Number(req.params["id"]);
      const record = await this.service.createCancellation(id, req.body, userId);
      res.json(record);
    } catch (err) {
      next(err);
    }
  };
}
