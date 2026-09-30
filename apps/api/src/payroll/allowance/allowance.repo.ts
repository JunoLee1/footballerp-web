import type { PrismaClient } from "../../generated/client";
import type { CreateAllowanceDto, UpdateAllowanceDto } from "./dto/allowance.dto";

export class AllowanceRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(staffSalaryId: string) {
    return this.prisma.staffAllowance.findMany({
      where: { staffSalaryId },
      orderBy: { createdAt: "asc" },
    });
  }

  findById(id: number) {
    return this.prisma.staffAllowance.findUnique({ where: { id } });
  }

  create(staffSalaryId: string, data: CreateAllowanceDto) {
    return this.prisma.staffAllowance.create({
      data: {
        staffSalaryId,
        name: data.name,
        amount: data.amount,
        taxable: data.taxable ?? true,
      },
    });
  }

  update(id: number, data: UpdateAllowanceDto) {
    return this.prisma.staffAllowance.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.taxable !== undefined && { taxable: data.taxable }),
      },
    });
  }

  remove(id: number) {
    return this.prisma.staffAllowance.delete({ where: { id } });
  }
}
