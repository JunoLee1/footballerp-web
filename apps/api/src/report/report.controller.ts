import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { isAdminLike, canReadHR, canReadFinance } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { ReportService } from "./report.service";
import { assertCuid } from "../lib/cuidGuard";

function isGM(req: Request): boolean {
  return req.user?.role === "GM";
}

function isHeadCoach(req: Request): boolean {
  return req.user?.role === "COACHING_STAFF" && req.user?.coachingRole === "HEAD_COACH";
}

function isAssetManager(req: Request): boolean {
  return req.user?.role === "FRONT_OFFICE" && req.user?.frontOfficeRole === "ASSET_MANAGER";
}

function isAssetStaff(req: Request): boolean {
  return req.user?.role === "FRONT_OFFICE" && req.user?.frontOfficeRole === "ASSET_STAFF";
}

function isHrManager(req: Request): boolean {
  return req.user?.role === "FRONT_OFFICE" && req.user?.frontOfficeRole === "HR_MANAGER";
}

function isHrStaff(req: Request): boolean {
  return req.user?.role === "FRONT_OFFICE" && req.user?.frontOfficeRole === "HR_STAFF";
}

function isFinanceManager(req: Request): boolean {
  return req.user?.role === "FRONT_OFFICE" && req.user?.frontOfficeRole === "FINANCE_MANAGER";
}

function isFinanceStaff(req: Request): boolean {
  return req.user?.role === "FRONT_OFFICE" && req.user?.frontOfficeRole === "FINANCE_STAFF";
}

const AUTHOR_ROLES = ["ADMIN", "COACHING_STAFF", "FRONT_OFFICE"] as const;

export class ReportController {
  constructor(private service: ReportService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type, status, filter } = req.query as { type?: string; status?: string; filter?: string };
      const filters: { type?: string; status?: string } = {};
      if (type !== undefined) filters.type = type;
      if (status !== undefined) filters.status = status;
      const { id: userId, role, departmentCategories = [] } = requireUser(req);
      // pending-* 큐 조회는 GM/ADMIN 계층 전용 (예: /reports?filter=pending-final)
      if (filter && filter.startsWith("pending-") && !isAdminLike(role)) {
        throw new AppError(403, "FORBIDDEN");
      }
      res.json(
        await this.service.list(
          userId,
          isGM(req),
          isHeadCoach(req),
          filters,
          departmentCategories,
          isHrStaff(req),
          isAssetStaff(req),
          isFinanceStaff(req),
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await this.service.get(assertCuid(req.params["id"]));
      const { role, frontOfficeRole: foRole, id: userId, departmentCategories = [] } = requireUser(req);
      const canView =
        isGM(req) ||
        isHeadCoach(req) ||
        report.authorId === userId ||
        (canReadHR(role, foRole, departmentCategories) && report.type === "HR") ||
        (isHrStaff(req) && report.type === "HR") ||
        (canReadFinance(role, foRole, departmentCategories) && report.type === "FINANCIAL") ||
        (isFinanceStaff(req) && report.type === "FINANCIAL") ||
        (isAssetManager(req) && report.type === "ASSET") ||
        (isAssetStaff(req) && report.type === "ASSET") ||
        report.reviews.some((r) => r.reviewerDept && departmentCategories.includes(r.reviewerDept.category ?? ""));
      if (!canView) throw new AppError(403, "FORBIDDEN");
      res.json(report);
    } catch (err) {
      next(err);
    }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole: foRole, id: userId, departmentCategories = [] } = requireUser(req);
      if (!(AUTHOR_ROLES as readonly string[]).includes(role)) throw new AppError(403, "FORBIDDEN");
      const { type, title, content, departmentId } = req.body;
      if (type === "HR" && !canReadHR(role, foRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      if (type === "FINANCIAL" && !canReadFinance(role, foRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      if (type === "ASSET" && !(isAdminLike(role) || foRole === "ASSET_MANAGER" || foRole === "ASSET_STAFF")) throw new AppError(403, "FORBIDDEN");
      const file = req.file;
      res.status(201).json(
        await this.service.create({
          authorId: userId,
          type,
          title,
          content,
          ...(departmentId && { departmentId: Number(departmentId) }),
          ...(file && { fileUrl: (file as any).gcsUrl, fileName: file.originalname }),
        }),
      );
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, content } = req.body;
      const file = req.file;
      res.json(
        await this.service.update(assertCuid(req.params["id"]), requireUser(req).id, {
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
          ...(file && { fileUrl: (file as any).gcsUrl, fileName: file.originalname }),
        }),
      );
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.submit(assertCuid(req.params["id"]), requireUser(req).id));
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await this.service.get(assertCuid(req.params["id"]));

      const canApprove = (() => {
        switch (report.type) {
          case "HR":
            if (report.status === "SUBMITTED") return isHrManager(req);
            if (report.status === "FIRST_APPROVED") return isAssetManager(req);
            if (report.status === "SECOND_APPROVED") return isGM(req);
            return false;
          case "ASSET":
            if (report.status === "SUBMITTED") return isAssetManager(req);
            if (report.status === "FIRST_APPROVED") return isGM(req);
            return false;
          case "FINANCIAL":
            if (report.status === "SUBMITTED") return isFinanceManager(req);
            if (report.status === "FIRST_APPROVED") return isGM(req);
            return false;
          case "TRAINING":
            return isHeadCoach(req) && report.status === "SUBMITTED";
          default:
            return isGM(req) && report.status === "SUBMITTED";
        }
      })();

      if (!canApprove) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.approve(assertCuid(req.params["id"]), req.user!.id));
    } catch (err) {
      next(err);
    }
  };

  reject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const report = await this.service.get(assertCuid(req.params["id"]));

      const canReject = (() => {
        switch (report.type) {
          case "HR":
            if (report.status === "SUBMITTED") return isHrManager(req);
            if (report.status === "FIRST_APPROVED") return isAssetManager(req);
            if (report.status === "SECOND_APPROVED") return isGM(req);
            return false;
          case "ASSET":
            if (report.status === "SUBMITTED") return isAssetManager(req);
            if (report.status === "FIRST_APPROVED") return isGM(req);
            return false;
          case "FINANCIAL":
            if (report.status === "SUBMITTED") return isFinanceManager(req);
            if (report.status === "FIRST_APPROVED") return isGM(req);
            return false;
          case "TRAINING":
            return isHeadCoach(req) && report.status === "SUBMITTED";
          default:
            return isGM(req) && report.status === "SUBMITTED";
        }
      })();

      if (!canReject) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.reject(assertCuid(req.params["id"]), req.user!.id, req.body.reason));
    } catch (err) {
      next(err);
    }
  };

  confirmReview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId } = requireUser(req);
      const reportId = assertCuid(req.params["id"]);
      const reviewerDeptId = assertCuid(req.params["deptId"]);
      const { comment } = req.body;
      res.json(await this.service.confirmReview(reportId, reviewerDeptId, userId, comment));
    } catch (err) {
      next(err);
    }
  };

  rejectReview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId } = requireUser(req);
      const reportId = assertCuid(req.params["id"]);
      const reviewerDeptId = assertCuid(req.params["deptId"]);
      const { reason } = req.body;
      res.json(await this.service.rejectReview(reportId, reviewerDeptId, userId, reason));
    } catch (err) {
      next(err);
    }
  };

  listRuleSets = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.listRuleSets());
    } catch (err) {
      next(err);
    }
  };

  createRuleSet = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reportType, reviewerCategory } = req.body;
      res.status(201).json(await this.service.createRuleSet(reportType, reviewerCategory));
    } catch (err) {
      next(err);
    }
  };

  deleteRuleSet = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await this.service.deleteRuleSet(assertCuid(req.params["ruleId"]));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  };
}
