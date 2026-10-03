import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { assertCuid } from "../lib/cuidGuard";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { CERT_APPROVER_MAP } from "./certification.service";
import type { CertificationService } from "./certification.service";
import type {
  CreateCertificationDto,
  UpdateCertificationDto,
  RejectCertificationDto,
  CertificationListQuery,
} from "./dto/certification.dto";
import type { CertificationType } from "../generated/enums";

const isGmOrAdmin = (req: Request): boolean => {
  const u = requireUser(req);
  return isAdminLike(u.role) || u.role === "GM";
};

const isCertFirstApprover = (req: Request, certType: CertificationType): boolean => {
  const u = requireUser(req);
  if (isAdminLike(u.role)) return true;
  const required = CERT_APPROVER_MAP[certType];
  if (required.role === "ADMIN") return isAdminLike(u.role);
  if (required.role === "MEDICAL_DIRECTOR") {
    return u.role === "COACHING_STAFF" && u.coachingRole === "MEDICAL_DIRECTOR";
  }
  if (required.role === "FRONT_OFFICE" && "foRole" in required) {
    return u.role === "FRONT_OFFICE" && u.frontOfficeRole === required.foRole;
  }
  return false;
};

export class CertificationController {
  constructor(private service: CertificationService) {}

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query as unknown as CertificationListQuery;
      res.json(await this.service.list(query));
    } catch (e) { next(e); }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.service.get(assertCuid(req.params["id"])));
    } catch (e) { next(e); }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const user = requireUser(req);
      const dto = req.body as CreateCertificationDto;
      res.status(201).json(await this.service.create(dto, user.id));
    } catch (e) { next(e); }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.service.update(assertCuid(req.params["id"]), req.body as UpdateCertificationDto));
    } catch (e) { next(e); }
  }

  async submit(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await this.service.submit(assertCuid(req.params["id"])));
    } catch (e) { next(e); }
  }

  async approve(req: Request, res: Response, next: NextFunction) {
    try {
      const id = assertCuid(req.params["id"]);
      const record = await this.service.get(id);
      if (!isCertFirstApprover(req, record.certType as CertificationType)) {
        throw new AppError(403, "FORBIDDEN");
      }
      const user = requireUser(req);
      res.json(await this.service.approve(id, user.id));
    } catch (e) { next(e); }
  }

  async gmApprove(req: Request, res: Response, next: NextFunction) {
    try {
      if (!isGmOrAdmin(req)) throw new AppError(403, "FORBIDDEN");
      const user = requireUser(req);
      res.json(await this.service.gmApprove(assertCuid(req.params["id"]), user.id));
    } catch (e) { next(e); }
  }

  async reject(req: Request, res: Response, next: NextFunction) {
    try {
      const id = assertCuid(req.params["id"]);
      const record = await this.service.get(id);
      const canReject = isCertFirstApprover(req, record.certType as CertificationType) || isGmOrAdmin(req);
      if (!canReject) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.reject(id, req.body as RejectCertificationDto));
    } catch (e) { next(e); }
  }

  async suspend(req: Request, res: Response, next: NextFunction) {
    try {
      if (!isGmOrAdmin(req)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.suspend(assertCuid(req.params["id"])));
    } catch (e) { next(e); }
  }

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      if (!isGmOrAdmin(req)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.cancel(assertCuid(req.params["id"])));
    } catch (e) { next(e); }
  }
}
