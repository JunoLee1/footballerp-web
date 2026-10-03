import { CoachAvailabilityRepository } from "./coach-availability.repo";
import { AppError } from "../lib/appError";
import { CreateCoachAvailabilityDto, CoachAvailabilityQuery } from "./dto/coach-availability.dto";

export class CoachAvailabilityService {
  constructor(private repo: CoachAvailabilityRepository) {}

  getAll(query: CoachAvailabilityQuery) {
    return this.repo.findAll(query);
  }

  async create(dto: CreateCoachAvailabilityDto, createdById: string) {
    if (new Date(dto.startDate) > new Date(dto.endDate)) {
      throw new AppError(400, "START_AFTER_END");
    }
    return this.repo.create(dto, createdById);
  }

  async delete(id: string, requesterId: string, isAdmin: boolean) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "NOT_FOUND");
    if (!isAdmin && record.createdById !== requesterId) {
      throw new AppError(403, "FORBIDDEN");
    }
    return this.repo.delete(id);
  }

  getConflicts(date: string) {
    return this.repo.findConflicts(new Date(date));
  }
}
