import passport from "passport";
import { Request, Response, NextFunction } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { getPrisma } from "./prisma";
import { AppError } from "./appError";
import { writeAuditLog } from "./auditLog";
import { Role } from "../generated/enums";
import { isUserActive } from "./userStatusCache";

export function requireUser(req: Request) {
  if (!req.user) throw new AppError(401, "UNAUTHORIZED");
  return req.user;
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) {
    return next(new AppError(401, "UNAUTHORIZED"));
  }
  if (!roles.includes(req.user.role as Role)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  return next();
};

export const teamSwitchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user ? String(req.user.id) : ipKeyGenerator(req.ip ?? ''),
  message: { code: "TOO_MANY_REQUESTS" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const auth = (req: Request, res: Response, next: NextFunction) => {
  return passport.authenticate(
    "accessToken",
    { session: false },
    async (err: unknown, user: Express.User | false) => {
      if (err || !user) {
        return res.status(401).json({ code: "UNAUTHORIZED" });
      }

      // Redis 캐시 우선 조회 (5분 TTL) — 매-요청 DB roundtrip 제거.
      // soft-delete/재활성화 시 admin.service 에서 invalidate.
      if (!(await isUserActive(user.id))) {
        return res.status(401).json({ code: "UNAUTHORIZED" });
      }

      req.user = user;
      if (user.role === "SUPER_ADMIN") {
        const hdr = req.headers["x-team-id"];
        if (hdr) {
          const newTeamId = Number(hdr);
          if (isNaN(newTeamId) || newTeamId <= 0) {
            return res.status(400).json({ code: "INVALID_TEAM_ID" });
          }
          const team = await getPrisma().team.findUnique({ where: { id: newTeamId }, select: { id: true } });
          if (!team) {
            return res.status(400).json({ code: "INVALID_TEAM_ID" });
          }
          if (user.teamId !== newTeamId) {
            await writeAuditLog({
              actorId: user.id,
              action: "SUPER_ADMIN_TEAM_SWITCH",
              targetId: newTeamId,
              detail: { from: user.teamId, to: newTeamId },
            });
          }
          req.user.teamId = newTeamId;
        }
      }
      next();
    }
  )(req, res, next);
};
