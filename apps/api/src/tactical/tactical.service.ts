import { TacticalRepository } from "./tactical.repo";
import { NotificationRepository } from "../notification/notification.repo";
import { AppError } from "../lib/appError";
import { CreateAnalysisDto, UpdateAnalysisDto, AddLineupDto, AddMediaDto } from "./dto/tactical.dto";
import { getPrisma } from "../lib/prisma";

export class TacticalService {
  constructor(
    private repo: TacticalRepository,
    private notifRepo?: NotificationRepository,
  ) {}

  list(filters?: { matchId?: number; phase?: string }) {
    return this.repo.findAll(filters);
  }

  getByMatch(matchId: string) {
    return this.repo.findByMatch(matchId);
  }

  async getById(id: string) {
    const analysis = await this.repo.findById(id);
    if (!analysis) throw new AppError(404, "ANALYSIS_NOT_FOUND");
    return analysis;
  }

  async createAnalysis(dto: CreateAnalysisDto, createdById: string) {
    const match = await getPrisma().match.findUnique({
      where: { id: dto.matchId },
      select: { seasonId: true },
    });
    if (!match) throw new AppError(404, "MATCH_NOT_FOUND");
    const analysis = await this.repo.create({ ...dto, seasonId: match.seasonId }, createdById);
    if (this.notifRepo) {
      void this.notifRepo
        .createForHeadCoach(
          "TACTICAL_ANALYSIS_CONFIRM_REQUESTED",
          () => ({
            title: "전술 분석 확정 요청",
            body: `새 전술 분석(${dto.phase})이 등록되어 확정이 필요합니다.`,
          }),
          analysis.id,
        )
        .catch(console.error);
    }
    return analysis;
  }

  async addLineup(analysisId: string, dto: AddLineupDto) {
    const analysis = await this.repo.findById(analysisId);
    if (!analysis) throw new AppError(404, "ANALYSIS_NOT_FOUND");
    return this.repo.addLineup(analysisId, dto);
  }

  async addMedia(analysisId: string, dto: AddMediaDto) {
    const analysis = await this.repo.findById(analysisId);
    if (!analysis) throw new AppError(404, "ANALYSIS_NOT_FOUND");
    return this.repo.addMedia(analysisId, dto);
  }

  async updateAnalysis(id: string, dto: UpdateAnalysisDto) {
    const analysis = await this.repo.findById(id);
    if (!analysis) throw new AppError(404, "ANALYSIS_NOT_FOUND");
    return this.repo.update(id, dto);
  }

  async confirmAnalysis(id: string) {
    const analysis = await this.repo.findById(id);
    if (!analysis) throw new AppError(404, "ANALYSIS_NOT_FOUND");
    if (analysis.status === "CONFIRMED") throw new AppError(409, "ALREADY_CONFIRMED");
    return this.repo.confirm(id);
  }

  private async resolvePlayerId(userId: string): Promise<string> {
    const player = await getPrisma().player.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!player) throw new AppError(403, "PLAYER_PROFILE_NOT_FOUND");
    return player.id;
  }

  async listForPlayer(userId: string) {
    const playerId = await this.resolvePlayerId(userId);
    return this.repo.findAllForPlayer(playerId);
  }

  async getByIdForPlayer(id: string, userId: string) {
    const playerId = await this.resolvePlayerId(userId);
    const analysis = await this.repo.findByIdForPlayer(id, playerId);
    if (!analysis) throw new AppError(404, "ANALYSIS_NOT_FOUND");
    return analysis;
  }

  getFormationResultCorrelation(seasonId: number) {
    return this.repo.getFormationResultCorrelation(seasonId);
  }

  searchOpponentAnalysis(keyword: string, seasonId?: number) {
    return this.repo.searchOpponentAnalysis(keyword, seasonId);
  }
}
