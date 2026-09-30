import type { PrismaClient } from "../../generated/client";

export class ReservationRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(facilityZone?: string) {
    return this.prisma.facilityReservation.findMany({
      where: facilityZone ? { facilityZone: facilityZone as any } : {},
      include: { reservedBy: { select: { id: true, nickname: true } } },
      orderBy: { startTime: "asc" },
    });
  }

  findById(id: number) {
    return this.prisma.facilityReservation.findUnique({
      where: { id },
      include: { reservedBy: { select: { id: true, nickname: true } } },
    });
  }

  create(data: { facilityZone: string; title: string; startTime: Date; endTime: Date; notes?: string; reservedById: string }) {
    return this.prisma.facilityReservation.create({
      data: { ...data, facilityZone: data.facilityZone as any },
      include: { reservedBy: { select: { id: true, nickname: true } } },
    });
  }

  delete(id: number) {
    return this.prisma.facilityReservation.delete({ where: { id } });
  }
}
