// apps/api/src/budget-automation/budget-automation.service.ts

import { getSeasonRevenueActuals } from "../lib/season-actuals";
import { AppError } from "../lib/appError";
import type { BudgetAutomationRepository } from "./budget-automation.repo";
import type { ExpenseCategoryService } from "../expense-category/expense-category.service";
import {
  GOAL_MULTIPLIER,
  REVENUE_KEYS,
  type BudgetApplyRequestDto,
  type BudgetPreviewRequestDto,
  type BudgetPreviewResponse,
  type CategoryPrediction,
  type GoalWeight,
} from "./dto/budget-automation.dto";

function computeCagr(chronoValues: number[]): { cagr: number; warning?: "INSUFFICIENT_DATA" | "HIGH_VOLATILITY" } {
  const nonZero = chronoValues.filter((v) => v > 0);
  if (nonZero.length < 2) return { cagr: 0, warning: "INSUFFICIENT_DATA" };

  const earliest = nonZero[0]!;
  const latest = nonZero[nonZero.length - 1]!;
  const n = nonZero.length - 1;
  const cagr = Math.pow(latest / earliest, 1 / n) - 1;

  const hasHighVol = nonZero.some((v, i) => {
    if (i === 0) return false;
    return Math.abs((v - nonZero[i - 1]!) / nonZero[i - 1]!) > 0.3;
  });

  if (hasHighVol) return { cagr, warning: "HIGH_VOLATILITY" as const };
  return { cagr };
}

function predict(base: number, cagr: number, inflation: number, goal: GoalWeight): number {
  return Math.round(base * (1 + cagr) * (1 + inflation) * GOAL_MULTIPLIER[goal]);
}

export class BudgetAutomationService {
  constructor(
    private repo: BudgetAutomationRepository,
    private categoryService: ExpenseCategoryService,
  ) {}

  async preview(dto: BudgetPreviewRequestDto): Promise<BudgetPreviewResponse> {
    const lookback = dto.lookback ?? 3;
    const inflation = dto.inflation ?? 0.03;

    const targetSeason = await this.repo.getTargetSeason(dto.targetSeasonId);
    if (!targetSeason) throw new AppError(404, "SEASON_NOT_FOUND");

    const pastSeasons = await this.repo.getPastSeasons(targetSeason.startDate, lookback);
    // 과거 시즌 데이터 없으면 empty predictions (predicted=0, dataPoints=0, warning=INSUFFICIENT_DATA) 로 200 반환.
    // FE 는 seasonsUsed === 0 으로 감지해 수동 입력 UX 로 fallback. apply() 는 별도 guard.

    // pastSeasons is ordered DESC (most recent first); reverse for chronological order
    const chronoSeasonIds = pastSeasons.map((s) => s.id).reverse();
    const pastSeasonIds = pastSeasons.map((s) => s.id);
    const mostRecentSeasonId = pastSeasonIds[0] ?? null;

    const [perSeasonActuals, expenseRows, budgetLines] = await Promise.all([
      Promise.all(chronoSeasonIds.map((id) => getSeasonRevenueActuals(id))),
      pastSeasonIds.length > 0
        ? this.repo.getExpenseActualsByCategory(pastSeasonIds)
        : Promise.resolve([]),
      mostRecentSeasonId != null
        ? this.repo.getLatestApprovedBudgetLines(mostRecentSeasonId)
        : Promise.resolve([]),
    ]);

    // perSeasonActuals[i] corresponds to chronoSeasonIds[i] (oldest → newest)

    // ── Revenue predictions ────────────────────────────────────────────────
    const revenueByCat: Record<string, CategoryPrediction> = {};
    let revenueTotal = 0;

    for (const key of REVENUE_KEYS) {
      const chronoValues = perSeasonActuals.map((a) => Number(a[key] ?? 0));
      const { cagr, warning } = computeCagr(chronoValues);
      const base = chronoValues[chronoValues.length - 1] ?? 0;
      const predicted = predict(base, cagr, inflation, dto.revenueGoal);
      revenueTotal += predicted;
      revenueByCat[key] = {
        predicted,
        cagr: Math.round(cagr * 10000) / 10000,
        dataPoints: chronoValues.filter((v) => v > 0).length,
        ...(warning ? { warning } : {}),
      };
    }

    // ── Expense predictions ────────────────────────────────────────────────
    // Translate categoryId → code up front so expenseMap / budgetByCat stay keyed by code.
    const activeCategories = await this.categoryService.listActive();
    const allCategories = await this.categoryService.listAll();
    const codeById = new Map(allCategories.map((c) => [c.id, c.code]));

    const expenseMap: Record<string, Record<number, number>> = {};
    for (const row of expenseRows) {
      const code = codeById.get(row.categoryId);
      if (!code) continue;
      if (!expenseMap[code]) expenseMap[code] = {};
      expenseMap[code][row.seasonId] = Number(row._sum.amount ?? 0);
    }

    const budgetByCat = new Map<string, number>();
    for (const l of budgetLines) {
      const code = codeById.get(l.categoryId);
      if (!code) continue;
      budgetByCat.set(code, l.originalAmount);
    }

    const expenseByCat: Record<string, CategoryPrediction> = {};
    let expenseTotal = 0;

    for (const catRow of activeCategories) {
      const cat = catRow.code;
      const chronoValues = chronoSeasonIds.map((id) => expenseMap[cat]?.[id] ?? 0);
      const { cagr, warning: cagrWarning } = computeCagr(chronoValues);
      const base = chronoValues[chronoValues.length - 1] ?? 0;
      const goalForCat = dto.categoryOverrides?.[cat] ?? dto.expenseGoal;
      const predicted = predict(base, cagr, inflation, goalForCat);
      expenseTotal += predicted;

      const budgeted = budgetByCat.get(cat) ?? 0;
      const recentActual = mostRecentSeasonId != null ? expenseMap[cat]?.[mostRecentSeasonId] ?? 0 : 0;
      const isLowUtil = budgeted > 0 && recentActual < budgeted * 0.5;

      const warning = isLowUtil ? "LOW_UTILIZATION" : cagrWarning;

      expenseByCat[cat] = {
        predicted,
        cagr: Math.round(cagr * 10000) / 10000,
        dataPoints: chronoValues.filter((v) => v > 0).length,
        ...(warning ? { warning } : {}),
      };
    }

    return {
      revenue: {
        total: revenueTotal,
        byCategory: revenueByCat as BudgetPreviewResponse["revenue"]["byCategory"],
      },
      expense: {
        total: expenseTotal,
        byCategory: expenseByCat as BudgetPreviewResponse["expense"]["byCategory"],
      },
      parameters: {
        targetSeasonId: dto.targetSeasonId,
        lookback,
        inflation,
        revenueGoal: dto.revenueGoal,
        expenseGoal: dto.expenseGoal,
        categoryOverrides: dto.categoryOverrides ?? {},
        seasonsUsed: chronoSeasonIds.length,
      },
    };
  }

  async apply(dto: BudgetApplyRequestDto, createdById: string) {
    const previewResult = await this.preview(dto);
    // 과거 데이터 없으면 preview 는 empty predictions 로 200 응답하지만, apply 는 실측 기반 예산 확정이므로
    // 수동 입력 없이는 의미 없는 0-line BudgetHeader 가 생성됨. 명시적 400 으로 차단.
    if (previewResult.parameters.seasonsUsed === 0) {
      throw new AppError(400, "NO_HISTORICAL_DATA");
    }
    const targetSeason = await this.repo.getTargetSeason(dto.targetSeasonId);
    const year = new Date(targetSeason!.startDate).getFullYear();

    const entries = Object.entries(previewResult.expense.byCategory) as [string, CategoryPrediction][];
    const lines = await Promise.all(
      entries.map(async ([cat, pred]) => ({
        categoryId: await this.categoryService.resolveCategoryId(cat),
        originalAmount: pred.predicted,
        year,
      }))
    );

    const totalBudget = lines.reduce((sum, l) => sum + l.originalAmount, 0);

    return this.repo.createHeaderWithLines(
      {
        seasonId: dto.targetSeasonId,
        name: dto.name,
        totalBudget,
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        createdById,
      },
      lines
    );
  }
}
