import { Router, Request, Response, NextFunction } from "express";
import { auth } from "../lib/authMiddleware";
import { AppError } from "../lib/appError";
import { hasPermission, Permission } from "../lib/permissions";
import { Role } from "../generated/enums";
import { getPrisma } from "../lib/prisma";
import { SoftwareLicenseRepository } from "./software-license.repo";
import { SoftwareLicenseService } from "./software-license.service";
import { SoftwareLicenseController } from "./software-license.controller";
import { requireUuidParam } from "../lib/uuidGuard";

const router = Router();
const repo = new SoftwareLicenseRepository(getPrisma());
const service = new SoftwareLicenseService(repo);
const ctrl = new SoftwareLicenseController(service);

const checkSystemManage = (req: Request, _res: Response, next: NextFunction) => {
  if (!hasPermission(req.user!.role as Role, Permission.SYSTEM_MANAGE)) {
    return next(new AppError(403, "FORBIDDEN"));
  }
  next();
};

router.get("/", auth, checkSystemManage, ctrl.list);
router.post("/", auth, checkSystemManage, ctrl.create);
router.get("/:id", auth, checkSystemManage, ctrl.get);
router.patch("/:id", auth, checkSystemManage, ctrl.update);
router.post("/:id/assign", auth, checkSystemManage, ctrl.assign);
router.delete("/:id/assign/:userId", auth, checkSystemManage, requireUuidParam("userId"), ctrl.revoke);

export default router;
