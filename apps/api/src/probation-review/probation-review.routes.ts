import { Router } from "express";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";
import { ProbationReviewController } from "./probation-review.controller";
import { ProbationReviewRepository } from "./probation-review.repo";
import { ProbationReviewService } from "./probation-review.service";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const prisma = getPrisma();
const repo = new ProbationReviewRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const service = new ProbationReviewService(repo, notifRepo, prisma);
const controller = new ProbationReviewController(service);

// Mounted at /staff-records — see apps/api/src/apiRouter.ts.
// Both this router and staff-record.routes.ts share the base path; Express
// merges the matchers in registration order, so the paths below never clash
// with the base CRUD routes of StaffRecord (:id + '/probation-review' vs :id).
router.post("/:id/probation-review", auth, controller.submit);
router.get("/:id/probation-reviews", auth, controller.list);

export default router;
