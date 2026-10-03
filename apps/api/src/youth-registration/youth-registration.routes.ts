import { auth } from "../lib/authMiddleware";
import crypto from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { canReadHR, canWriteHR } from "../lib/permissions";
import { YouthRegistrationController } from "./youth-registration.controller";
import { YouthRegistrationService } from "./youth-registration.service";
import { YouthRegistrationRepository } from "./youth-registration.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { AuthRepository } from "../auth/auth.repo";
import { AuthService } from "../auth/auth.service";
import { getPrisma } from "../lib/prisma";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new YouthRegistrationRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const authRepo = new AuthRepository(prisma);
const authService = new AuthService(authRepo);

const inviteAdapter = {
  inviteUser: async (data: { email: string; role: string }) => {
    const tempPw = crypto.randomUUID();
    const baseNickname = data.email.split("@")[0];
    // Ensure unique nickname by appending random suffix
    const nickname = `${baseNickname}_${crypto.randomUUID().slice(0, 6)}`;
    const user = await authService.createUser({
      email: data.email,
      password: tempPw,
      confirmedPassword: tempPw,
      username: baseNickname ?? "guardian",
      nickname,
      role: data.role,
      coachingRole: null,
      frontOfficeRole: null,
      dateOfBirth: "2000-01-01T00:00:00.000Z",
      phoneNumber: "000-0000-0000",
      nationalityId: 1,
    });
    return { id: user.id };
  },
};

const service = new YouthRegistrationService(repo, notifRepo, inviteAdapter);
const controller = new YouthRegistrationController(service);

const checkReadHR = (req: Request, _res: Response, next: NextFunction) => {
  const { role, frontOfficeRole, departmentCategories } = req.user!;
  if (!canReadHR(role, frontOfficeRole, departmentCategories)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkWriteHR = (req: Request, _res: Response, next: NextFunction) => {
  const { role, frontOfficeRole, departmentCategories } = req.user!;
  if (!canWriteHR(role, frontOfficeRole, departmentCategories)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const checkGuardian = (req: Request, _res: Response, next: NextFunction) => {
  if (req.user?.role !== "GUARDIAN") return next(new AppError(403, "FORBIDDEN"));
  next();
};

router.get("/", auth, checkReadHR, controller.getAll);
router.get("/:id", auth, checkReadHR, controller.getById);
router.post("/", auth, checkWriteHR, controller.create);
router.patch("/:id/reject", auth, checkWriteHR, controller.reject);
router.patch("/:id/contract", auth, checkWriteHR, controller.contract);
router.patch("/:id/guardian-approve", auth, checkGuardian, controller.guardianApprove);

export default router;
