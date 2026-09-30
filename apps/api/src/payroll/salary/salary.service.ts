import { AppError } from "../../lib/appError";
import { writeAuditLog } from "../../lib/auditLog";
import type { SalaryRepository } from "./salary.repo";
import type { CreateSalaryDto, UpdateSalaryDto, SalaryListQuery } from "./dto/salary.dto";

export class SalaryService {
  constructor(private repo: SalaryRepository) {}

  list(query: SalaryListQuery) {
    return this.repo.findAll(query);
  }

  async get(id: string) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "SALARY_NOT_FOUND");
    return record;
  }

  async create(dto: CreateSalaryDto, actorId: string) {
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    const closeAt = new Date(effectiveFrom.getTime() - 1);
    await this.repo.closeActive(dto.userId ?? null, dto.staffRecordId ?? null, closeAt);
    const record = await this.repo.create(dto);
    await writeAuditLog({ actorId, action: "SALARY_CREATED", targetId: record.id });
    return record;
  }

  async update(id: string, dto: UpdateSalaryDto, actorId: string) {
    await this.get(id);
    const record = await this.repo.update(id, dto);
    await writeAuditLog({ actorId, action: "SALARY_UPDATED", targetId: id });
    return record;
  }
}
