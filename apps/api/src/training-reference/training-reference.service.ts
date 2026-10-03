import { TrainingReferenceRepository } from "./training-reference.repo";
import { AppError } from "../lib/appError";
import { CreateTrainingReferenceDto, ListTrainingReferencesQuery } from "./dto/training-reference.dto";
import { SessionType } from "../generated/enums";

export class TrainingReferenceService {
  constructor(private repo: TrainingReferenceRepository) {}

  list(query: ListTrainingReferencesQuery) {
    return this.repo.findAll(query);
  }

  create(dto: CreateTrainingReferenceDto, addedById: string) {
    return this.repo.create(dto, addedById);
  }

  async delete(id: string, requesterId: string, isAdmin: boolean) {
    const ref = await this.repo.findById(id);
    if (!ref) throw new AppError(404, "TRAINING_REFERENCE_NOT_FOUND");
    if (!isAdmin && ref.addedById !== requesterId) throw new AppError(403, "FORBIDDEN");
    return this.repo.delete(id);
  }

  getRecommendations(sessionType: SessionType, limit?: number) {
    return this.repo.getTopSessionsByType(sessionType, limit);
  }
}
