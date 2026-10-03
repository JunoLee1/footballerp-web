import { Request, Response, NextFunction } from "express";
import { HiringAutomationService } from "./hiring-automation.service";
import type { LeagueLevel, DepartmentCategory } from "../generated/enums";
import type {
  UpsertLeagueWeightDto,
  CreateDepartmentIbiConfigDto,
  UpdateDepartmentIbiConfigDto,
  UpsertSeasonComplianceCheckDto,
  CreateComplianceDeadlineDto,
  UpdateComplianceDeadlineDto,
} from "./dto/hiring-automation.dto";

export class HiringAutomationController {
  constructor(private service: HiringAutomationService) {}

  listLeagueWeights = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.listLeagueWeights()); } catch (e) { next(e); }
  };

  upsertLeagueWeight = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leagueLevel, category } = req.params as { leagueLevel: LeagueLevel; category: DepartmentCategory };
      res.json(await this.service.upsertLeagueWeight(leagueLevel, category, req.body as UpsertLeagueWeightDto));
    } catch (e) { next(e); }
  };

  listIbiConfigs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
      res.json(await this.service.listIbiConfigs(departmentId));
    } catch (e) { next(e); }
  };

  createIbiConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await this.service.createIbiConfig(req.body as CreateDepartmentIbiConfigDto));
    } catch (e) { next(e); }
  };

  updateIbiConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.updateIbiConfig(String(req.params["id"]), req.body as UpdateDepartmentIbiConfigDto));
    } catch (e) { next(e); }
  };

  deleteIbiConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.deleteIbiConfig(String(req.params["id"]));
      res.status(204).send();
    } catch (e) { next(e); }
  };

  getComplianceCheck = async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.getComplianceCheck(Number(req.params["seasonId"]))); } catch (e) { next(e); }
  };

  upsertComplianceCheck = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.upsertComplianceCheck(Number(req.params["seasonId"]), req.body as UpsertSeasonComplianceCheckDto));
    } catch (e) { next(e); }
  };

  listComplianceDeadlines = async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json(await this.service.listComplianceDeadlines()); } catch (e) { next(e); }
  };

  createComplianceDeadline = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json(await this.service.createComplianceDeadline(req.body as CreateComplianceDeadlineDto));
    } catch (e) { next(e); }
  };

  updateComplianceDeadline = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.updateComplianceDeadline(String(req.params["id"]), req.body as UpdateComplianceDeadlineDto));
    } catch (e) { next(e); }
  };

  deleteComplianceDeadline = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.deleteComplianceDeadline(String(req.params["id"]));
      res.status(204).send();
    } catch (e) { next(e); }
  };
}
