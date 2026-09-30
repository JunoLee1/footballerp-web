import { AppError } from "../lib/appError";
import { SquadPlanRepository } from "./squad-plan.repo";
import type { SaveSquadPlanDto } from "./dto/squad-plan.dto";

export class SquadPlanService {
  constructor(private repo: SquadPlanRepository) {}

  async get(seasonId: number) {
    return this.repo.findBySeasonId(seasonId);
  }

  async save(dto: SaveSquadPlanDto, updatedById: string) {
    if (!dto.seasonId || typeof dto.seasonId !== "number") {
      throw new AppError(400, "INVALID_SEASON_ID");
    }
    if (!dto.formation || typeof dto.formation !== "string") {
      throw new AppError(400, "INVALID_FORMATION");
    }
    if (!dto.slots || typeof dto.slots !== "object" || Array.isArray(dto.slots)) {
      throw new AppError(400, "INVALID_SLOTS");
    }
    return this.repo.upsert(dto, updatedById);
  }
}
