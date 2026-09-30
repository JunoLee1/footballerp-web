export interface KnapsackTier {
  tierId: string;
  cost: number;
  value: number;
}

export interface KnapsackGroup {
  categoryPlanId: string;
  category: string;
  tiers: KnapsackTier[];
}

export interface KnapsackInput {
  capacity: number;
  groups: KnapsackGroup[];
}

export interface SelectedTier {
  tierId: string;
  categoryPlanId: string;
  allocated: number;
}

export interface KnapsackResult {
  selectedTiers: SelectedTier[];
  totalCost: number;
  totalValue: number;
}

export class KnapsackService {
  // Multiple-choice Knapsack: pick at most one tier per category
  // N≤6, K≤3 → 4^6=4096 combinations: brute-force is sufficient
  solve(input: KnapsackInput): KnapsackResult {
    const { capacity, groups } = input;
    if (capacity <= 0 || groups.length === 0) {
      return { selectedTiers: [], totalCost: 0, totalValue: 0 };
    }

    let bestValue = 0;
    let bestSelection: (KnapsackTier | null)[] = groups.map(() => null);
    const selection: (KnapsackTier | null)[] = groups.map(() => null);

    const search = (idx: number, remaining: number, value: number) => {
      if (idx === groups.length) {
        if (value > bestValue) {
          bestValue = value;
          bestSelection = [...selection];
        }
        return;
      }
      // skip this category
      selection[idx] = null;
      search(idx + 1, remaining, value);

      // try each tier
      for (const tier of groups[idx]!.tiers) {
        if (tier.cost <= remaining) {
          selection[idx] = tier;
          search(idx + 1, remaining - tier.cost, value + tier.value);
          selection[idx] = null;
        }
      }
    };

    search(0, capacity, 0);

    const selectedTiers: SelectedTier[] = [];
    for (let i = 0; i < groups.length; i++) {
      const tier = bestSelection[i];
      if (tier != null) {
        selectedTiers.push({
          tierId: tier.tierId,
          categoryPlanId: groups[i]!.categoryPlanId,
          allocated: tier.cost,
        });
      }
    }

    return {
      selectedTiers,
      totalCost: selectedTiers.reduce((s, t) => s + t.allocated, 0),
      totalValue: bestValue,
    };
  }
}
