import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import type { YouthRegistrationService } from "./youth-registration.service";
import type { CreateYouthRegistrationDto, RejectYouthRegistrationDto, YouthRegistrationListQuery } from "./dto/youth-registration.dto";

export class YouthRegistrationController {
  constructor(private service: YouthRegistrationService) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query: YouthRegistrationListQuery = {};
      if (req.query["teamId"]) query.teamId = String(req.query["teamId"]);
      if (req.query["status"]) query.status = req.query["status"] as "PENDING" | "GUARDIAN_APPROVED" | "CONTRACTED" | "REJECTED";
      const data = await this.service.getAll(query);
      res.json(data);
    } catch (e) { next(e); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getById(String(req.params["id"]));
      res.json(data);
    } catch (e) { next(e); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { playerName, birthDate, preferredJerseyNumber, teamId, guardianEmail, note } = req.body;
      if (!playerName || !birthDate || !teamId || !guardianEmail) throw new AppError(400, "MISSING_REQUIRED_FIELDS");
      // SH7: playerName 길이(1-100) 및 SQL injection 위험 문자 차단
      if (typeof playerName !== "string" || playerName.trim().length === 0 || playerName.length > 100) {
        throw new AppError(400, "INVALID_NAME");
      }
      if (/['";]|--|\/\*/i.test(playerName)) {
        throw new AppError(400, "INVALID_NAME");
      }
      // SH7: note 최대 500자
      if (note !== undefined && (typeof note !== "string" || note.length > 500)) {
        throw new AppError(400, "INVALID_NOTE");
      }
      const dto: CreateYouthRegistrationDto = { playerName, birthDate, preferredJerseyNumber, teamId: String(teamId), guardianEmail };
      const data = await this.service.create(dto, requireUser(req).id);
      res.status(201).json(data);
    } catch (e) { next(e); }
  };

  guardianApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.guardianApprove(String(req.params["id"]), requireUser(req).id);
      res.json(data);
    } catch (e) { next(e); }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rejectionReason } = req.body;
      if (!rejectionReason) throw new AppError(400, "MISSING_REQUIRED_FIELDS");
      const dto: RejectYouthRegistrationDto = { rejectionReason };
      const data = await this.service.reject(String(req.params["id"]), dto);
      res.json(data);
    } catch (e) { next(e); }
  };

  contract = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { nationalityId } = req.body;
      if (!nationalityId) throw new AppError(400, "NATIONALITY_REQUIRED");
      const data = await this.service.contract(String(req.params["id"]), requireUser(req).id, Number(nationalityId));
      res.status(201).json(data);
    } catch (e) { next(e); }
  };
}
