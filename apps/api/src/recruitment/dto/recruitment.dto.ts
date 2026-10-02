import type {
  JobPostingStatus,
  JobApplicationStatus,
  InterviewRound,
  InterviewResult,
  ReferenceCheckResult,
  ApplicationSource,
} from "../../generated/enums";

export interface CreateJobPostingDto {
  title: string;
  departmentId?: string;
  headcount?: number;
  description: string;
  planReportId: string;
  hiringPlanItemId: string;
  // Free-form list of document types HR must approve before the resulting
  // HiringDispatch can execute (fix #372). Empty/omitted = no gate.
  requiredDocuments?: string[];
}

export interface UpdateJobPostingDto {
  title?: string;
  departmentId?: string;
  headcount?: number;
  description?: string;
  requiredDocuments?: string[];
}

export interface JobPostingListQuery {
  status?: JobPostingStatus;
}

export interface CreateJobApplicationDto {
  applicantName: string;
  email: string;
  phone?: string;
  resumeUrl?: string;
  source: ApplicationSource;
}

export interface UpdateJobApplicationDto {
  applicantName?: string;
  email?: string;
  phone?: string;
  resumeUrl?: string;
  status?: "SCREENING";
}

export interface CreateInterviewDto {
  round: InterviewRound;
  scheduledAt?: string;
  interviewerIds?: string[];
}

export interface UpdateInterviewDto {
  scheduledAt?: string;
  interviewerIds?: string[];
  scoreSkill?: number;
  scoreComm?: number;
  scoreCulture?: number;
  comment?: string;
  result?: InterviewResult;
  overrideThreshold?: boolean;
  overrideReason?: string;
}

export interface CreateReferenceCheckDto {
  contactName: string;
  relationship: string;
  notes?: string;
}

export interface UpdateReferenceCheckDto {
  result?: ReferenceCheckResult;
  notes?: string;
}

export interface VerifyOtpDto {
  otp: string;
}

export interface ScreenApplicationDto {
  result: "PENDING" | "PASS" | "FAIL";
  notes?: string;
}
