import type { PrismaClient } from "../generated/client";
import type { CreateSoftwareLicenseDto, UpdateSoftwareLicenseDto } from "./dto/software-license.dto";

export class SoftwareLicenseRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.softwareLicense.findMany({ orderBy: { createdAt: "desc" } });
  }

  findById(id: number) {
    return this.prisma.softwareLicense.findUnique({ where: { id } });
  }

  create(data: CreateSoftwareLicenseDto & { createdById: string }) {
    return this.prisma.softwareLicense.create({
      data: {
        name: data.name,
        vendor: data.vendor,
        totalSeats: data.totalSeats,
        usedSeats: 0,
        ...(data.expiresAt && { expiresAt: new Date(data.expiresAt) }),
        ...(data.renewalCost !== undefined && { renewalCost: data.renewalCost }),
        createdById: data.createdById,
      },
    });
  }

  update(id: number, data: UpdateSoftwareLicenseDto) {
    return this.prisma.softwareLicense.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.vendor && { vendor: data.vendor }),
        ...(data.totalSeats !== undefined && { totalSeats: data.totalSeats }),
        ...(data.expiresAt && { expiresAt: new Date(data.expiresAt) }),
        ...(data.renewalCost !== undefined && { renewalCost: data.renewalCost }),
      },
    });
  }

  incrementSeats(id: number, delta: number) {
    return this.prisma.softwareLicense.update({
      where: { id },
      data: { usedSeats: { increment: delta } },
    });
  }
}
