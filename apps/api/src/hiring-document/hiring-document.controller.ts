import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { canWriteHR } from "../lib/permissions";
import type {
  ReviewHiringDocumentDto,
  UploadHiringDocumentDto,
} from "./dto/hiring-document.dto";
import type { HiringDocumentService } from "./hiring-document.service";

/**
 * REST layer for HiringDocument. Role check is centralized at `canWriteHR` —
 * HR_MANAGER and ADMIN/GM. HR_STAFF (`canReadHR`) is intentionally *not*
 * granted write access here: Q8 gives them equal upload/review rights, but
 * the existing permission helpers only expose `canWriteHR = HR_MANAGER +
 * admin-like`. Widening to include HR_STAFF is a cross-cutting change
 * (asset-request, plan-report, etc. all use the same helper) and belongs in
 * a follow-up. Deferring keeps this PR scoped.
 */
export class HiringDocumentController {
  constructor(private service: HiringDocumentService) {}

  upload = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories)) {
        throw new AppError(403, "FORBIDDEN");
      }
      const file = req.file;
      if (!file) throw new AppError(400, "FILE_REQUIRED");

      const body = req.body as {
        applicationId?: string;
        hiringDispatchId?: string;
        docType?: string;
      };
      if (typeof body.docType !== "string") throw new AppError(400, "DOC_TYPE_REQUIRED");

      const dto: UploadHiringDocumentDto = {
        docType: body.docType,
      };
      if (body.applicationId !== undefined) {
        if (typeof body.applicationId !== "string" || body.applicationId.length === 0) {
          throw new AppError(400, "INVALID_APPLICATION_ID");
        }
        dto.applicationId = body.applicationId;
      }
      if (body.hiringDispatchId !== undefined) {
        if (typeof body.hiringDispatchId !== "string" || body.hiringDispatchId.length === 0) {
          throw new AppError(400, "INVALID_DISPATCH_ID");
        }
        dto.hiringDispatchId = body.hiringDispatchId;
      }

      const created = await this.service.upload(
        dto,
        {
          path: file.path,
          filename: file.filename,
          originalname: file.originalname,
          size: file.size,
        },
        user.id,
      );
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  };

  review = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories)) {
        throw new AppError(403, "FORBIDDEN");
      }
      const id = req.params["id"];
      if (typeof id !== "string" || id.length === 0) throw new AppError(400, "INVALID_ID");
      const dto = req.body as ReviewHiringDocumentDto;
      const updated = await this.service.review(id, dto, user.id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  listCurrent = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories)) {
        throw new AppError(403, "FORBIDDEN");
      }
      const target = this.parseTargetQuery(req);
      const rows = await this.service.listCurrent(target);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  };

  listHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!canWriteHR(user.role, user.frontOfficeRole, user.departmentCategories)) {
        throw new AppError(403, "FORBIDDEN");
      }
      const target = this.parseTargetQuery(req);
      const docType = String(req.query["docType"] ?? "");
      const rows = await this.service.listHistory(target, docType);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  };

  private parseTargetQuery(req: Request): {
    applicationId?: string;
    hiringDispatchId?: string;
  } {
    const target: { applicationId?: string; hiringDispatchId?: string } = {};
    const appQ = req.query["applicationId"];
    const dispQ = req.query["hiringDispatchId"];
    if (appQ !== undefined) {
      if (typeof appQ !== "string" || appQ.length === 0) throw new AppError(400, "INVALID_APPLICATION_ID");
      target.applicationId = appQ;
    }
    if (dispQ !== undefined) {
      if (typeof dispQ !== "string" || dispQ.length === 0) throw new AppError(400, "INVALID_DISPATCH_ID");
      target.hiringDispatchId = dispQ;
    }
    return target;
  }
}
