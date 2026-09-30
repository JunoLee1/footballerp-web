import type { Prisma } from "../generated/client";

/**
 * ADR 0023 · issue #474
 *
 * Called from `plan-request.service.ts::finalize()` and `gmApprove()` inside
 * their $transaction (Q2 in-tx). Converts the finalized editorial plan
 * (`BudgetCategoryPlan.mandatoryMinimum + knapsackAllocated`) into the
 * spending-control ground truth (`BudgetHeader`/`BudgetLine.originalAmount`).
 *
 * Contract:
 *  - Any existing APPROVED `BudgetHeader` on this season → transitions to
 *    LOCKED (audit trail preserved, Q3). Multiple concurrently-APPROVED
 *    headers should never happen, but if they do all get locked.
 *  - New header is created at `max(version) + 1` (Q3 re-plan path). status
 *    is APPROVED, approvedBy/approvedAt = caller.
 *  - Each `BudgetCategoryPlan` becomes one `BudgetLine` with
 *    `originalAmount = mandatoryMinimum + (knapsackAllocated ?? 0)`.
 *  - `departmentId = null` (Q5-B MVP). Departmental split is a follow-up.
 *  - Zero-category season → empty header (lineCount=0). Emits a warn log so
 *    the FM can spot mis-configured seasons.
 *
 * MUST run inside the same transaction as the `FinancialReport.planStatus →
 * FINALIZED` update — if BudgetHeader creation fails the plan status roll
 * back with it.
 */
export async function autoGenBudgetHeaderFromPlan(
  seasonId: number,
  actorUserId: string,
  tx: Prisma.TransactionClient,
): Promise<{ headerId: string; lineCount: number }> {
  // 1) FinancialReport + BudgetCategoryPlan[] fetch (categoryId, planned amounts).
  const report = await tx.financialReport.findUnique({
    where: { seasonId },
    include: {
      budgetCategoryPlans: {
        select: {
          categoryId: true,
          mandatoryMinimum: true,
          knapsackAllocated: true,
        },
      },
    },
  });
  if (!report) throw new Error("FINANCIAL_REPORT_NOT_FOUND");

  // 2) Season → year (BudgetLine.year is required, use startDate as anchor).
  const season = await tx.season.findUnique({
    where: { id: seasonId },
    select: { startDate: true },
  });
  if (!season) throw new Error("SEASON_NOT_FOUND");
  const year = new Date(season.startDate).getFullYear();

  // 3) LOCK any currently-APPROVED BudgetHeader on this season. Multiple is
  //    unexpected (single active version invariant) but we lock all to be
  //    defensive on the audit trail.
  await tx.budgetHeader.updateMany({
    where: { seasonId, status: "APPROVED" },
    data: { status: "LOCKED" },
  });

  // 4) Compute next version. Matches PR #468 pattern
  //    (budget-automation.repo.createHeaderWithLines).
  const latest = await tx.budgetHeader.findFirst({
    where: { seasonId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  // 5) Materialise the lines. mandatoryMinimum defaults to 0 in the schema,
  //    knapsackAllocated is nullable when knapsack hasn't produced an
  //    allocation for that category → treat as 0.
  const categoryPlans = report.budgetCategoryPlans;
  const lineData = categoryPlans.map((cp) => ({
    categoryId: cp.categoryId,
    originalAmount: cp.mandatoryMinimum + (cp.knapsackAllocated ?? 0),
  }));
  const totalBudget = lineData.reduce((sum, l) => sum + l.originalAmount, 0);

  // 6) Create the new APPROVED header. `name` is Korean-language so the
  //    dashboard "editorial confirmation" view surfaces it verbatim.
  const now = new Date();
  const header = await tx.budgetHeader.create({
    data: {
      seasonId,
      version: nextVersion,
      status: "APPROVED",
      name: `${year} 시즌 편성 확정 v${nextVersion}`,
      totalBudget,
      createdById: actorUserId,
      approvedById: actorUserId,
      approvedAt: now,
    },
  });

  // 7) Populate lines. Empty (no categories) → skip createMany but keep the
  //    empty header for audit. Warn so the FM notices a mis-set season.
  if (lineData.length > 0) {
    await tx.budgetLine.createMany({
      data: lineData.map((l) => ({
        budgetHeaderId: header.id,
        categoryId: l.categoryId,
        originalAmount: l.originalAmount,
        year,
        departmentId: null,
      })),
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `[autoGenBudgetHeaderFromPlan] season=${seasonId} has zero BudgetCategoryPlan rows; created empty BudgetHeader v${nextVersion}.`,
    );
  }

  return { headerId: header.id, lineCount: lineData.length };
}
