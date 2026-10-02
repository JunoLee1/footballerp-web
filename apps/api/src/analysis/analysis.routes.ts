import { auth } from "../lib/authMiddleware";
import { Router, Request, Response, NextFunction } from "express";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { AnalysisRepository } from "./analysis.repo";
import { getPrisma } from "../lib/prisma";
import { hasPermission, Permission } from "../lib/permissions";
import { AppError } from "../lib/appError";
import { Role } from "../generated/enums";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const repo = new AnalysisRepository(getPrisma());
const service = new AnalysisService(repo);
const controller = new AnalysisController(service);

const requireRanking = (req: Request, res: Response, next: NextFunction) => {
  if (!hasPermission(req.user!.role as Role, Permission.VIEW_TEAM_RANKING)) {
    return next(new AppError(403, 'FORBIDDEN'));//TODO: 코드 수정 해야 할듯(통일성 부족)
  }
  next();
};

router.get("/rankings", auth, requireRanking, controller.getRankings);

export default router;
