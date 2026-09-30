import type { PrismaClient } from "../../generated/client";
import type { CreateExposureEventDto } from "./dto/exposure.dto";

const INCLUDE = {
  createdBy: { select: { id: true, username: true } },
} as const;

export class ExposureRepository {
  constructor(private prisma: PrismaClient) {}

  create(sponsorshipId: string, data: CreateExposureEventDto & { createdById: string }) {
    return this.prisma.sponsorshipExposureEvent.create({
      data: {
        sponsorshipId,
        channel: data.channel as any,
        occurredAt: new Date(data.occurredAt),
        createdById: data.createdById,
        ...(data.exposureCount !== undefined && { exposureCount: data.exposureCount }),
        ...(data.fanReach !== undefined && { fanReach: data.fanReach }),
        ...(data.mediaValue !== undefined && { mediaValue: data.mediaValue }),
        ...(data.notes && { notes: data.notes }),
      },
      include: INCLUDE,
    });
  }

  findAll(sponsorshipId: string) {
    return this.prisma.sponsorshipExposureEvent.findMany({
      where: { sponsorshipId },
      include: INCLUDE,
      orderBy: { occurredAt: "desc" },
    });
  }
}
