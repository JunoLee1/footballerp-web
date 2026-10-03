import type { TriggerType } from "../generated/client";

// ADR 0020: Trigger multiplier values
export const TRIGGER_MULTIPLIER: Record<TriggerType, number> = {
  MULTI_LOCATION: 1.0,
  DIRECT_BUSINESS: 1.2,
  PUBLIC_UTILITY: 1.2,
  HOME_MATCH: 1.5,
  WEEKEND_OVERTIME: 1.3,
};

const WEIGHT_TRIGGERS = new Set<TriggerType>([
  "MULTI_LOCATION",
  "DIRECT_BUSINESS",
  "PUBLIC_UTILITY",
]);
const ADDITIONAL_TRIGGERS = new Set<TriggerType>(["HOME_MATCH", "WEEKEND_OVERTIME"]);

export function isWeightTrigger(t: TriggerType): boolean {
  return WEIGHT_TRIGGERS.has(t);
}

export function isAdditionalTrigger(t: TriggerType): boolean {
  return ADDITIONAL_TRIGGERS.has(t);
}

export function calculateTierValue(deltaCost: number, triggers: TriggerType[]): number {
  const total = triggers.reduce((sum, t) => sum + TRIGGER_MULTIPLIER[t], 0);
  return Math.round(deltaCost * total);
}

export interface PromoteLineInput {
  categoryId: string;
  triggers: TriggerType[];
  standardDelta: number;
  premiumDelta: number;
}

export interface PromotedTier {
  categoryId: string;
  name: "Basic" | "Standard" | "Premium";
  cost: number;
  value: number;
  sortOrder: number;
  isSelected: boolean;
}

// ADR 0019: 트리거 → 티어 승격 룰
// - 트리거 없음 → Basic 만 (강제 배정)
// - 가중 사유 ≥1 → Standard 후보
// - 가산 사유 ≥1 → Premium 후보
export function promoteTiers(
  lines: PromoteLineInput[],
  basicCosts: Map<string, number>,
): PromotedTier[] {
  const output: PromotedTier[] = [];

  for (const line of lines) {
    const basic = basicCosts.get(line.categoryId);
    if (basic === undefined) continue;

    const hasWeight = line.triggers.some(isWeightTrigger);
    const hasAdditional = line.triggers.some(isAdditionalTrigger);

    output.push({
      categoryId: line.categoryId,
      name: "Basic",
      cost: basic,
      value: 0,
      sortOrder: 0,
      isSelected: true,
    });

    if (!hasWeight && !hasAdditional) continue;

    // Standard 후보 (가중 ≥1 or 가산 ≥1 이면 승격)
    const standardCost = basic + line.standardDelta;
    output.push({
      categoryId: line.categoryId,
      name: "Standard",
      cost: standardCost,
      value: calculateTierValue(line.standardDelta, line.triggers),
      sortOrder: 1,
      isSelected: false,
    });

    if (!hasAdditional) continue;

    // Premium 후보 (가산 ≥1 있을 때만)
    const premiumCost = standardCost + line.premiumDelta;
    output.push({
      categoryId: line.categoryId,
      name: "Premium",
      cost: premiumCost,
      value: calculateTierValue(line.premiumDelta, line.triggers),
      sortOrder: 2,
      isSelected: false,
    });
  }

  return output;
}
