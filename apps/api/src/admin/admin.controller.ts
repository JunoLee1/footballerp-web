import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { AdminService } from "./admin.service";
import { ListUsersQuery, SetDemoDto } from "./dto/admin.dto";
import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";
import { hasPermission, Permission, requireSuperAdmin } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { writeAuditLog } from "../lib/auditLog";
import { canViewPii } from "../lib/piiAccess";
import { maskEmail, maskPhone, maskAddress } from "../lib/maskPii";
import { getPrisma } from "../lib/prisma";
import { decrypt } from "../lib/crypto";

const requireAdmin = (req: Request): void => {
  const user = requireUser(req);
  if (!hasPermission(user.role as Role, Permission.SYSTEM_MANAGE)) {
    throw new AppError(403, "FORBIDDEN");
  }
};

export class AdminController {
  constructor(private service: AdminService) {}

  listUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      if (!hasPermission(user.role as Role, Permission.SYSTEM_MANAGE)) {
        throw new AppError(403, "FORBIDDEN");
      }
      const filters: ListUsersQuery = {
        ...(req.query["username"] && { username: req.query["username"] as string }),
        ...(req.query["role"] && { role: req.query["role"] as Role }),
        ...(req.query["coachingRole"] && { coachingRole: req.query["coachingRole"] as CoachingRole }),
        ...(req.query["frontOfficeRole"] && { frontOfficeRole: req.query["frontOfficeRole"] as FrontOfficeRole }),
        ...(req.query["isDeleted"] !== undefined && { isDeleted: req.query["isDeleted"] === "true" }),
      };
      const scopedClubId = user.role === "ADMIN" ? user.clubId : null;
      res.status(200).json(await this.service.listUsers(filters, user.isDemo, scopedClubId));
    } catch (err) {
      next(err);
    }
  };

  getUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      res.status(200).json(await this.service.getUserById(String(req.params["id"] ?? "")));
    } catch (err) {
      next(err);
    }
  };

  // GET /admin/users/:id/profile — 마스킹 적용 프로필 조회 (로그인 필요, 권한에 따라 마스킹)
  getUserProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const viewer = requireUser(req);
      const targetId = String(req.params["id"] ?? "");
      const prisma = getPrisma();

      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true, username: true, nickname: true, role: true,
          coachingRole: true, frontOfficeRole: true,
          email: true, homeAddress: true,
          phoneNumber: { select: { encrypted: true, iv: true } },
          team: { select: { id: true, type: true } },
          departmentMemberships: { select: { role: true, department: { select: { id: true, name: true } } } },
        },
      });
      if (!target) throw new AppError(404, "USER_NOT_FOUND");

      const allowed = await canViewPii(prisma, viewer.id, targetId, viewer.role);

      const phone = target.phoneNumber
        ? decrypt(target.phoneNumber.encrypted, target.phoneNumber.iv)
        : null;

      res.json({
        id: target.id,
        username: target.username,
        nickname: target.nickname,
        role: target.role,
        coachingRole: target.coachingRole,
        frontOfficeRole: target.frontOfficeRole,
        team: target.team,
        departments: target.departmentMemberships,
        email:       allowed ? target.email       : maskEmail(target.email),
        phone:       allowed ? phone               : maskPhone(phone),
        homeAddress: allowed ? target.homeAddress  : maskAddress(target.homeAddress),
        masked: !allowed,
      });
    } catch (err) { next(err); }
  };

  updateRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const targetId = String(req.params["id"] ?? "");
      const user = requireUser(req);
      const result = await this.service.updateUserRole(targetId, req.body, user.id, user.role as Role);
      await writeAuditLog({
        actorId: user.id,
        action: "ROLE_UPDATE",
        targetId,
        detail: { newRole: req.body.role },
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  deactivateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const targetId = String(req.params["id"] ?? "");
      const user = requireUser(req);
      const result = await this.service.deactivateUser(targetId, user.id);
      await writeAuditLog({
        actorId: user.id,
        action: "USER_DEACTIVATE",
        targetId,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  reactivateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const targetId = String(req.params["id"] ?? "");
      const result = await this.service.reactivateUser(targetId);
      const user = requireUser(req);
      await writeAuditLog({
        actorId: user.id,
        action: "USER_REACTIVATE",
        targetId,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const user = requireUser(req);
      await this.service.deleteUser(String(req.params["id"] ?? ""), user.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  setDemoStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireSuperAdmin(req);
      const user = requireUser(req);
      const targetId = String(req.params["id"] ?? "");
      const dto: SetDemoDto = { isDemo: req.body.isDemo === true };
      const result = await this.service.setDemoStatus(targetId, dto, user.id);
      await writeAuditLog({
        actorId: user.id,
        action: "DEMO_STATUS_UPDATE",
        targetId,
        detail: { isDemo: dto.isDemo },
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  listPlayersWithoutAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const nameFilter = req.query["name"] as string | undefined;
      res.status(200).json(await this.service.getPlayersWithoutAccounts(nameFilter));
    } catch (err) {
      next(err);
    }
  };

  listAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);
      const filters: Parameters<typeof this.service.getAuditLogs>[0] = {};
      if (req.query["actorId"]) filters.actorId = String(req.query["actorId"]);
      if (req.query["action"]) filters.action = req.query["action"] as string;
      const targetId = (req.query["targetId"] as string | undefined)?.trim()
      if (targetId) filters.targetId = targetId
      if (req.query["from"]) filters.from = req.query["from"] as string;
      if (req.query["to"]) filters.to = req.query["to"] as string;
      if (req.query["page"]) filters.page = Number(req.query["page"]);
      if (req.query["limit"]) filters.limit = Number(req.query["limit"]);
      const user = requireUser(req);
      res.status(200).json(await this.service.getAuditLogs(filters, user.isDemo ?? false));
    } catch (err) {
      next(err);
    }
  };
}
