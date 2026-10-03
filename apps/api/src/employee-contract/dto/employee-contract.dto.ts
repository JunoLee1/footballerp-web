/**
 * DTOs for the EmployeeContract skeleton (#371).
 *
 * State machine: DRAFT → ISSUED → SIGNED / CANCELLED. Every non-DRAFT
 * transition is validated at the service layer; DTOs stay lean and only
 * carry the caller-supplied fields.
 */

export interface CreateEmployeeContractDto {
  // The dispatch this contract is attached to.
  hiringDispatchId: string;
}

/**
 * `issue` — no body fields; the multer-uploaded file *is* the payload.
 * Kept as an exported interface for symmetry / documentation.
 */
export type IssueEmployeeContractDto = Record<string, never>;

export interface SignEmployeeContractDto {
  // ISO-8601 date/datetime string. Actual signing date (human input from the
  // scanned page), not the upload timestamp — surfaces `signedAt` on the
  // record so audit reports use the real calendar date.
  signedAt: string;
}

export interface CancelEmployeeContractDto {
  cancelReason: string;
}

// Repo-layer input shapes (actor id resolved from the authenticated request).

export interface CreateDraftData {
  hiringDispatchId: string;
  createdById: string;
}

export interface IssueData {
  fileUrl: string;
  fileName: string;
  issuedById: string;
}

export interface SignData {
  signedFileUrl: string;
  signedFileName: string;
  signedAt: Date;
  signedConfirmedById: string;
}

export interface CancelData {
  cancelReason: string;
  cancelledById: string;
}
