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

  async findById(id: string) {
    return this.prisma.staffRecord.findUnique({
      where: { id },
      include: { department: { include: { parent: { select: { id: true, name: true } } } } },
    });
  }

  async create(data: {
    name: string;
    role: string;
    departmentId?: string;
    phone?: string;
    notes?: string;
    createdById: string;
    email?: string;
    employeeId?: string;
    employmentStartDate?: Date;
  }) {
    return this.prisma.staffRecord.create({
      data,
      include: { department: { include: { parent: { select: { id: true, name: true } } } } },
    });
  }

  async update(
    id: string,
    data: {
      name?: string;
      role?: string;
      departmentId?: string | null;
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

  countLinkedSalaries(staffRecordId: string) {
    return this.prisma.staffSalary.count({ where: { staffRecordId } });
  }

  async delete(id: string) {
    return this.prisma.staffRecord.delete({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.staffRecord.findFirst({ where: { email } }); //TODO:first 보다 unique가 더 맞지 않는지?
  }

  findByEmployeeId(employeeId: string) {
    return this.prisma.staffRecord.findFirst({ where: { employeeId } }); //TODO:first 보다 unique가 더 맞지 않는지?
  }

  terminate(id: string, terminatedAt: Date) {
    return this.prisma.staffRecord.update({
      where: { id },
      data: { terminatedAt, isActive: false, employmentEndDate: terminatedAt },
      include: { department: { include: { parent: { select: { id: true, name: true } } } } },
    });
  }
}
