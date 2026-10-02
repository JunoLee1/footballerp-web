import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/appError";
import { canWriteHR, canManageTD, isHeadCoach } from "../lib/permissions";
import { requireUser } from "../lib/authMiddleware";
import { assertCuid } from "../lib/cuidGuard";
import { RecruitmentService } from "./recruitment.service";
import type { InterviewRound } from "../generated/enums";
import type {
  CreateJobPostingDto,
  UpdateJobPostingDto,
  JobPostingListQuery,
  CreateJobApplicationDto,
  UpdateJobApplicationDto,
  CreateInterviewDto,
  UpdateInterviewDto,
  CreateReferenceCheckDto,
  UpdateReferenceCheckDto,
  VerifyOtpDto,
  ScreenApplicationDto,
} from "./dto/recruitment.dto";

const canRead = (role: string, foRole: string | null | undefined, _coachRole: string | null | undefined, deptCategories?: string[]) =>
  canWriteHR(role, foRole, deptCategories) ||
  canManageTD(role, foRole);

const canWrite = (role: string, foRole: string | null | undefined, deptCategories?: string[]) =>
  canWriteHR(role, foRole, deptCategories);

const canApprove = (role: string, foRole: string | null | undefined, deptCategories?: string[]) =>
  canWriteHR(role, foRole, deptCategories);

export class RecruitmentController {
  constructor(private service: RecruitmentService) {}

  // --- JobPosting ---

  listPostings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, frontOfficeRole, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const query = req.query as JobPostingListQuery;
      res.json(await this.service.listPostings(query));
    } catch (err) {
      next(err);
    }
  };

  createPosting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dto = req.body as CreateJobPostingDto;
      res.status(201).json(await this.service.createPosting(dto, userId));
    } catch (err) {
      next(err);
    }
  };

  getPosting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, frontOfficeRole, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getPosting(assertCuid(req.params["id"])));
    } catch (err) {
      next(err);
    }
  };

  updatePosting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dto = req.body as UpdateJobPostingDto;
      res.json(await this.service.updatePosting(assertCuid(req.params["id"]), dto));
    } catch (err) {
      next(err);
    }
  };

  approvePosting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canApprove(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.approvePosting(assertCuid(req.params["id"]), userId));
    } catch (err) {
      next(err);
    }
  };

  closePosting = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.closePosting(assertCuid(req.params["id"])));
    } catch (err) {
      next(err);
    }
  };

  // --- JobApplication ---

  listApplications = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, frontOfficeRole, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.listApplications(assertCuid(req.params["postingId"])));
    } catch (err) {
      next(err);
    }
  };

  apply = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = req.body as CreateJobApplicationDto;
      res.status(201).json(await this.service.apply(assertCuid(req.params["postingId"]), dto));
    } catch (err) {
      next(err);
    }
  };

  getApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // SJ9: application records contain PII — restrict to HR_MANAGER / ADMIN / SUPER_ADMIN
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteHR(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getApplication(assertCuid(req.params["id"])));
    } catch (err) {
      next(err);
    }
  };

  updateApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dto = req.body as UpdateJobApplicationDto;
      res.json(await this.service.updateApplication(assertCuid(req.params["id"]), dto));
    } catch (err) {
      next(err);
    }
  };

  rejectApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.rejectApplication(assertCuid(req.params["id"]), userId));
    } catch (err) {
      next(err);
    }
  };

  screenApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dto = req.body as ScreenApplicationDto;
      res.json(await this.service.screenApplication(assertCuid(req.params["id"]), dto, userId));
    } catch (err) {
      next(err);
    }
  };

  reinstateApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: actorId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.reinstateApplication(assertCuid(req.params["id"]), actorId));
    } catch (err) {
      next(err);
    }
  };

  offerApplication = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canApprove(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.offerApplication(assertCuid(req.params["id"]), userId));
    } catch (err) {
      next(err);
    }
  };

  // --- Offer 3-stage approval (fix #370) ---

  /**
   * Read the current user's pending approval queue for a given stage.
   *   stage=LEADER      — awaiting my LEADER row (UserDepartment.role='LEADER' in posting dept)
   *   stage=DEPT_HEAD   — awaiting my dept-head row (posting.department.headId=me)
   *   stage=HR          — awaiting HR (canWriteHR gate applies at controller)
   */
  listOfferApprovalQueue = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole, departmentCategories } = requireUser(req);
      const stage = String(req.params["stage"] ?? "").toUpperCase() as "LEADER" | "DEPT_HEAD" | "HR";
      if (!["LEADER", "DEPT_HEAD", "HR"].includes(stage)) throw new AppError(400, "INVALID_STAGE");
      if (stage === "HR" && !canWriteHR(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.listOfferApprovalQueue(userId, role, frontOfficeRole, stage));
    } catch (err) {
      next(err);
    }
  };

  offerLeaderApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId } = requireUser(req);
      res.json(await this.service.leaderApprove(assertCuid(req.params["id"]), userId));
    } catch (err) {
      next(err);
    }
  };

  offerLeaderReject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId } = requireUser(req);
      const { reason } = req.body as { reason?: string };
      res.json(await this.service.leaderReject(assertCuid(req.params["id"]), userId, reason ?? ""));
    } catch (err) {
      next(err);
    }
  };

  offerDeptHeadApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId } = requireUser(req);
      res.json(await this.service.deptHeadApprove(assertCuid(req.params["id"]), userId));
    } catch (err) {
      next(err);
    }
  };

  offerDeptHeadReject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId } = requireUser(req);
      const { reason } = req.body as { reason?: string };
      res.json(await this.service.deptHeadReject(assertCuid(req.params["id"]), userId, reason ?? ""));
    } catch (err) {
      next(err);
    }
  };

  offerHrApprove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteHR(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.hrApprove(assertCuid(req.params["id"]), userId));
    } catch (err) {
      next(err);
    }
  };

  offerHrReject = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: userId, role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWriteHR(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const { reason } = req.body as { reason?: string };
      res.json(await this.service.hrReject(assertCuid(req.params["id"]), userId, reason ?? ""));
    } catch (err) {
      next(err);
    }
  };

  // --- Interview ---

  scheduleInterview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dto = req.body as CreateInterviewDto;
      res.status(201).json(await this.service.scheduleInterview(assertCuid(req.params["id"]), dto, userId));
    } catch (err) {
      next(err);
    }
  };

  updateInterview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const round = req.params["round"] as InterviewRound;
      const dto = req.body as UpdateInterviewDto;
      // SJ4: only HEAD_COACH may assign interviewers
      if (dto.interviewerIds !== undefined) {
        if (!isHeadCoach(role, coachingRole)) {
          throw new AppError(403, "FORBIDDEN_INTERVIEWER_ASSIGNMENT");
        }
      }
      res.json(await this.service.updateInterview(assertCuid(req.params["id"]), round, dto));
    } catch (err) {
      next(err);
    }
  };

  // --- ReferenceCheck ---

  createReferenceCheck = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dto = req.body as CreateReferenceCheckDto;
      res.status(201).json(await this.service.createReferenceCheck(assertCuid(req.params["id"]), dto, userId));
    } catch (err) {
      next(err);
    }
  };

  updateReferenceCheck = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const dto = req.body as UpdateReferenceCheckDto;
      res.json(await this.service.updateReferenceCheck(assertCuid(req.params["id"]), dto));
    } catch (err) {
      next(err);
    }
  };

  // --- Onboarding ---

  startOnboarding = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const { userId } = req.body as { userId: string };
      res.status(201).json(await this.service.startOnboarding(assertCuid(req.params["id"]), userId));
    } catch (err) {
      next(err);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { otp } = req.body as VerifyOtpDto;
      res.json(await this.service.verifyEmail(assertCuid(req.params["id"]), otp));
    } catch (err) {
      next(err);
    }
  };

  completeMfa = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await this.service.completeMfa(assertCuid(req.params["id"])));
    } catch (err) {
      next(err);
    }
  };

  getHeadcountProgress = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, frontOfficeRole, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getHeadcountProgress());
    } catch (err) {
      next(err);
    }
  };

  getTimeToHireStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, frontOfficeRole, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getTimeToHireStats());
    } catch (err) {
      next(err);
    }
  };

  getCostPerHire = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, frontOfficeRole, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getCostPerHire());
    } catch (err) {
      next(err);
    }
  };

  addInterviewerScore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: userId } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const interviewId = Number(req.params["id"]);
      const { interviewerId, scoreSkill, scoreComm, scoreCulture, comment } = req.body as {
        interviewerId: string; scoreSkill?: number; scoreComm?: number; scoreCulture?: number; comment?: string;
      };
      res.status(201).json(await this.service.addInterviewerScore(interviewId, {
        interviewerId,
        ...(scoreSkill !== undefined ? { scoreSkill } : {}),
        ...(scoreComm !== undefined ? { scoreComm } : {}),
        ...(scoreCulture !== undefined ? { scoreCulture } : {}),
        ...(comment !== undefined ? { comment } : {}),
      }, userId));
    } catch (err) {
      next(err);
    }
  };

  getInterviewerScores = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, frontOfficeRole, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.getInterviewerScores(Number(req.params["id"])));
    } catch (err) {
      next(err);
    }
  };

  getInterviewerScoreAggregate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, coachingRole, departmentCategories } = requireUser(req);
      if (!canRead(role, frontOfficeRole, coachingRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const applicationId = assertCuid(req.params["id"]);
      const round = req.params["round"] as InterviewRound;
      res.json(await this.service.getInterviewerScoreAggregate(applicationId, round));
    } catch (err) {
      next(err);
    }
  };

  finalizeInterviewScore = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const applicationId = assertCuid(req.params["id"]);
      const round = req.params["round"] as InterviewRound;
      res.json(await this.service.finalizeInterviewScore(applicationId, round));
    } catch (err) {
      next(err);
    }
  };

  // --- Waitlist (fix #366) ---

  getPostingWaitlist = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWrite(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const postingId = assertCuid(req.params["id"]);
      res.json(await this.service.getWaitlistForPosting(postingId));
    } catch (err) {
      next(err);
    }
  };

  promoteFromWaitlist = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories, id: actorId } = requireUser(req);
      if (!canApprove(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      const applicationId = assertCuid(req.params["id"]);
      res.json(await this.service.promoteFromWaitlist(applicationId, actorId));
    } catch (err) {
      next(err);
    }
  };
}
