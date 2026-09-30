import { auth } from "../lib/authMiddleware";
import { Router, type Request, type Response, type NextFunction } from "express";
import express from "express";
import { AcademyFeeController } from "./academy-fee.controller";
import { AcademyFeeService } from "./academy-fee.service";
import { AcademyFeeRepository } from "./academy-fee.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { getPrisma } from "../lib/prisma";
import { AppError } from "../lib/appError";
import { canReadHR, canReadFinance, isAdminLike } from "../lib/permissions";
import multer from "multer";
import { gcsUpload } from "../lib/gcs";
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter();

const uploadProof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf")
      cb(null, true);
    else cb(new Error("이미지 또는 PDF만 업로드할 수 있습니다."));
  },
});

const prisma = getPrisma();
const service = new AcademyFeeService(new AcademyFeeRepository(prisma), new NotificationRepository(prisma));
const controller = new AcademyFeeController(service);

const requireFinanceOrGuardian = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  const isFinance = role === "ADMIN" || role === "SUPER_ADMIN" || role === "GM" ||
    (role === "FRONT_OFFICE" && (frontOfficeRole === "FINANCE_MANAGER" || frontOfficeRole === "TD"));
  if (role !== "GUARDIAN" && !isFinance) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const requireFinance = (req: Request, res: Response, next: NextFunction) => {
  const { role, frontOfficeRole } = req.user!;
  const isFinance = role === "ADMIN" || role === "SUPER_ADMIN" || role === "GM" ||
    (role === "FRONT_OFFICE" && (frontOfficeRole === "FINANCE_MANAGER" || frontOfficeRole === "TD"));
  if (!isFinance) return next(new AppError(403, "FORBIDDEN"));
  next();
};

const requireAdminLike = (req: Request, res: Response, next: NextFunction) => {
  if (!isAdminLike(req.user!.role)) return next(new AppError(403, "FORBIDDEN"));
  next();
};

// Toss webhook — auth 없음, Toss 서버가 직접 호출
router.post("/toss-webhook", express.json(), controller.tossWebhook);

// 학부모 영수증 수령 후 회비 등록 + 증빙 첨부 (SUBMITTED 직생성)
router.post("/register-with-proof", auth, requireFinance, uploadProof.single("file"), gcsUpload("academy-fee-proofs"), async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError(400, "FILE_REQUIRED"));
    const { playerId, year, month, amount } = req.body;
    if (!playerId || !year || !month || !amount) { return next(new AppError(400, "MISSING_FIELDS")); }
    const url = (req.file as any).gcsUrl;
    res.json(await service.registerWithProof(
      { playerId, year: Number(year), month: Number(month), amount: Number(amount) },
      url,
    ));
  } catch (e) { next(e); }
});

// 유소년 선수 이름 검색 (회비 등록용)
router.get("/players/search", auth, requireFinance, async (req, res, next) => {
  try {
    const name = String(req.query.name ?? "").trim();
    if (!name) return res.json([]);
    res.json(await service.searchYouthPlayers(name));
  } catch (e) { next(e); }
});

router.get("/stats", auth, (req, res, next) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canReadHR(role, frontOfficeRole) && !canReadFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
}, controller.getStats);

router.get("/", auth, (req, res, next) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canReadHR(role, frontOfficeRole) && !canReadFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
}, controller.getAll);

router.get("/player/:playerId", auth, (req, res, next) => {
  const { role, frontOfficeRole } = req.user!;
  if (!canReadHR(role, frontOfficeRole) && !canReadFinance(role, frontOfficeRole)) return next(new AppError(403, "FORBIDDEN"));
  next();
}, controller.getByPlayer);

// 재무팀 단건 수동 생성 (B안: 청구서 먼저 발행 → 보호자 납부 → 승인)
router.post("/", auth, requireFinance, controller.create);

// 단건 조회 — 반드시 specific 경로들 다음에 위치해야 /stats 등이 /:id 에 매칭되지 않음
router.get("/:id", auth, requireFinanceOrGuardian, controller.getById);

router.post("/issue", auth, requireFinance, controller.issueMonthlyFees);

router.patch("/:id/submit-proof", auth, requireFinance, controller.submitPaymentProof);

// 1차 승인: FINANCE_MANAGER → SUBMITTED → FIRST_APPROVED
router.patch("/:id/first-approve", auth, requireFinance, async (req, res, next) => {
  try {
    res.json(await service.firstApprovePayment(Number(req.params.id)));
  } catch (e) { next(e); }
});

// 2차 최종 승인: GM/ADMIN → FIRST_APPROVED → PAID + LedgerEntry
router.patch("/:id/approve", auth, requireAdminLike, controller.approvePayment);

// Receipt — Guardian (own only) or finance team/admin
router.get("/:id/receipt", auth, requireFinanceOrGuardian, controller.getReceipt);

// Admin manual submit (finance team marks external-channel proof as SUBMITTED)
router.patch("/:id/admin-submit", auth, requireFinance, controller.adminSubmit);

// 학부모: Toss 결제 확인
router.post("/:id/toss-confirm", auth, async (req, res, next) => {
  try {
    const { role } = req.user!;
    if (role !== "GUARDIAN") return next(new AppError(403, "FORBIDDEN"));
    const feeId = Number(req.params.id);
    const fee = await service.getById(feeId);
    if (fee.guardianId !== req.user!.id) return next(new AppError(403, "FORBIDDEN"));
    next();
  } catch (e) { next(e); }
}, controller.tossConfirm);

// 재무팀원: 학부모에게 받은 영수증 파일 업로드 → SUBMITTED (재무팀장이 최종 승인)
router.post("/:id/staff-upload-proof", auth, (req, _res, next) => {
  const { role, frontOfficeRole } = req.user!;
  const allowed = role === "ADMIN" || role === "SUPER_ADMIN" || role === "GM" ||
    (role === "FRONT_OFFICE" && (frontOfficeRole === "FINANCE_STAFF" || frontOfficeRole === "FINANCE_MANAGER" || frontOfficeRole === "TD"));
  if (!allowed) return next(new AppError(403, "FORBIDDEN"));
  next();
}, uploadProof.single("file"), gcsUpload("academy-fee-proofs"), async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError(400, "FILE_REQUIRED"));
    const feeId = Number(req.params.id);
    const url = (req.file as any).gcsUrl;
    const updated = await service.adminSubmitProof(feeId, { paymentProofUrl: url });
    res.json(updated);
  } catch (e) { next(e); }
});

// 학부모: 계좌이체 증빙 파일 업로드 → SUBMITTED
router.post("/:id/upload-proof", auth, uploadProof.single("file"), gcsUpload("academy-fee-proofs"), async (req, res, next) => {
  try {
    const { role, id: userId } = req.user!;
    if (role !== "GUARDIAN") { return next(new AppError(403, "FORBIDDEN")); }
    if (!req.file) return next(new AppError(400, "FILE_REQUIRED"));
    const feeId = Number(req.params.id);
    const fee = await service.getById(feeId);
    if (fee.guardianId !== userId) { return next(new AppError(403, "FORBIDDEN")); }
    if (["SUBMITTED", "PAID"].includes(fee.status as string)) { return next(new AppError(409, "ALREADY_SUBMITTED")); }
    const url = (req.file as any).gcsUrl;
    const updated = await service.submitPaymentProof(feeId, { paymentProofUrl: url });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
