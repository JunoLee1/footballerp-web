import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminRepository } from "./admin.repo";
import { getPrisma } from "../lib/prisma";
import { requireUuidParam } from "../lib/uuidGuard";

const router = Router();
const repo = new AdminRepository(getPrisma());
const service = new AdminService(repo);
const controller = new AdminController(service);

router.get("/audit-logs", auth, controller.listAuditLogs);
router.get("/users", auth, controller.listUsers);
router.get("/players-without-accounts", auth, controller.listPlayersWithoutAccounts);
router.get("/users/:id/profile", auth, requireUuidParam("id"), controller.getUserProfile);
router.get("/users/:id", auth, requireUuidParam("id"), controller.getUser);
router.patch("/users/:id/role", auth, requireUuidParam("id"), controller.updateRole);
router.patch("/users/:id/demo", auth, requireUuidParam("id"), controller.setDemoStatus);
router.patch("/users/:id/deactivate", auth, requireUuidParam("id"), controller.deactivateUser);
router.patch("/users/:id/reactivate", auth, requireUuidParam("id"), controller.reactivateUser);
router.delete("/users/:id", auth, requireUuidParam("id"), controller.deleteUser);

export default router;
