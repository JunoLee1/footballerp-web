import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";
import { AttendanceAppealRepository } from "./attendance-appeal.repo";
import { AttendanceAppealService } from "./attendance-appeal.service";
import { AppError } from "../lib/appError";
import { requireUser } from "../lib/authMiddleware";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new AttendanceAppealRepository(getPrisma());
const notifRepo = new NotificationRepository(getPrisma());
const service = new AttendanceAppealService(repo, notifRepo);

// 이의신청 제출 (코치 또는 HR)
router.post("/", auth, async (req, res, next) => {
  try {
    const { id } = requireUser(req);
    const { trainingResultId, requestedStatus, reason } = req.body as {
      trainingResultId: string;
      requestedStatus: string;
      reason: string;
    };
    if (!trainingResultId || !requestedStatus || !reason?.trim()) {
      throw new AppError(400, "MISSING_REQUIRED_FIELDS");
    }
    const appeal = await service.create({ trainingResultId, requestedStatus, reason, createdById: id });
    res.status(201).json(appeal);
  } catch (e) { next(e); }
});

// 이의신청 목록 조회 (HR만)
router.get("/", auth, async (req, res, next) => {
  try {
    const { role, frontOfficeRole } = requireUser(req);
    const isHR = role === "FRONT_OFFICE" && frontOfficeRole === "HR_MANAGER";
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
    if (!isHR && !isAdmin) throw new AppError(403, "FORBIDDEN");
    const status = req.query["status"] as string | undefined;
    res.json(await service.list(status));
  } catch (e) { next(e); }
});

// 수락
router.post("/:id/accept", auth, async (req, res, next) => {
  try {
    const { id: userId, role, frontOfficeRole } = requireUser(req);
    const isHR = role === "FRONT_OFFICE" && frontOfficeRole === "HR_MANAGER";
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
    if (!isHR && !isAdmin) throw new AppError(403, "FORBIDDEN");
    const { reviewNote } = req.body as { reviewNote?: string };
    res.json(await service.accept(Number(req.params.id), userId, reviewNote));
  } catch (e) { next(e); }
});

// 거절
router.post("/:id/reject", auth, async (req, res, next) => {
  try {
    const { id: userId, role, frontOfficeRole } = requireUser(req);
    const isHR = role === "FRONT_OFFICE" && frontOfficeRole === "HR_MANAGER";
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
    if (!isHR && !isAdmin) throw new AppError(403, "FORBIDDEN");
    const { reviewNote } = req.body as { reviewNote?: string };
    res.json(await service.reject(Number(req.params.id), userId, reviewNote));
  } catch (e) { next(e); }
});

export default router;
