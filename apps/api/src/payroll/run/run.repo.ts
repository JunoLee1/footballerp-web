import type { PrismaClient } from "../../generated/client";

export class RunRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(staffSalaryId: number) {
    return this.prisma.payrollRun.findMany({
      where: { staffSalaryId },
      orderBy: { month: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.payrollRun.findUnique({ where: { id } });
  }

  findByMonth(staffSalaryId: number, month: Date) {
    return this.prisma.payrollRun.findUnique({
      where: { staffSalaryId_month: { staffSalaryId, month } },
    });
  }

  create(data: {
    staffSalaryId: number;
    month: Date;
    grossPay: number;
    totalDeductions: number;
    netPay: number;
  }) {
    return this.prisma.payrollRun.create({
      data: {
        staffSalaryId: data.staffSalaryId,
        month: data.month,
        grossPay: data.grossPay,
        totalDeductions: data.totalDeductions,
        netPay: data.netPay,
      },
    });
  }

  update(id: number, data: { status: "CONFIRMED"; confirmedById: string; confirmedAt: Date }) {
    return this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: data.status,
        confirmedById: data.confirmedById,
        confirmedAt: data.confirmedAt,
      },
    });
  }
}
