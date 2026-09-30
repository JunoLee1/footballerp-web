import type { PrismaClient } from "../../generated/client";
import type { CreateContactLogDto } from "./dto/contact-log.dto";

const INCLUDE = {
  actor: { select: { id: true, username: true } },
} as const;

export class ContactLogRepository {
  constructor(private prisma: PrismaClient) {}

  create(partnerId: string, data: CreateContactLogDto & { actorId: string }) {
    return this.prisma.partnerContactLog.create({
      data: {
        partnerId,
        channel: data.channel as any,
        contactedAt: new Date(data.contactedAt),
        actorId: data.actorId,
        summary: data.summary,
        ...(data.nextActionDate && { nextActionDate: new Date(data.nextActionDate) }),
        ...(data.nextActionNote && { nextActionNote: data.nextActionNote }),
      },
      include: INCLUDE,
    });
  }

  findAll(partnerId: string) {
    return this.prisma.partnerContactLog.findMany({
      where: { partnerId },
      include: INCLUDE,
      orderBy: { contactedAt: "desc" },
    });
  }

  findDueTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    return this.prisma.partnerContactLog.findMany({
      where: { nextActionDate: { gte: tomorrow, lt: dayAfter } },
      include: { partner: { select: { id: true, name: true } }, actor: { select: { id: true } } },
    });
  }
}
