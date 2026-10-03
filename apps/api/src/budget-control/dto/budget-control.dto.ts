export interface CreateBudgetHeaderDto {
  seasonId: number;
  name: string;
  totalBudget: number;
  note?: string;
}

export interface UpdateBudgetHeaderDto {
  name?: string;
  totalBudget?: number;
  note?: string;
}

export interface CreateBudgetLineDto {
  departmentId?: string;
  category: string;
  year: number;
  month?: number;
  originalAmount: number;
  note?: string;
}

export interface UpdateBudgetLineDto {
  originalAmount?: number;
  note?: string;
}

export interface CreateAdjustmentDto {
  type: 'CARRYOVER' | 'INCREASE' | 'DECREASE' | 'TRANSFER';
  amount: number;
  fromLineId?: number;
  toLineId?: number;
  reason: string;
}
