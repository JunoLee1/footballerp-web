import { AppError } from "../../lib/appError";
import { writeAuditLog } from "../../lib/auditLog";
import { formatLedgerDescription } from "../../lib/ledger-formatter";
import { NotificationService } from "../../notification/notification.service";
import type { MaintenanceRepository } from "./maintenance.repo";
import type { CreateMaintenanceDto, UpdateMaintenanceDto, MaintenanceListQuery } from "./dto/maintenance.dto";
import type { LedgerService } from "../../ledger/ledger.service";
import type { PrismaClient } from "../../generated/client";

const TERMINAL_STATUSES = ["RESOLVED", "REJECTED"] as const;

export class MaintenanceService {
  constructor(
    private repo: MaintenanceRepository,
    private notifications: NotificationService,
    private ledgerService: LedgerService,
    private prisma: PrismaClient,
  ) {}

  list(query: MaintenanceListQuery) {
    return this.repo.findAll(query);
  }

  async get(id: number) {
    const record = await this.repo.findById(id);
    if (!record) throw new AppError(404, "MAINTENANCE_REQUEST_NOT_FOUND");
    return record;
  }

  async create(dto: CreateMaintenanceDto, createdById: string) {
    const record = await this.repo.create({ ...dto, createdById });
    if (record.priority === "EMERGENCY") {
      void this.notifications.notifyFacilityEmergency(record.title, record.id).catch(console.error);
    }
    return record;
  }

  async update(id: number, dto: UpdateMaintenanceDto, updatedById: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError(404, "MAINTENANCE_NOT_FOUND");
    if (existing.isLocked) throw new AppError(400, "MAINTENANCE_LOCKED");
    if ((TERMINAL_STATUSES as readonly string[]).includes(existing.status)) {
      throw new AppError(409, "ALREADY_RESOLVED");
    }
    const result = await this.repo.update(id, dto);
    if (dto.actualCost !== undefined) {
      void writeAuditLog({
        actorId: updatedById,
        action: "MAINTENANCE_COST_UPDATED",
        targetId: id,
        detail: { actualCost: dto.actualCost },
      }).catch(console.error);
    }
    return result;
  }

  async updateStatus(id: number, status: string) {
    const existing = await this.get(id);
    if ((TERMINAL_STATUSES as readonly string[]).includes(existing.status)) {
      throw new AppError(409, "ALREADY_RESOLVED");
    }
    const ALLOWED = ["IN_PROGRESS", "PENDING_APPROVAL"];
    if (!ALLOWED.includes(status)) throw new AppError(400, "INVALID_STATUS_TRANSITION");
    return this.repo.updateStatus(id, status);
  }

  async approve(id: number, approverId: string) {
    const existing = await this.get(id);
    if (existing.status !== "PENDING_APPROVAL") throw new AppError(400, "INVALID_STATUS_TRANSITION");
    const record = await this.repo.approve(id, approverId);
    void this.notifications.notifyMaintenanceApproved(existing.title, id, existing.createdBy.id).catch(console.error);
    return record;
  }

  async gmApprove(id: number, gmId: string) {
    const existing = await this.get(id);
    if (existing.status !== "APPROVED") throw new AppError(400, "INVALID_STATUS_TRANSITION");
    const record = await this.repo.gmApprove(id, gmId);
    void this.notifications.notifyFacilityResolved(existing.title, id).catch(console.error);
    if (existing.actualCost) {
      void this.ledgerService.createAutoEntry({
        type: "EXPENSE",
        category: "FACILITY_REPAIR",
        amount: Number(existing.actualCost),
        currency: "KRW",
        exchangeRate: 1,
        amountKrw: Number(existing.actualCost),
        description: formatLedgerDescription("facility", "repair_completed", { title: existing.title }),
        relatedModule: "facility",
        relatedId: id,
      }, gmId).catch(err => console.error("[LedgerAutoEntry:facility]", err));
    }
    return record;
  }

  async reject(id: number, reason: string | undefined, actorId?: string) {
    if (!reason) throw new AppError(400, "REJECTION_REASON_REQUIRED");
    const existing = await this.get(id);
    const REJECTABLE = ["PENDING_APPROVAL", "APPROVED"];
    if (!REJECTABLE.includes(existing.status)) throw new AppError(400, "INVALID_STATUS_TRANSITION");
    const result = await this.repo.reject(id, reason);
    void this.notifications.notifyMaintenanceRejected(existing.title, id, existing.createdBy.id, reason).catch(console.error);
    void writeAuditLog({
      actorId: actorId ?? "",
      action: "MAINTENANCE_REJECTED",
      targetId: id,
      detail: { reason, previousStatus: existing.status },
    }).catch(console.error);
    return result;
  }

  async lock(id: number) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError(404, "MAINTENANCE_NOT_FOUND");
    if (existing.status !== "RESOLVED") throw new AppError(400, "CANNOT_LOCK_UNRESOLVED");
    if (existing.isLocked) throw new AppError(400, "MAINTENANCE_ALREADY_LOCKED");
    return this.repo.lock(id);
  }

  async submitToFinance(id: number, userId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError(404, "MAINTENANCE_NOT_FOUND");

    const settings = await this.prisma.clubSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
      select: { maintenanceCostLimit: true },
    });
    const limit = settings.maintenanceCostLimit;

    const cost = existing.estimatedCost ? Number(existing.estimatedCost) : 0;
    if (cost < limit) throw new AppError(400, "COST_BELOW_THRESHOLD");
    if (existing.financeSubmittedAt) throw new AppError(400, "ALREADY_SUBMITTED_TO_FINANCE");

    const result = await this.repo.submitToFinance(id);
    void this.notifications.notifyFacilityFinanceSubmit(existing.title, id, cost).catch(console.error);
    return result;
  }
}
