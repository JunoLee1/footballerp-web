import { Request, Response, NextFunction } from "express";
import { assertCuid } from "../../lib/cuidGuard";
import { requireUser } from "../../lib/authMiddleware";
import type { ExposureService } from "./exposure.service";
import type { CreateExposureEventDto } from "./dto/exposure.dto";

export class ExposureController {
  constructor(private service: ExposureService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.list(assertCuid(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      res.status(201).json(
        await this.service.create(assertCuid(req.params["id"]), req.body as CreateExposureEventDto, user.id),
      );
    } catch (err) { next(err); }
  };
}
