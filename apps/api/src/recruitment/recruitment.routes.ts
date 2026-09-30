import { auth } from "../lib/authMiddleware";
import { Router } from "express";
import { RecruitmentRepository } from "./recruitment.repo";
import { RecruitmentService } from "./recruitment.service";
import { RecruitmentController } from "./recruitment.controller";
import { NotificationRepository } from "../notification/notification.repo";
import { PlanReportRepository } from "../plan-report/plan-report.repo";
import { getPrisma } from "../lib/prisma";
// :id is polymorphic here (JobPosting cuid vs JobApplication int),
// so validation is enforced per-controller instead of via a param router.
const router = Router();
const prisma = getPrisma();
const repo = new RecruitmentRepository(prisma);
const notifRepo = new NotificationRepository(prisma);
const planReportRepo = new PlanReportRepository(prisma);
const service = new RecruitmentService(repo, notifRepo, planReportRepo);
const controller = new RecruitmentController(service);

// 분석 엔드포인트
router.get("/headcount-progress", auth, controller.getHeadcountProgress);
router.get("/time-to-hire", auth, controller.getTimeToHireStats);
router.get("/cost-per-hire", auth, controller.getCostPerHire);

// JobPosting
router.get("/job-postings", auth, controller.listPostings);
router.post("/job-postings", auth, controller.createPosting);
router.get("/job-postings/:id", auth, controller.getPosting);
router.patch("/job-postings/:id", auth, controller.updatePosting);
router.post("/job-postings/:id/approve", auth, controller.approvePosting);
router.post("/job-postings/:id/close", auth, controller.closePosting);

// Applications under a posting
router.get("/job-postings/:postingId/applications", auth, controller.listApplications);
router.post("/job-postings/:postingId/applications", controller.apply);

// Application actions
// SJ9: PII guard is enforced inside controller.getApplication via canWriteHR
router.get("/applications/:id", auth, controller.getApplication);
router.patch("/applications/:id", auth, controller.updateApplication);
router.post("/applications/:id/reject", auth, controller.rejectApplication);
router.post("/applications/:id/reinstate", auth, controller.reinstateApplication);
router.post("/applications/:id/offer", auth, controller.offerApplication);
router.patch("/applications/:id/screen", auth, controller.screenApplication);

// Interviews
router.post("/applications/:id/interviews", auth, controller.scheduleInterview);
router.patch("/applications/:id/interviews/:round", auth, controller.updateInterview);
router.post("/interviews/:id/scores", auth, controller.addInterviewerScore);
router.get("/interviews/:id/scores", auth, controller.getInterviewerScores);
router.get("/applications/:id/interviews/:round/aggregate", auth, controller.getInterviewerScoreAggregate);
router.post("/applications/:id/interviews/:round/finalize-score", auth, controller.finalizeInterviewScore);

// Reference check
router.post("/applications/:id/reference-check", auth, controller.createReferenceCheck);
router.patch("/applications/:id/reference-check", auth, controller.updateReferenceCheck);

// Onboarding
router.post("/applications/:id/onboarding", auth, controller.startOnboarding);
router.post("/applications/:id/onboarding/verify-email", controller.verifyEmail);
router.post("/applications/:id/onboarding/complete-mfa", controller.completeMfa);

// Waitlist (fix #366)
router.get("/postings/:id/waitlist", auth, controller.getPostingWaitlist);
router.post("/applications/:id/promote-from-waitlist", auth, controller.promoteFromWaitlist);

// Offer 3-stage approval (fix #370)
router.get("/applications/offer-approvals/:stage", auth, controller.listOfferApprovalQueue);
router.post("/applications/:id/offer-approval/leader-approve", auth, controller.offerLeaderApprove);
router.post("/applications/:id/offer-approval/leader-reject", auth, controller.offerLeaderReject);
router.post("/applications/:id/offer-approval/dept-head-approve", auth, controller.offerDeptHeadApprove);
router.post("/applications/:id/offer-approval/dept-head-reject", auth, controller.offerDeptHeadReject);
router.post("/applications/:id/offer-approval/hr-approve", auth, controller.offerHrApprove);
router.post("/applications/:id/offer-approval/hr-reject", auth, controller.offerHrReject);

export default router;
