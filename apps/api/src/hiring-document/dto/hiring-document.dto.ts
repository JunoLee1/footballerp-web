import type { HiringDocReviewStatus } from "../../generated/enums";

/**
 * XOR contract: exactly one of `applicationId` / `hiringDispatchId` must be
 * supplied. Enforced in service.upload() (400 XOR_TARGET_REQUIRED). Matches
 * the dual-reference pattern used by Onboarding — Application-path is the
 * default; Dispatch-path is for 임원 스카웃 (application-free) cases (Q6).
 */
export interface UploadHiringDocumentDto {
  applicationId?: string;
  hiringDispatchId?: string;
  docType: string; // free-form; trimmed at service boundary (Q10)
}

/**
 * PENDING is the initial state written by upload(); review() flips it to
 * APPROVED or REJECTED (never back to PENDING — that would be an amendment,
 * which the append-only design handles via a new row).
 */
export interface ReviewHiringDocumentDto {
  status: Extract<HiringDocReviewStatus, "APPROVED" | "REJECTED">;
  reviewNotes?: string; // required (non-empty) when REJECTED — service enforces
}

export interface ListHiringDocumentsQuery {
  applicationId?: string;
  hiringDispatchId?: string;
}

export interface ListHiringDocumentHistoryQuery {
  applicationId?: string;
  hiringDispatchId?: string;
  docType: string;
}
