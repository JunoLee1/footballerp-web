import type { PrismaClient } from "../../generated/client";
import type { CreateSalaryDto, UpdateSalaryDto, SalaryListQuery } from "./dto/salary.dto";

export class SalaryRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: SalaryListQuery) {
    return this.prisma.staffSalary.findMany({
      where: { ...(query.country && { country: query.country }) },
      include: { allowances: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: number) {
    return this.prisma.staffSalary.findUnique({
      where: { id },
      include: { allowances: { orderBy: { createdAt: "asc" } } },
    });
  }

  create(data: CreateSalaryDto) {
    return this.prisma.staffSalary.create({
      data: {
        baseSalary: data.baseSalary,
        country: data.country,
        effectiveFrom: new Date(data.effectiveFrom),
        ...(data.userId !== undefined && { userId: data.userId }),
        ...(data.staffRecordId !== undefined && { staffRecordId: data.staffRecordId }),
      },
      include: { allowances: true },
    });
  }

  closeActive(userId: string | null | undefined, staffRecordId: number | null | undefined, effectiveTo: Date) {
    return this.prisma.staffSalary.updateMany({
      where: {
        ...(userId != null ? { userId } : {}),
        ...(staffRecordId != null ? { staffRecordId } : {}),
        effectiveTo: null,
      },
      data: { effectiveTo },
    });
  }

  update(id: number, data: UpdateSalaryDto) {
    return this.prisma.staffSalary.update({
      where: { id },
      data: {
        ...(data.baseSalary !== undefined && { baseSalary: data.baseSalary }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
      },
      include: { allowances: { orderBy: { createdAt: "asc" } } },
    });
  }
}
