import { auth } from "../lib/authMiddleware";
import { canReadHR } from "../lib/permissions";
import { Router } from "express";
import multer from "multer";
import { getPrisma } from "../lib/prisma";
import { HrReportRepository } from "./hr-report.repo";
import { HrReportService } from "./hr-report.service";
import { HrReportController } from "./hr-report.controller";
import { AppError } from "../lib/appError";
import { intIdRouter } from "../lib/idParamGuard";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = intIdRouter();
const repo = new HrReportRepository(getPrisma());
const service = new HrReportService(repo);
const controller = new HrReportController(service);


const requireHR = (req: any, res: any, next: any) => {
  const { role, frontOfficeRole } = req.user as any;
  if (canReadHR(role, frontOfficeRole) || (role === "FRONT_OFFICE" && frontOfficeRole === "TD"))
    return next();
  next(new AppError(403, "FORBIDDEN"));
};

router.get("/monthly", auth, requireHR, controller.getMonthly);
router.get("/annual", auth, requireHR, controller.getAnnual);
router.get("/hiring-priority", auth, requireHR, controller.getHiringPriorityQueue);
router.post("/extract-image", auth, requireHR, upload.single("image"), controller.extractImage);

export default router;
