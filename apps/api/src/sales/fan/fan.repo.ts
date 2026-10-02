import type { PrismaClient } from "../../generated/client";

export class FanRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.fan.findMany({
      include: {
        memberships: { where: { isActive: true }, select: { tier: true, endDate: true } },
        _count: { select: { purchases: true } },
      },
      orderBy: { joinedAt: "desc" },
    });
  }

  findById(id: string) {
    return this.prisma.fan.findUnique({
      where: { id },
      include: {
        memberships: true,
        purchases: { orderBy: { purchasedAt: "desc" }, take: 50 },
      },
    });
  }

  create(data: { name: string; email?: string; phone?: string }) {
    return this.prisma.fan.create({ data });
  }

  createMembership(data: { fanId: string; tier: string; startDate: Date; endDate: Date }) {
    return this.prisma.fanMembership.create({ data: { ...data, tier: data.tier } });
  }

  getMembershipStats() {
    return this.prisma.fanMembership.groupBy({
      by: ["tier"],
      where: { isActive: true },
      _count: { id: true },
    });
  }

  getSeatZonesByMatch(matchId: string) {
    return this.prisma.seatZone.findMany({
      where: { matchId },
    });
  }

  createSeatZone(data: { matchId: string; name: string; capacity: number }) {
    return this.prisma.seatZone.create({ data });
  }
}
