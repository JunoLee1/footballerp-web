import { PrismaClient } from "../generated/client";
import { CreateSubstitutionDto } from "./dto/match.dto";

export class MatchSubstitutionRepository {
  constructor(private prisma: PrismaClient) {}

  create(matchId: string, dto: CreateSubstitutionDto) {
    return this.prisma.substitutionEvent.create({
      data: {
        matchId,
        fromPlayerId: dto.fromPlayerId,
        toPlayerId: dto.toPlayerId,
        minute: dto.minute,
      },
    });
  }

  delete(id: string) {
    return this.prisma.substitutionEvent.delete({ where: { id } });
  }

  findByMatch(matchId: string) {
    return this.prisma.substitutionEvent.findMany({
      where: { matchId },
      orderBy: { minute: "asc" },
    });
  }
}
