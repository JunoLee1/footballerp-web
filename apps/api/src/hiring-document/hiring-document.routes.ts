import { Router } from "express";
import multer from "multer";
import { auth } from "../lib/authMiddleware";
import { getPrisma } from "../lib/prisma";
import { gcsUpload } from "../lib/gcs";
import { HiringDocumentController } from "./hiring-document.controller";
import { HiringDocumentRepository } from "./hiring-document.repo";
import { HiringDocumentService } from "./hiring-document.service";
import { intIdRouter } from "../lib/idParamGuard";

// Same allowlist as `hr.routes.ts` — PDF + docx/xlsx + Hangul word processor.
// Adding image formats (jpg/png) up front so scanned IDs / bank slips don't
// need conversion on the way in.
const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/x-hwp",
  "application/haansofthwp",
  "image/jpeg",
  "image/png",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — same ceiling as other HR uploads
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("INVALID_FILE_TYPE"));
  },
});

const prisma = getPrisma();
const repo = new HiringDocumentRepository(prisma);
const service = new HiringDocumentService(repo, prisma);
const controller = new HiringDocumentController(service);

const router = intIdRouter();

// POST /hiring-documents — multipart upload (docType + applicationId XOR
// hiringDispatchId in the form body, file in `file` field).
router.post("/", auth, upload.single("file"), gcsUpload('hiring-documents', true), controller.upload);

// PATCH /hiring-documents/:id/review — {status, reviewNotes?}
router.patch("/:id/review", auth, controller.review);

// GET /hiring-documents?applicationId=xxx  OR  ?hiringDispatchId=xxx
// Returns the "current" set — latest row per docType.
router.get("/", auth, controller.listCurrent);

// GET /hiring-documents/history?applicationId=xxx&docType=xxx  (or hiringDispatchId)
// Returns the full history for a single docType, newest first.
router.get("/history", auth, controller.listHistory);

/**
 * Exports used by other modules to reuse the same singleton service (avoids
 * a second Prisma client). `hiring-dispatch.routes.ts` composes this service
 * into HiringDispatchService for the EXECUTION gate.
 */
export { service as hiringDocumentService, repo as hiringDocumentRepo };

export default router;
