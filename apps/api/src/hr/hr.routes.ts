import { Router } from "express";
import multer from "multer";
import { auth } from "../lib/authMiddleware";
import type { Request, Response, NextFunction } from "express";
import { canReadHR } from "../lib/permissions";
import { uploadDocument } from "./hr.controller";
import { gcsUpload } from "../lib/gcs";
import { intIdRouter } from "../lib/idParamGuard";

const ALLOWED_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/x-hwp",
  "application/haansofthwp",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("INVALID_FILE_TYPE"));
    }
  },
});

function requireHR(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "UNAUTHENTICATED" });
  if (!canReadHR(user.role, user.frontOfficeRole)) return res.status(403).json({ error: "FORBIDDEN" });
  next();
}

const router = intIdRouter();
router.post("/documents", auth, requireHR, upload.single("file"), gcsUpload("hr-documents", true), uploadDocument);
export default router;
