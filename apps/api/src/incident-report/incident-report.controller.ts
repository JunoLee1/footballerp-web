import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import type { IncidentReportService } from "./incident-report.service";
import type { CreateIncidentReportDto, SignIncidentReportDto, IncidentReportListQuery } from "./dto/incident-report.dto";
import { IncidentReportStatus, IncidentType } from "../generated/enums";

const ALLOWED_ROLES = ["ADMIN", "SUPER_ADMIN", "COACHING_STAFF", "FRONT_OFFICE"] as const;

function canAccess(req: Request) {
  const user = requireUser(req);
  return (ALLOWED_ROLES as readonly string[]).includes(user.role);
}

export class IncidentReportController {
  constructor(private service: IncidentReportService) {}

  getAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!canAccess(req)) throw new AppError(403, "FORBIDDEN");
      const q = req.query;
      const query: IncidentReportListQuery = {};
      if (q["teamId"]) query.teamId = String(q["teamId"]);
      if (q["status"]) query.status = q["status"] as IncidentReportStatus;
      if (q["playerId"]) query.playerId = String(q["playerId"]);
      res.json(await this.service.getAll(query));
    } catch (e) { next(e); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!canAccess(req)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getById(assertCuid(req.params["id"])));
    } catch (e) { next(e); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(ALLOWED_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      const body = req.body as CreateIncidentReportDto;
      if (!body.playerId || body.teamId == null || !body.type || !body.description) {
        throw new AppError(400, "MISSING_FIELDS");
      }
      if (body.description.length < 10) throw new AppError(400, "DESCRIPTION_TOO_SHORT");
      if (!Object.values(IncidentType).includes(body.type)) throw new AppError(400, "INVALID_TYPE");
      res.status(201).json(await this.service.create(body, user.id));
    } catch (e) { next(e); }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(ALLOWED_ROLES as readonly string[]).includes(user.role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.submit(assertCuid(req.params["id"])));
    } catch (e) { next(e); }
  };

  sign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body as SignIncidentReportDto;
      if (role !== "SUPERVISOR" && role !== "MEDICAL") throw new AppError(400, "INVALID_ROLE");
      const u = requireUser(req);
      const canSign =
        isAdminLike(u.role) ||
        (role === "MEDICAL" &&
          u.role === "COACHING_STAFF" &&
          (u.coachingRole === "MEDICAL" || u.coachingRole === "MEDICAL_DIRECTOR")) ||
        (role === "SUPERVISOR" &&
          u.role === "COACHING_STAFF" &&
          u.coachingRole === "HEAD_COACH");
      if (!canSign) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.sign(assertCuid(req.params["id"]), role));
    } catch (e) { next(e); }
  };
}
