import { AppError } from "../../lib/appError";
import type { InspectionRepository } from "./inspection.repo";
import type { MaintenanceService } from "../maintenance/maintenance.service";
import type { CreateInspectionDto, UpdateInspectionDto, InspectionListQuery } from "./dto/inspection.dto";

export class InspectionService {
  constructor(
    private repo: InspectionRepository,
    private maintenanceService: MaintenanceService,
  ) {}

  list(query: InspectionListQuery) {
    return this.repo.findAll(query);
  }

  async get(id: string) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "INSPECTION_NOT_FOUND");
    return record;
  }

  async create(dto: CreateInspectionDto, inspectedById: string) {
    if (
      dto.sanitationScore !== undefined &&
      (dto.sanitationScore < 1 || dto.sanitationScore > 5 || !Number.isInteger(dto.sanitationScore))
    ) {
      throw new AppError(400, "INVALID_SANITATION_SCORE");
    }
    const record = await this.repo.create({ ...dto, inspectedById });

    if (record.result === "ISSUE_FOUND") {
      const maintenance = await this.maintenanceService.create(
        {
          title: `[자동] ${record.facilityZone} 구역 점검 이상 감지`,
          description: record.notes ?? "",
          priority: "EMERGENCY",
          sourceInspectionId: record.id,
        },
        inspectedById,
      );
      return { ...record, createdMaintenanceId: maintenance.id };
    }

    return record;
  }

  async update(id: string, dto: UpdateInspectionDto) {
    // TR9: Auto-update EquipmentUnit.nextInspectionDue on inspection completion
    // is deferred until FacilityInspection gains an equipmentUnitId FK in the schema.
    await this.get(id);
    return this.repo.update(id, dto);
  }
}
