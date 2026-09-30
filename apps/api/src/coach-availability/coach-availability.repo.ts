import { PrismaClient } from "../generated/client";
import { CreateCoachAvailabilityDto, CoachAvailabilityQuery } from "./dto/coach-availability.dto";

export class CoachAvailabilityRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: CoachAvailabilityQuery) {
    const where: Record<string, unknown> = {};
    if (query.userId) where["userId"] = query.userId;
    if (query.from || query.to) {
      const dateFilter: Record<string, Date> = {};
      if (query.from) dateFilter["gte"] = new Date(query.from);
      if (query.to) dateFilter["lte"] = new Date(query.to);
      where["startDate"] = dateFilter;
    }
    return this.prisma.coachAvailability.findMany({
      where,
      include: {
        user: { select: { id: true, nickname: true, coachingRole: true } },
      },
      orderBy: { startDate: "asc" },
    });
  }

  findById(id: number) {
    return this.prisma.coachAvailability.findUnique({ where: { id } });
  }

  create(dto: CreateCoachAvailabilityDto, createdById: string) {
    return this.prisma.coachAvailability.create({
      data: {
        userId: dto.userId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason ?? null,
        createdById,
      },
    });
  }

  delete(id: number) {
    return this.prisma.coachAvailability.delete({ where: { id } });
  }

  findConflicts(date: Date) {
    return this.prisma.coachAvailability.findMany({
      where: {
        startDate: { lte: date },
        endDate: { gte: date },
      },
      include: {
        user: { select: { id: true, nickname: true, coachingRole: true } },
      },
    });
  }
}
