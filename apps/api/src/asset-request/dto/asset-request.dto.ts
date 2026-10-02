export interface CreateAssetRequestDto {
  type: "SOFTWARE" | "HARDWARE";
  equipmentItemId?: string;
  softwareLicenseId?: string;
  customName?: string;
  customDescription?: string;
  expenseCategoryId: string;
  expectedAmount: number;
  neededBy?: string;
  justification: string;
}

export interface RejectDto {
  reason: string;
}

export interface ListAssetRequestQuery {
  filter?: "me" | "pending-leader" | "pending-dept-head" | "all";
  status?: string;
}
