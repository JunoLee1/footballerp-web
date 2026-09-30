import { LeagueRepository } from "./league.repo";
import { AppError } from "../lib/appError";
import { ClubService } from "../club/club.service";
import { CreateLeagueDto, UpdateLeagueDto } from "./league.dto";

export class LeagueService {
  constructor(
    private repo: LeagueRepository,
    private clubService: ClubService,
  ) {}

  list() {
    return this.repo.findAll();
  }

  async get(id: number) {
    const league = await this.repo.findById(id);
    if (!league) throw new AppError(404, "LEAGUE_NOT_FOUND");
    return league;
  }

  async create(dto: CreateLeagueDto) {
    if (typeof dto.name !== "string" || !dto.name.trim()) {
      throw new AppError(400, "INVALID_LEAGUE_NAME");
    }
    if (!Number.isInteger(dto.year) || dto.year < 2000 || dto.year > 2100) {
      throw new AppError(400, "INVALID_LEAGUE_YEAR");
    }
    const existing = await this.repo.findByLevelAndYear(dto.level, dto.year);
    if (existing) throw new AppError(409, "LEAGUE_ALREADY_EXISTS");
    return this.repo.create({ ...dto, name: dto.name.trim() });
  }

  async update(id: number, dto: UpdateLeagueDto) {
    await this.get(id);
    if (dto.name !== undefined) {
      if (typeof dto.name !== "string" || !dto.name.trim()) {
        throw new AppError(400, "INVALID_LEAGUE_NAME");
      }
      dto = { ...dto, name: dto.name.trim() };
    }
    return this.repo.update(id, dto);
  }

  async registerClub(leagueId: number, clubId: string) {
    await this.get(leagueId);
    await this.clubService.getById(clubId);
    const existing = await this.repo.findClubLeague(leagueId, clubId);
    if (existing) throw new AppError(409, "CLUB_ALREADY_IN_LEAGUE");
    await this.repo.addClub(leagueId, clubId);
    return this.get(leagueId);
  }

  async removeClub(leagueId: number, clubId: string) {
    await this.get(leagueId);
    await this.repo.removeClub(leagueId, clubId);
    return this.get(leagueId);
  }
}
