import * as Sentry from "@sentry/node";
import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import passport from "./lib/strategy";
import apiRouter from "./apiRouter";
import { AppError } from "./lib/appError";
import { MulterError } from "multer";
import { Request, Response, NextFunction } from "express";
import { auth } from "./lib/authMiddleware";
import { initIO } from "./lib/io";
import { startExternalReportReminderJob } from "./jobs/externalReportReminder";
import { startVideoAssignmentOverdueJob } from "./jobs/videoAssignmentOverdue";
import { startMonthlyAttendanceCheckJob } from "./jobs/monthlyAttendanceCheck";
import { startWorkPermitExpiryCheckJob } from "./jobs/workPermitExpiryCheck";
import { startLoanOutExpiryJob } from "./jobs/loanOutExpiry";
import { startContractExpiryJob } from "./jobs/contractExpiry";
import { startContractExpiryAlertJob } from "./jobs/contractExpiryAlert";
import { startMonthlyMarketValueSnapshotJob } from "./jobs/monthlyMarketValueSnapshot";
import { startMatchDayNotificationJob } from "./jobs/matchDayNotification";
import { startYouthWeeklyScheduleJob } from "./jobs/youthWeeklySchedule";
import { startAcademyFeeBillingJob } from "./jobs/academyFeeBilling";
import { startAcademyFeeDelinquencyJob } from "./jobs/academyFeeDelinquency";
import { startQuarterlyHiringSurveyDraftJob } from "./jobs/quarterlyHiringSurveyDraft";
import { startEquipmentExpiryAlertJob } from "./jobs/equipmentExpiryAlert";
import { startInventoryThresholdJob } from "./jobs/inventoryThreshold";
import { startMonthlyDepreciationJob } from "./jobs/monthlyDepreciation";
import { startMonthlyOperationsReportJob } from "./jobs/monthlyOperationsReport";
import { startMonthlyBudgetReportJob } from "./jobs/monthlyBudgetReport";
import { startMedicalRecordRetentionJob } from "./jobs/medicalRecordRetention";
import { startRejectedApplicantRetentionJob } from "./jobs/rejectedApplicantRetention";
import { startContractClauseExecutionJob } from "./jobs/contractClauseExecution";
import { startEquipmentOverdueReturnJob } from "./jobs/equipmentOverdueReturn";
import { startSponsorshipExpiryAlertJob } from "./jobs/sponsorshipExpiryAlert";
import { startHiringSurveyReminderJob } from "./jobs/hiringSurveyReminder";
import { startInspectionDueCron } from "./jobs/inspectionDueAlert";
import { startOpexPurgeJob } from "./jobs/opexPurge";
import { startMedicalEmergencyOverdueEscalationJob } from "./jobs/medicalEmergencyOverdueEscalation";
import { startProbationReviewNotifierJob } from "./jobs/probationReviewNotifier";

Sentry.init({
  dsn: process.env["SENTRY_DSN"],
  environment: process.env["NODE_ENV"] ?? "development",
  enabled: !!process.env["SENTRY_DSN"],
  tracesSampleRate: 0.2,
});

const app = express();
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value
);

app.use(cors({ origin: process.env["CLIENT_ORIGIN"], credentials: true }));
// #572: default express.json() 은 100kb limit 을 초과해도 downstream 크래시 유발.
// 1mb 명시로 초과 시 body-parser 가 entity.too.large 를 throw → 413 반환 (에러 핸들러 참조).
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(passport.initialize());

app.get("/api/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.use("/api", apiRouter);

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, "NOT_FOUND"));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ code: err.code });
    return;
  }
  if (typeof err === "object" && err !== null && "type" in err && (err as { type: string }).type === "entity.parse.failed") {
    res.status(400).json({ code: "INVALID_REQUEST" });
    return;
  }
  // #572: body-parser 가 1mb 초과 감지 시 던지는 에러 → 413 반환
  if (typeof err === "object" && err !== null && "type" in err && (err as { type: string }).type === "entity.too.large") {
    res.status(413).json({ code: "PAYLOAD_TOO_LARGE" });
    return;
  }
  if (err instanceof MulterError) {
    const code = err.code === "LIMIT_FILE_SIZE" ? "FILE_TOO_LARGE" : "UPLOAD_ERROR";
    res.status(413).json({ code });
    return;
  }
  Sentry.captureException(err);
  console.error(err);
  res.status(500).json({ code: "INTERNAL_SERVER_ERROR" });
});

const httpServer = createServer(app);
initIO(httpServer);

const PORT = process.env["PORT"] ?? 3001;
httpServer.listen(PORT, () => console.log(`API server running on port ${PORT}`));
startExternalReportReminderJob();
startVideoAssignmentOverdueJob();
startMonthlyAttendanceCheckJob();
startWorkPermitExpiryCheckJob();
startLoanOutExpiryJob();
startContractExpiryJob();
startContractExpiryAlertJob();
startMonthlyMarketValueSnapshotJob();
startMatchDayNotificationJob();
startYouthWeeklyScheduleJob();
startAcademyFeeBillingJob();
startAcademyFeeDelinquencyJob();
startQuarterlyHiringSurveyDraftJob();
startEquipmentExpiryAlertJob();
startInventoryThresholdJob();
startMonthlyDepreciationJob();
startMonthlyOperationsReportJob();
startMonthlyBudgetReportJob();
startMedicalRecordRetentionJob();
startRejectedApplicantRetentionJob();
startContractClauseExecutionJob();
startEquipmentOverdueReturnJob();
startSponsorshipExpiryAlertJob();
startHiringSurveyReminderJob();
startInspectionDueCron();
startOpexPurgeJob();
startMedicalEmergencyOverdueEscalationJob();
startProbationReviewNotifierJob();
