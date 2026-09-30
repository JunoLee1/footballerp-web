import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../lib/appError";
import { isAdminLike } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME, ACCESS_TOKEN_COOKIE_OPTIONS, REFRESH_TOKEN_COOKIE_OPTIONS } from "../lib/constants";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repo";
import { Role, CoachingRole, FrontOfficeRole } from "../generated/enums";
import { recordFailedAttempt, resetAttempts } from "../lib/loginRateLimit";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";

export class AuthController {
  private notifRepo = new NotificationRepository(getPrisma());
  constructor(
    private service: AuthService,
    private repo: AuthRepository,
  ) {}


  // 나중에 lib나 미들웨어로 이사 고려
  private getAuthenticatedUser(req: Request) {
    const user = req.user;
    if (!user || typeof user !== "object") throw new AppError(401, "UNAUTHORIZED");

    const rawId = (user as { id?: unknown }).id;
    if (typeof rawId !== "string" || rawId.length === 0) throw new AppError(401, "UNAUTHORIZED");
    const userId = rawId;

    const role = (user as { role?: unknown }).role;
    if (typeof role !== "string") throw new AppError(401, "UNAUTHORIZED");

    return { id: userId, role };
  }

  login = async (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const userAgent = req.get("user-agent") ?? "unknown";
    const email: string = req.body?.email ?? "";
    try {
      const { accessToken, refreshToken, userId, teamId } = await this.service.login(req.body);
      void this.repo.createLoginHistory({ userId, email, ip, userAgent, success: true }).catch(console.error);
      // 로그인 성공: progressive lockout 카운터 리셋
      if (email) void resetAttempts(ip, email).catch(console.error);
      console.log("[AUTH] login success", { userId, teamId, ip });
      res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
      res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);
      res.status(200).json({ message: "OK" });
    } catch (err) {
      void this.repo.createLoginHistory({ email, ip, userAgent, success: false }).catch(console.error);
      // 로그인 실패: progressive lockout 카운터 증분 → tier 도달 시 후속 요청 429.
      // 24h tier (20회) 도달 시 ADMIN 에게 보안 알림 발송.
      if (email) {
        void recordFailedAttempt(ip, email)
          .then((r) => {
            if (r.lockedTier === "24h") {
              void this.notifRepo
                .createForAdmin("LOGIN_LOCKOUT_24H", () => ({
                  title: "로그인 브루트포스 의심",
                  body: `${email} (IP ${ip}) · 20회 이상 로그인 실패로 24시간 잠금 발동`,
                }))
                .catch(console.error);
            }
          })
          .catch(console.error);
      }
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const oldJti = (user as Express.User & { jti?: string; exp?: number }).jti;
      const oldExp = (user as Express.User & { jti?: string; exp?: number }).exp;

      const tokens = (await import("../lib/token")).generateTokens({
        id: user.id,
        role: user.role,
        coachingRole: user.coachingRole ?? null,
        frontOfficeRole: user.frontOfficeRole ?? null,
        teamId: user.teamId ?? null,
        clubId: user.clubId ?? null,
      });

      if (oldJti && oldExp) {
        void this.service.blacklistToken(oldJti, new Date(oldExp * 1000)).catch(console.error);
      }

      res.cookie(ACCESS_TOKEN_COOKIE_NAME, tokens.accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
      res.cookie(REFRESH_TOKEN_COOKIE_NAME, tokens.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);
      res.status(200).json({ message: "OK" });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response) => {
    const refreshToken = req.cookies[REFRESH_TOKEN_COOKIE_NAME] as string | undefined;
    if (refreshToken) {
      try {
        const decoded = jwt.decode(refreshToken) as { jti?: string; exp?: number } | null;
        if (decoded?.jti && decoded.exp) {
          void this.service.blacklistToken(decoded.jti, new Date(decoded.exp * 1000)).catch(console.error);
        }
      } catch { /* 토큰 파싱 실패 시 무시 */ }
    }
    res.clearCookie(ACCESS_TOKEN_COOKIE_NAME);
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME);
    res.status(200).json({ message: "OK" });
  };

  me = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userInfo = this.getAuthenticatedUser(req);
      const user = await this.service.me(userInfo.id);
      res.status(200).json(user);
    } catch (err) {
      next(err);
    }
  };

  updateLanguage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = this.getAuthenticatedUser(req);
      const { language } = req.body;
      if (language !== 'ko' && language !== 'en') throw new AppError(400, 'INVALID_LANGUAGE');
      await this.repo.updateLanguage(id, language);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = this.getAuthenticatedUser(req);
      const { email, homeAddress, phoneNumber } = req.body as { email?: string; homeAddress?: string | null; phoneNumber?: string };
      const result = await this.service.updateProfile(id, { email, homeAddress, phoneNumber });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  updatePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = this.getAuthenticatedUser(req);
      const { currentPassword, newPassword, confirmedPassword } = req.body as { currentPassword?: string; newPassword?: string; confirmedPassword?: string };
      if (!currentPassword || !newPassword || !confirmedPassword) throw new AppError(400, "MISSING_FIELDS");
      await this.service.updatePassword(id, { currentPassword, newPassword, confirmedPassword });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  };

  createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userInfo = this.getAuthenticatedUser(req);
      if (!isAdminLike(userInfo.role)) throw new AppError(403, "FORBIDDEN");
      const user = await this.service.createUser(req.body);
      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  };

  createInvite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userInfo = this.getAuthenticatedUser(req);
      if (!isAdminLike(userInfo.role)) throw new AppError(403, "FORBIDDEN");
      const { email, role, coachingRole, frontOfficeRole } = req.body as {
        email: string; role: string; coachingRole?: string; frontOfficeRole?: string;
      };
      if (!email || !role) throw new AppError(400, "EMAIL_AND_ROLE_REQUIRED");
      const invite = await this.service.createInvite({
        email, role: role as Role,
        coachingRole: (coachingRole as CoachingRole) ?? null,
        frontOfficeRole: (frontOfficeRole as FrontOfficeRole) ?? null,
        createdById: userInfo.id,
      });
      res.status(201).json(invite);
    } catch (err) { next(err); }
  };

  private maskEmail(email: string): string {
    const atIndex = email.indexOf("@");
    if (atIndex < 0) return "***";
    return email[0] + "***" + email.slice(atIndex);
  }

  getInvite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params as { token: string };
      const invite = await this.service.getInvite(token);
      res.json({ email: this.maskEmail(invite.email), role: invite.role, coachingRole: invite.coachingRole, frontOfficeRole: invite.frontOfficeRole });
    } catch (err) { next(err); }
  };

  acceptInvite = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params as { token: string };
      const user = await this.service.acceptInvite(token, req.body);
      res.status(201).json(user);
    } catch (err) { next(err); }
  };

  listInvites = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userInfo = this.getAuthenticatedUser(req);
      if (!isAdminLike(userInfo.role)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.listInvites());
    } catch (err) { next(err); }
  };

  loginHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userInfo = this.getAuthenticatedUser(req);
      if (!isAdminLike(userInfo.role)) throw new AppError(403, "FORBIDDEN");
      const userId = req.params["userId"];
      const history = typeof userId === "string" && userId.length > 0
        ? await this.repo.listLoginHistory(userId)
        : await this.repo.listAllLoginHistory();
      res.status(200).json(history);
    } catch (err) {
      next(err);
    }
  };

  gdprErasure = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = this.getAuthenticatedUser(req);
      if (!isAdminLike(user.role)) throw new AppError(403, "FORBIDDEN");

      const targetId = req.params["id"];
      if (typeof targetId !== "string" || targetId.length === 0) throw new AppError(400, "INVALID_ID");

      const result = await this.service.gdprErasure(targetId, user.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  gdprExport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = this.getAuthenticatedUser(req);

      const targetId = req.params["id"];
      if (typeof targetId !== "string" || targetId.length === 0) throw new AppError(400, "INVALID_ID");

      // #577: 본인 GDPR 데이터만 export 가능 (또는 관리자 · GM).
      // 타인 GDPR export 는 개인정보보호법 · GDPR 위반.
      if (targetId !== user.id && !isAdminLike(user.role)) {
        throw new AppError(403, "FORBIDDEN");
      }

      const data = await this.service.gdprExport(targetId, user.id, user.role);
      res.json(data);
    } catch (err) {
      next(err);
    }
  };
}
