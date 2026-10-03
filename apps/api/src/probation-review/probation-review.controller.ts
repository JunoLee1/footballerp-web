import { Request, Response, NextFunction } from "express";
import { requireUser } from "../lib/authMiddleware";
import { ProbationReviewService } from "./probation-review.service";
import { SubmitProbationReviewDto } from "./dto/probation-review.dto";

export class ProbationReviewController {
  constructor(private service: ProbationReviewService) {}

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: reviewerId, role, frontOfficeRole } = requireUser(req);
      const staffRecordId = String(req.params["id"]);
      const body = req.body as SubmitProbationReviewDto;
      const result = await this.service.submit(
        staffRecordId,
        reviewerId,
        role,
        frontOfficeRole ?? null,
        body,
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: reviewerId, role, frontOfficeRole } = requireUser(req);
      const staffRecordId = String(req.params["id"]);
      const rows = await this.service.list(
        staffRecordId,
        reviewerId,
        role,
        frontOfficeRole ?? null,
      );
      res.json(rows);
    } catch (err) {
      next(err);
    }
  };
}
