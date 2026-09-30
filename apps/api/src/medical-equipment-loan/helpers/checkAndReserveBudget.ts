import { Prisma } from "../../generated/client";
import { AppError } from "../../lib/appError";

interface ReserveBudgetResult {
  operatingExpenseId: string;
}

/**
 * BudgetLine remaining 검증 후 OperatingExpense(PENDING) 생성.
 * $transaction 안에서 호출해야 함.
 *
 * (Grill Q6) finalCost=0 (무상) 이어도 OperatingExpense 기록 — 회계 일관성.
 * (Grill Q9) 응급 경로에서는 호출 skip; 사후 승인 시 backfill 로 이 함수 재사용.
 */
export async function checkAndReserveBudget(
  tx: Prisma.TransactionClient,
  params: {
    budgetLineId: string;
    amount: number;
    seasonId: number;
    categoryId: number;
    departmentId: number;
    createdById: string;
    note?: string;
  }
): Promise<ReserveBudgetResult> {
  const { budgetLineId, amount, seasonId, categoryId, departmentId, createdById, note } = params;

  const budgetLine = await tx.budgetLine.findUnique({
    where: { id: budgetLineId },
    select: { id: true, originalAmount: true, departmentId: true, year: true },
  });

  if (!budgetLine) {
    throw new AppError(404, "BUDGET_LINE_NOT_FOUND");
  }

  if (budgetLine.departmentId !== departmentId) {
    throw new AppError(400, "BUDGET_LINE_DEPT_MISMATCH");
  }

  const spentAgg = await tx.operatingExpense.aggregate({
    where: {
      budgetLineId,
      status: { in: ["PENDING", "APPROVED"] },
    },
    _sum: { amount: true },
  });

  const spent = Number(spentAgg._sum.amount ?? 0);
  const remaining = budgetLine.originalAmount - spent;

  if (remaining < amount) {
    throw new AppError(400, "BUDGET_EXCEEDED");
  }

  const expense = await tx.operatingExpense.create({
    data: {
      seasonId,
      categoryId,
      amount,
      budgetLineId,
      departmentId,
      createdById,
      date: new Date(),
      note: note ?? "의무기기 대여",
      status: "PENDING",
    },
  });

  return { operatingExpenseId: expense.id };
}
