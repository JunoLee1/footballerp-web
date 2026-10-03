import { TeamRepository, CreateTeamDto, UpdateTeamDto } from "./team.repo";
import { AppError } from "../lib/appError";

export class TeamService {
  constructor(private repo: TeamRepository) {}

  getAll(clubId?: string | null) {
    return this.repo.findAll(clubId);
  }

  async getById(id: string) {
    const team = await this.repo.findById(id);
    if (!team) throw new AppError(404, "TEAM_NOT_FOUND");
    return team;
  }

  async create(dto: CreateTeamDto) {
    if (dto.clubId) {
      const club = await this.repo.findClubById(dto.clubId);
      if (!club) throw new AppError(404, "CLUB_NOT_FOUND");
      const existing = await this.repo.findActiveByNameAndClub(dto.name, dto.clubId);
      if (existing) throw new AppError(409, "TEAM_ALREADY_EXISTS");
    }
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdateTeamDto) {
    const team = await this.getById(id);
    const effectiveClubId = dto.clubId !== undefined ? dto.clubId : team.clubId;
    if (dto.clubId !== undefined && dto.clubId !== null) {
      const club = await this.repo.findClubById(dto.clubId);
      if (!club) throw new AppError(404, "CLUB_NOT_FOUND");
    }
    if (dto.name && effectiveClubId) {
      const existing = await this.repo.findActiveByNameAndClub(dto.name, effectiveClubId, id);
      if (existing) throw new AppError(409, "TEAM_ALREADY_EXISTS");
    }
    return this.repo.update(id, dto);
  }

  async deactivate(id: string) {
    await this.getById(id);
    return this.repo.update(id, { isActive: false });
  }

}
