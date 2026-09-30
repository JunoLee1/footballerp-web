import { Request, Response, NextFunction } from "express";
import { assertCuid } from "../../lib/cuidGuard";
import type { ClauseService } from "./clause.service";
import type { CreateClauseDto } from "./dto/clause.dto";

export class ClauseController {
  constructor(private service: ClauseService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.list(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await this.service.create(assertCuid(req.params["id"]), req.body as CreateClauseDto));
    } catch (err) { next(err); }
  };

  apply = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.applyClause(Number(req.params["clauseId"]), assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  waive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.waiveClause(Number(req.params["clauseId"]), assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  copyFrom = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.copyFrom(assertCuid(req.params["id"]), assertCuid(req.params["sourceId"])));
    } catch (err) { next(err); }
  };
}
