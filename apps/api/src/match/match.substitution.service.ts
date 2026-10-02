import { MatchSubstitutionRepository } from "./match.substitution.repo";
import { MatchRepository } from "./match.repo";
import { AppError } from "../lib/appError";
import { CreateSubstitutionDto } from "./dto/match.dto";

export class MatchSubstitutionService {
  constructor(
    private repo: MatchSubstitutionRepository,
    private matchRepo: MatchRepository,
  ) {}

  async create(matchId: string, dto: CreateSubstitutionDto) {
    const match = await this.matchRepo.findById(matchId);
    if (!match) throw new AppError(404, "MATCH_NOT_FOUND");
    if (dto.fromPlayerId === dto.toPlayerId) throw new AppError(400, "SUBSTITUTION_SAME_PLAYER");
    if (dto.minute < 1 || dto.minute > 120) throw new AppError(400, "INVALID_SUBSTITUTION_MINUTE");
    return this.repo.create(matchId, dto);
  }

  async delete(_matchId: string, id: string) {
    return this.repo.delete(id);
  }

  async list(matchId: string) {
    const match = await this.matchRepo.findById(matchId);
    if (!match) throw new AppError(404, "MATCH_NOT_FOUND");
    return this.repo.findByMatch(matchId);
  }
}
