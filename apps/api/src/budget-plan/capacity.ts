import { AppError } from "../lib/appError";

export interface CapacityInputs {
  totalOperatingBudget: number | null;
  contingencyReserve: number | null;
}

export function calculateCapacity(
  report: CapacityInputs,
  basicTiers: { cost: number }[],
): number {
  const total = report.totalOperatingBudget ?? 0;
  const contingency = report.contingencyReserve ?? 0;
  const basicSum = basicTiers.reduce((s, t) => s + t.cost, 0);
  return total - basicSum - contingency;
}

export interface CategoryInvariantInput {
  categoryId: string;
  mandatoryMinimum: number;
  basicCost: number;
}

export function validateInvariants(items: CategoryInvariantInput[]): void {
  const violations = items.filter((i) => i.basicCost < i.mandatoryMinimum);
  if (violations.length === 0) return;
  const ids = violations.map((v) => v.categoryId);
  const err = new AppError(400, "BASIC_BELOW_MANDATORY_MIN");
  (err as AppError & { violations: string[] }).violations = ids;
  err.message = `BASIC_BELOW_MANDATORY_MIN: categoryIds=[${ids.join(",")}]`;
  throw err;
}
