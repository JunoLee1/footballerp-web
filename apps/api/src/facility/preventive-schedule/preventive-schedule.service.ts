import { AppError } from "../../lib/appError";
import type { PreventiveScheduleRepository } from "./preventive-schedule.repo";
import type { CreatePreventiveScheduleDto, UpdatePreventiveScheduleDto, PreventiveScheduleListQuery } from "./dto/preventive-schedule.dto";

export class PreventiveScheduleService {
  constructor(private repo: PreventiveScheduleRepository) {}

  list(query: PreventiveScheduleListQuery) {
    return this.repo.findAll(query);
  }

  async get(id: string) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "PREVENTIVE_SCHEDULE_NOT_FOUND");
    return record;
  }

  create(dto: CreatePreventiveScheduleDto) {
    return this.repo.create(dto);
  }

  async update(id: string, dto: UpdatePreventiveScheduleDto) {
    await this.get(id);
    return this.repo.update(id, dto);
  }

  async deactivate(id: string) {
    const existing = await this.get(id);
    if (!existing.isActive) throw new AppError(400, "SCHEDULE_ALREADY_INACTIVE");
    return this.repo.deactivate(id);
  }
}
