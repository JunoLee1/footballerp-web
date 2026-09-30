import { PrismaClient } from "../generated/client";
import type { CreateBudgetHeaderDto, UpdateBudgetHeaderDto, CreateBudgetLineDto, UpdateBudgetLineDto, CreateAdjustmentDto } from "./dto/budget-control.dto";

export class BudgetControlRepository {
  constructor(private prisma: PrismaClient) {}

  async createHeader(dto: CreateBudgetHeaderDto, createdById: string) {
    // BudgetHeader @@unique([seasonId, version]) — 같은 시즌 재실행 시 version 자동 증가
    const latest = await this.prisma.budgetHeader.findFirst({
      where: { seasonId: dto.seasonId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    return this.prisma.budgetHeader.create({
      data: {
        seasonId: dto.seasonId,
        version: nextVersion,
        name: dto.name,
        totalBudget: dto.totalBudget,
        note: dto.note ?? null,
        createdById,
      },
      include: { lines: true, adjustments: true },
    });
  }

  findAll(seasonId?: number) {
    return this.prisma.budgetHeader.findMany({
      ...(seasonId ? { where: { seasonId } } : {}),
      include: { season: { select: { id: true, name: true } }, createdBy: { select: { id: true, username: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string) {
    return this.prisma.budgetHeader.findUnique({
      where: { id },
      include: {
        lines: { include: { department: { select: { id: true, name: true } }, expenseCategory: { select: { code: true } } } },
        adjustments: {
          include: {
            createdBy: { select: { id: true, username: true } },
            approvedBy: { select: { id: true, username: true } },
          },
        },
        season: { select: { id: true, name: true } },
        createdBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });
  }

  updateStatus(id: string, status: "SUBMITTED" | "APPROVED" | "LOCKED", approverId?: string) {
    return this.prisma.budgetHeader.update({
      where: { id },
      data: {
        status,
        ...(status === "APPROVED" && approverId
          ? { approvedById: approverId, approvedAt: new Date() }
          : {}),
      },
    });
  }

  updateHeader(id: string, data: UpdateBudgetHeaderDto) {
    return this.prisma.budgetHeader.update({ where: { id }, data });
  }

  createLine(budgetHeaderId: string, dto: CreateBudgetLineDto & { categoryId: number }) {
    const { category: _category, ...rest } = dto;
    return this.prisma.budgetLine.create({
      data: {
        budgetHeaderId,
        ...rest,
      },
    });
  }

  updateLine(lineId: string, data: UpdateBudgetLineDto) {
    return this.prisma.budgetLine.update({ where: { id: lineId }, data });
  }

  deleteLine(lineId: string) {
    return this.prisma.budgetLine.delete({ where: { id: lineId } });
  }

  createAdjustment(budgetHeaderId: string, dto: CreateAdjustmentDto, createdById: string) {
    return this.prisma.budgetAdjustment.create({
      data: { budgetHeaderId, ...dto, createdById },
      include: {
        createdBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });
  }

  updateAdjustmentStatus(id: string, status: "APPROVED" | "REJECTED", approverId: string) {
    return this.prisma.budgetAdjustment.update({
      where: { id },
      data: {
        status,
        approvedById: approverId,
        approvedAt: new Date(),
      },
      include: {
        createdBy: { select: { id: true, username: true } },
        approvedBy: { select: { id: true, username: true } },
      },
    });
  }

  sumApprovedAdjustments(budgetHeaderId: string) {
    return this.prisma.budgetAdjustment.groupBy({
      by: ["type"],
      where: { budgetHeaderId, status: "APPROVED" },
      _sum: { amount: true },
    });
  }

  async sumCommitmentAndActual(seasonId: number) {
    const rows = await this.prisma.operatingExpense.findMany({
      where: { seasonId, deletedAt: null },
      select: { amount: true, paidAt: true, expenseCategory: { select: { code: true } } },
    });

    let commitment = 0;
    let actual = 0;
    const byCategory: Record<string, number> = {};

    for (const row of rows) {
      const cat = row.expenseCategory.code;
      byCategory[cat] = (byCategory[cat] ?? 0) + row.amount;
      if (row.paidAt === null) commitment += row.amount;
      else actual += row.amount;
    }

    return { commitment, actual, byCategory };
  }
}
