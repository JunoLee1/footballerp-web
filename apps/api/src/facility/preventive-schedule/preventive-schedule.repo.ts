import type { PrismaClient } from "../../generated/client";
import type { CreatePreventiveScheduleDto, UpdatePreventiveScheduleDto, PreventiveScheduleListQuery } from "./dto/preventive-schedule.dto";

const INCLUDE = {
  partner: { select: { id: true, name: true, type: true } },
} as const;

export class PreventiveScheduleRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: PreventiveScheduleListQuery) {
    return this.prisma.preventiveSchedule.findMany({
      where: {
        ...(query.facilityZone && { facilityZone: query.facilityZone  }),
        ...(query.isActive !== undefined && { isActive: query.isActive === "true" }),
      },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  findById(id: string) {
    return this.prisma.preventiveSchedule.findUnique({ where: { id }, include: INCLUDE });
  }

  create(dto: CreatePreventiveScheduleDto) {
    return this.prisma.preventiveSchedule.create({
      data: {
        facilityZone: dto.facilityZone,
        title: dto.title,
        intervalDays: dto.intervalDays,
        priority: dto.priority,
        ...(dto.description && { description: dto.description }),
        ...(dto.partnerId && { partnerId: dto.partnerId }),
      },
      include: INCLUDE,
    });
  }

  update(id: string, dto: UpdatePreventiveScheduleDto) {
    return this.prisma.preventiveSchedule.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.intervalDays !== undefined && { intervalDays: dto.intervalDays }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.partnerId !== undefined && { partnerId: dto.partnerId }),
      },
      include: INCLUDE,
    });
  }

  deactivate(id: string) {
    return this.prisma.preventiveSchedule.update({
      where: { id },
      data: { isActive: false },
      include: INCLUDE,
    });
  }

  findAllActive() {
    return this.prisma.preventiveSchedule.findMany({
      where: { isActive: true },
      include: INCLUDE,
    });
  }

  updateLastGeneratedAt(id: string, date: Date) {
    return this.prisma.preventiveSchedule.update({
      where: { id },
      data: { lastGeneratedAt: date },
    });
  }
}
