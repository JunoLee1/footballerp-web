import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import type { SkipOnboardingTaskDto } from "./dto/skip.dto";
import type { VerifyOnboardingTaskDto } from "./dto/verify.dto";
import type { OnboardingTaskService } from "./onboarding-task.service";

/**
 * REST layer for OnboardingTask.
 *
 * Permission is service-enforced (owner / dept.head / HR checks live there
 * so the DB lookup that resolves the task's onboarding + department only
 * happens once per request). The controller only enforces auth + id parsing.
 */
export class OnboardingTaskController {
  constructor(private service: OnboardingTaskService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const onboardingId = req.params["onboardingId"];
      if (typeof onboardingId !== "string" || onboardingId.length === 0) {
        throw new AppError(400, "INVALID_ONBOARDING_ID");
      }
      const rows = await this.service.list(onboardingId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /onboarding-tasks/verify-queue?departmentId=xxx
   *
   * Anyone auth'd can query but the service filters by the optional
   * departmentId. Page-side filtering keeps the queue widget usable for both
   * HR (all depts) and dept.heads (their dept only).
   */
  verifyQueue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      const raw = req.query["departmentId"];
      const filter: { departmentId?: string } = {};
      if (raw !== undefined) {
        if (typeof raw !== "string" || raw.length === 0) throw new AppError(400, "INVALID_DEPARTMENT_ID");
        filter.departmentId = raw;
      }
      const rows = await this.service.verifyQueue(filter);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  };

  selfReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const id = this.parseTaskId(req);
      const row = await this.service.selfReport(id, user.id);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  verify = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const id = this.parseTaskId(req);
      const dto = (req.body ?? {}) as VerifyOnboardingTaskDto;
      const row = await this.service.verify(id, dto, user.id, user.role, user.frontOfficeRole, user.departmentCategories);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  skip = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const id = this.parseTaskId(req);
      const dto = (req.body ?? {}) as SkipOnboardingTaskDto;
      const row = await this.service.skip(id, dto, user.id, user.role, user.frontOfficeRole, user.departmentCategories);
      res.json(row);
    } catch (err) {
      next(err);
    }
  };

  private parseTaskId(req: Request): string {
    const raw = req.params["taskId"];
    if (typeof raw !== "string" || raw.length === 0) throw new AppError(400, "INVALID_TASK_ID");
    return raw;
  }
}
