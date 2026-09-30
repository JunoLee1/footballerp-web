import { PrismaClient } from "../generated/client";

export class MarketValueRepository {
  constructor(private prisma: PrismaClient) {}

  getHistory(playerId: string) {
    return this.prisma.marketValueHistory.findMany({
      where: { playerId },
      orderBy: { recordedAt: "desc" },
      select: { id: true, value: true, source: true, recordedAt: true },
    });
  }

  async updateCurrentValue(playerId: string, value: number, recordedById: string) {
    await this.prisma.$transaction([
      this.prisma.player.update({
        where: { id: playerId },
        data: { currentMarketValue: value },
      }),
      this.prisma.marketValueHistory.create({
        data: { playerId, value, source: "MANUAL", recordedById },
      }),
    ]);
  }
}
