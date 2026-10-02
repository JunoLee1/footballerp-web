import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { canManageTD } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import { CoachService } from "./coach.service";
import { CoachStatus } from "../generated/enums";

const canRead = (role: string, frontOfficeRole: string | null | undefined) =>
  canManageTD(role, frontOfficeRole);

const canWrite = (role: string, frontOfficeRole: string | null | undefined) =>
  role === "GM" || (role === "FRONT_OFFICE" && frontOfficeRole === "TD");

const canApprove = (role: string) =>
  role === "GM";

export class CoachController {
  constructor(private service: CoachService) {}

  // ── HiringRound ────────────────────────────────────────────────────────────

  listRounds = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getAllRounds());
    } catch (err) { next(err); }
  };

  createRound = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, id } = requireUser(req);
      if (!canApprove(role)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.createRound({ ...req.body, createdById: id }));
    } catch (err) { next(err); }
  };

  updateRoundStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canApprove(role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.updateRoundStatus(assertCuid(req.params["id"]), req.body));
    } catch (err) { next(err); }
  };

  // ── Coach ──────────────────────────────────────────────────────────────────

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const filter: { roundId?: string; status?: CoachStatus } = {};
      if (req.query["roundId"]) filter.roundId = assertCuid(String(req.query["roundId"]));
      if (req.query["status"]) filter.status = req.query["status"] as CoachStatus;
      res.json(await this.service.getAll(filter));
    } catch (err) { next(err); }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getById(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      const { name, coachingRole } = req.body as { name: unknown; coachingRole: unknown };
      if (typeof name !== "string" || !name.trim()) throw new AppError(400, "NAME_REQUIRED");
      if (!coachingRole) throw new AppError(400, "COACHING_ROLE_REQUIRED");
      res.status(201).json(await this.service.create({ ...req.body, name: name.trim() }));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(assertCuid(req.params["id"]), req.body));
    } catch (err) { next(err); }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (req.body.status === "CONTRACTED") {
        if (!canApprove(role)) throw new AppError(403, "FORBIDDEN");
      } else {
        if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      }
      res.json(await this.service.updateStatus(assertCuid(req.params["id"]), req.body));
    } catch (err) { next(err); }
  };

  // ── Evaluation ─────────────────────────────────────────────────────────────

  upsertEvaluation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.upsertEvaluation(assertCuid(req.params["id"]), req.body));
    } catch (err) { next(err); }
  };

  // ── TutorAssignment ────────────────────────────────────────────────────────

  listTutors = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canRead(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getTutors(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  createTutor = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.createTutor(assertCuid(req.params["id"]), req.body));
    } catch (err) { next(err); }
  };

  updateTutor = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole } = requireUser(req);
      if (!canWrite(role, frontOfficeRole)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.updateTutor(assertCuid(req.params["tutorId"]), req.body));
    } catch (err) { next(err); }
  };
}
