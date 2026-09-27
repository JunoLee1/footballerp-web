import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import passport from "passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthRepository } from "./auth.repo";
import { getPrisma } from "../lib/prisma";
import { loginLockoutMiddleware } from "../lib/loginRateLimit";

const router = Router();
const repo = new AuthRepository(getPrisma());
const service = new AuthService(repo);
const controller = new AuthController(service, repo);

const refreshAuth = passport.authenticate("refreshToken", { session: false });

// Progressive lockout: 5회→5분 · 10회→30분 · 15회→1시간 · 20회→24시간.
// 카운터 갱신은 controller.login 이 로그인 성공·실패 후 호출.
router.post("/login", loginLockoutMiddleware, controller.login);

// refresh token으로 재발급
router.post("/refresh", refreshAuth, controller.refresh);

// 로그아웃
router.post("/logout", auth, controller.logout);

// 내 정보
router.get("/me", auth, controller.me);

// 언어 설정
router.patch("/me/language", auth, controller.updateLanguage);

// 개인정보 수정 (본인만)
router.patch("/me/profile", auth, controller.updateProfile);
router.patch("/me/password", auth, controller.updatePassword);

// 유저 생성 (ADMIN 전용)
router.post("/users", auth, controller.createUser);

// 초대 (ADMIN 전용 - 생성/목록, 공개 - 조회/수락)
router.post("/invites", auth, controller.createInvite);
router.get("/invites", auth, controller.listInvites);
router.get("/invites/:token", controller.getInvite);
router.post("/invites/:token/accept", controller.acceptInvite);

// 로그인 이력 (ADMIN 전용)
router.get("/login-history", auth, controller.loginHistory);
router.get("/login-history/:userId", auth, controller.loginHistory);

// GDPR 삭제권 (ADMIN 전용)
router.delete("/users/:id/gdpr-erasure", auth, controller.gdprErasure);

// GDPR 데이터 내보내기 (ADMIN 또는 본인)
router.get("/users/:id/gdpr-export", auth, controller.gdprExport);

export default router;
