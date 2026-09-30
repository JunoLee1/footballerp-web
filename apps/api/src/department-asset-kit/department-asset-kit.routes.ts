import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { DepartmentAssetKitController } from "./department-asset-kit.controller";
import { DepartmentAssetKitRepository } from "./department-asset-kit.repo";
import { DepartmentAssetKitService } from "./department-asset-kit.service";
import { intIdRouter } from "../lib/idParamGuard";

/**
 * Routes for DepartmentDefaultAssetKit (#373).
 *
 * Mounted at `/department-asset-kits/:departmentId` — mirrors the shape of
 * `/onboarding-templates/:departmentId` (1:1 with Department, keyed by the
 * unique departmentId, no separate resource id).
 */
const prisma = getPrisma();
const repo = new DepartmentAssetKitRepository(prisma);
const service = new DepartmentAssetKitService(repo, prisma);
const controller = new DepartmentAssetKitController(service);

const router = intIdRouter();

// GET /department-asset-kits/:departmentId — ADMIN + ASSET_MANAGER + ASSET_STAFF (read).
router.get("/:departmentId", auth, controller.get);

// PUT /department-asset-kits/:departmentId — ADMIN + ASSET_MANAGER (write).
router.put("/:departmentId", auth, controller.upsert);

// DELETE /department-asset-kits/:departmentId — ADMIN + ASSET_MANAGER (write).
router.delete("/:departmentId", auth, controller.remove);

export { service as departmentAssetKitService, repo as departmentAssetKitRepo };
export default router;
