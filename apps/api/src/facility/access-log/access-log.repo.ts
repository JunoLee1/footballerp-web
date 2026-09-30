import type { PrismaClient } from "../../generated/client";
import type { AccessLogListQuery } from "./dto/access-log.dto";

export class AccessLogRepository {
  constructor(private prisma: PrismaClient) {}

  create(data: { userId: string; zone: string; action: string; reason?: string }) {
    return this.prisma.facilityAccessLog.create({
      data: {
        userId: data.userId,
        zone: data.zone as any,
        action: data.action,
        ...(data.reason && { reason: data.reason }),
      },
    });
  }

  findAll(query: AccessLogListQuery) {
    return this.prisma.facilityAccessLog.findMany({
      where: {
        ...(query.userId && { userId: query.userId }),
        ...(query.zone && { zone: query.zone as any }),
        ...(query.action && { action: query.action }),
        ...((query.from || query.to) ? {
          createdAt: {
            ...(query.from && { gte: new Date(query.from) }),
            ...(query.to && { lte: new Date(query.to) }),
          },
        } : {}),
      },
      include: { user: { select: { id: true, username: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
