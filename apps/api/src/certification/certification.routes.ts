import { Router } from "express";
import multer from "multer";
import path from "path";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { NotificationRepository } from "../notification/notification.repo";
import { NotificationService } from "../notification/notification.service";
import { CertificationRepository } from "./certification.repo";
import { CertificationService } from "./certification.service";
import { CertificationController } from "./certification.controller";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();
const upload = multer({ dest: path.join(process.cwd(), "uploads", "certifications") });

const notificationService = new NotificationService(new NotificationRepository(getPrisma()));
const certRepo    = new CertificationRepository(getPrisma());
const certService = new CertificationService(certRepo);
const certCtrl    = new CertificationController(certService);

router.get(  "/",                auth, (req, res, next) => certCtrl.list(req, res, next));
router.post( "/",                auth, (req, res, next) => certCtrl.create(req, res, next));
router.get(  "/:id",            auth, (req, res, next) => certCtrl.get(req, res, next));
router.patch("/:id",            auth, (req, res, next) => certCtrl.update(req, res, next));
router.post( "/:id/submit",     auth, (req, res, next) => certCtrl.submit(req, res, next));
router.post( "/:id/approve",    auth, (req, res, next) => certCtrl.approve(req, res, next));
router.post( "/:id/gm-approve", auth, (req, res, next) => certCtrl.gmApprove(req, res, next));
router.post( "/:id/reject",     auth, (req, res, next) => certCtrl.reject(req, res, next));
router.post( "/:id/suspend",    auth, (req, res, next) => certCtrl.suspend(req, res, next));
router.post( "/:id/cancel",     auth, (req, res, next) => certCtrl.cancel(req, res, next));

router.post("/:id/upload", auth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) { res.status(400).json({ message: "NO_FILE" }); return; }
    const documentUrl = `/uploads/certifications/${req.file.filename}`;
    res.json(await certService.update(Number(req.params["id"]), { documentUrl }));
  } catch (e) { next(e); }
});

// notificationService referenced to satisfy DI — used by certStatusSync job via separate import
void notificationService;

export default router;
