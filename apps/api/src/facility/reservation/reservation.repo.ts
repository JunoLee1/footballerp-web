import type { PrismaClient } from "../../generated/client";
import type { FacilityZone } from "../../generated/enums";

export class ReservationRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(facilityZone?: FacilityZone) {
    return this.prisma.facilityReservation.findMany({
      where: facilityZone ? { facilityZone } : {},
      include: { reservedBy: { select: { id: true, nickname: true } } },
      orderBy: { startTime: "asc" },
    });
  }

  findById(id: string) {
    return this.prisma.facilityReservation.findUnique({
      where: { id },
      include: { reservedBy: { select: { id: true, nickname: true } } },
    });
  }

  create(data: { facilityZone: FacilityZone; title: string; startTime: Date; endTime: Date; notes?: string; reservedById: string }) {
    return this.prisma.facilityReservation.create({
      data: {
        facilityZone: data.facilityZone,
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        reservedById: data.reservedById,
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: { reservedBy: { select: { id: true, nickname: true } } },
    });
  }

  delete(id: string) {
    return this.prisma.facilityReservation.delete({ where: { id } });
  }
}
