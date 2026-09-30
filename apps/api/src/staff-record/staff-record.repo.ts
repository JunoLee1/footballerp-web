import { PrismaClient } from "../generated/client";

export class StaffRecordRepository {
  constructor(private prisma: PrismaClient) {}

  async findAll(includeInactive = false) {
    return this.prisma.staffRecord.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { department: { include: { parent: { select: { id: true, name: true } } } } },
      orderBy: { name: "asc" },
    });
  }

  async findById(id: number) {
    return this.prisma.staffRecord.findUnique({
      where: { id },
      include: { department: { include: { parent: { select: { id: true, name: true } } } } },
    });
  }

  async create(data: {
    name: string;
    role: string;
    departmentId?: number;
    phone?: string;
    notes?: string;
    createdById: string;
  }) {
    return this.prisma.staffRecord.create({
      data,
      include: { department: { include: { parent: { select: { id: true, name: true } } } } },
    });
  }

  async update(
    id: number,
    data: {
      name?: string;
      role?: string;
      departmentId?: number | null;
      phone?: string;
      isActive?: boolean;
      notes?: string;
    }
  ) {
    return this.prisma.staffRecord.update({
      where: { id },
      data,
      include: { department: { include: { parent: { select: { id: true, name: true } } } } },
    });
  }

  countLinkedSalaries(staffRecordId: number) {
    return this.prisma.staffSalary.count({ where: { staffRecordId } });
  }

  async delete(id: number) {
    return this.prisma.staffRecord.delete({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.staffRecord.findFirst({ where: { email } });
  }

  findByEmployeeId(employeeId: string) {
    return this.prisma.staffRecord.findFirst({ where: { employeeId } });
  }

  terminate(id: number, terminatedAt: Date) {
    return this.prisma.staffRecord.update({
      where: { id },
      data: { terminatedAt, isActive: false, employmentEndDate: terminatedAt } as any,
      include: { department: { include: { parent: { select: { id: true, name: true } } } } },
    });
  }
}
