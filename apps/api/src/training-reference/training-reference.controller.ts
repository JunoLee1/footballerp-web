import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import { TrainingReferenceService } from "./training-reference.service";
import { SessionType } from "../generated/enums";

const READ_ROLES = ["ADMIN", "SUPER_ADMIN", "COACHING_STAFF", "FRONT_OFFICE"] as const;
const WRITE_ROLES = ["ADMIN", "SUPER_ADMIN", "COACHING_STAFF"] as const;

export class TrainingReferenceController {
  constructor(private service: TrainingReferenceService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(READ_ROLES as readonly string[]).includes(user.role))
        throw new AppError(403, "FORBIDDEN");
      const q = req.query as Record<string, string | undefined>;
      const listQuery: { sessionType?: SessionType; tag?: string } = {};
      if (q["sessionType"]) listQuery.sessionType = q["sessionType"] as SessionType;
      if (q["tag"]) listQuery.tag = q["tag"];
      res.status(200).json(await this.service.list(listQuery));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(WRITE_ROLES as readonly string[]).includes(user.role))
        throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body, user.id));
    } catch (err) { next(err); }
  };

  delete = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(WRITE_ROLES as readonly string[]).includes(user.role))
        throw new AppError(403, "FORBIDDEN");
      await this.service.delete(
        assertCuid(req.params["id"]),
        user.id,
        isAdminLike(user.role),
      );
      res.status(204).send();
    } catch (err) { next(err); }
  };

  getRecommendations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!(READ_ROLES as readonly string[]).includes(user.role))
        throw new AppError(403, "FORBIDDEN");
      const q = req.query as Record<string, string | undefined>;
      if (!q["sessionType"]) throw new AppError(400, "SESSION_TYPE_REQUIRED");
      res.status(200).json(
        await this.service.getRecommendations(q["sessionType"] as SessionType),
      );
    } catch (err) { next(err); }
  };
}
