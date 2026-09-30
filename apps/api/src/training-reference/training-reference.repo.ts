import { PrismaClient } from "../generated/client";
import { SessionType } from "../generated/enums";
import { CreateTrainingReferenceDto, ListTrainingReferencesQuery } from "./dto/training-reference.dto";

export class TrainingReferenceRepository {
  constructor(private prisma: PrismaClient) {}

  findAll(query: ListTrainingReferencesQuery) {
    return this.prisma.trainingReference.findMany({
      where: {
        ...(query.sessionType && { sessionType: query.sessionType }),
        ...(query.tag && { tags: { hasSome: [query.tag] } }),
      },
      select: {
        id: true,
        sessionType: true,
        title: true,
        url: true,
        source: true,
        tags: true,
        createdAt: true,
        addedBy: { select: { id: true, nickname: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  create(dto: CreateTrainingReferenceDto, addedById: string) {
    return this.prisma.trainingReference.create({
      data: {
        sessionType: dto.sessionType,
        title: dto.title,
        url: dto.url,
        source: dto.source,
        tags: dto.tags,
        addedById,
      },
      select: {
        id: true,
        sessionType: true,
        title: true,
        url: true,
        source: true,
        tags: true,
        createdAt: true,
        addedBy: { select: { id: true, nickname: true } },
      },
    });
  }

  findById(id: number) {
    return this.prisma.trainingReference.findUnique({
      where: { id },
      select: { id: true, addedById: true },
    });
  }

  delete(id: number) {
    return this.prisma.trainingReference.delete({ where: { id } });
  }

  async getTopSessionsByType(sessionType: SessionType, limit = 5) {
    const results = await this.prisma.trainingResult.groupBy({
      by: ["sessionId"],
      where: {
        session: { sessionType },
        performanceScore: { not: null },
      },
      _avg: { performanceScore: true },
      orderBy: { _avg: { performanceScore: "desc" } },
      take: limit,
    });

    const sessionIds = results.map((r) => r.sessionId);
    const sessions = await this.prisma.trainingSession.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, date: true, goal: true, sessionType: true },
    });

    return sessionIds.map((id) => ({
      session: sessions.find((s) => s.id === id)!,
      avgScore: results.find((r) => r.sessionId === id)?._avg.performanceScore ?? null,
    }));
  }
}
