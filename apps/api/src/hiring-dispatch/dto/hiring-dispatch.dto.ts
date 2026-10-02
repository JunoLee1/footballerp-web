export interface CreateHiringDispatchDto {
  applicationId?: string;
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  jobGrade: "INTERN" | "JUNIOR" | "ASSOCIATE" | "MANAGER" | "DIRECTOR" | "EXECUTIVE";
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | "ADVISOR";
  departmentId: string;
  reportsToUserId?: string;
  // BigInt over the wire — accept number or string; service converts.
  monthlySalary: number | string;
  startDate: string;
  // Role enum value (e.g., "FRONT_OFFICE", "COACHING_STAFF", "ADMIN").
  targetRole: string;
  targetFrontOfficeRole?: string;
  targetCoachingRole?: string;
  permissionNotes?: string;
  // Application-free dispatches carry their own list of required documents
  // that HR must upload + approve before EXECUTION (#372). Ignored when
  // applicationId is set (posting.requiredDocuments is authoritative there).
  requiredDocuments?: string[];
}

export interface BudgetReverifyDto {
  toOverride?: boolean;
  offerMismatchOverride?: boolean;
}

export interface RejectDto {
  reason: string;
}

export interface CancelDto {
  reason: string;
}

export interface ListHiringDispatchQuery {
  filter?: "me" | "pending-budget" | "pending-dispatch" | "pending-execution" | "all";
  status?: string;
}
