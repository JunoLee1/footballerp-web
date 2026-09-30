import type { PrismaClient } from "../generated/client";
import { AppError } from "../lib/appError";
import { writeAuditLog } from "../lib/auditLog";
import type { DepartmentAssetKitRepository } from "./department-asset-kit.repo";
import type {
  AssetKitItemDto,
  UpsertDepartmentAssetKitDto,
} from "./dto/department-asset-kit.dto";

/**
 * Service for DepartmentDefaultAssetKit (#373).
 *
 * The kit is a per-department JSON list of `{equipmentItemId, quantity, note}`
 * items that `HiringDispatch.dispatch()` reads post-tx to auto-provision
 * `AssetRequest` DRAFT rows for a new employee.
 *
 * Validation surface (kept tight — kit editor is ADMIN / ASSET_MANAGER only):
 *   - `assetItems` non-empty; each item has a positive `equipmentItemId` and
 *     `quantity > 0`; `note` (if present) capped at 200 chars.
 *   - Every `equipmentItemId` must resolve to an existing EquipmentItem row
 *     (Prisma FK is not enforced through JSON — a stale id would silently
 *     fail during provisioning, so we catch it up front).
 *   - `defaultExpenseCategoryId` must resolve to an existing ExpenseCategory.
 *   - `departmentId` must resolve to an existing Department (upsert would
 *     otherwise raise a raw FK error on create).
 *
 * `upsert` semantics: whole-list replacement — the FE sends the entire kit
 * each save, `assetItems` is written wholesale, and `updatedById` moves.
 */
export class DepartmentAssetKitService {
  constructor(
    private repo: DepartmentAssetKitRepository,
    private prisma: PrismaClient,
  ) {}

  async getByDepartment(departmentId: number) {
    this.assertValidId(departmentId, "INVALID_DEPARTMENT_ID");
    return this.repo.findByDepartment(departmentId);
  }

  async upsert(
    departmentId: number,
    dto: UpsertDepartmentAssetKitDto,
    actorId: string,
  ) {
    this.assertValidId(departmentId, "INVALID_DEPARTMENT_ID");
    if (!dto || typeof dto !== "object") {
      throw new AppError(400, "INVALID_PAYLOAD");
    }
    const items = this.validateItems(dto.assetItems);
    this.assertValidId(dto.defaultExpenseCategoryId, "INVALID_EXPENSE_CATEGORY_ID");

    // Existence checks — Department + ExpenseCategory + every referenced
    // EquipmentItem. Grouped into one Prisma round-trip each (findMany + Set
    // compare) because callers can send dozens of items per save.
    const [department, category, equipmentItems] = await Promise.all([
      this.prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      }),
      this.prisma.expenseCategory.findUnique({
        where: { id: dto.defaultExpenseCategoryId },
        select: { id: true, isActive: true },
      }),
      this.prisma.equipmentItem.findMany({
        where: { id: { in: items.map((i) => i.equipmentItemId) } },
        select: { id: true },
      }),
    ]);
    if (!department) throw new AppError(404, "DEPARTMENT_NOT_FOUND");
    if (!category) throw new AppError(400, "EXPENSE_CATEGORY_NOT_FOUND");
    if (!category.isActive) throw new AppError(400, "EXPENSE_CATEGORY_INACTIVE");

    const requestedIds = new Set(items.map((i) => i.equipmentItemId));
    if (equipmentItems.length !== requestedIds.size) {
      throw new AppError(400, "EQUIPMENT_ITEM_NOT_FOUND");
    }

    const kit = await this.repo.upsert(departmentId, {
      assetItems: items,
      defaultExpenseCategoryId: dto.defaultExpenseCategoryId,
      actorId,
    });

    void writeAuditLog({
      actorId,
      action: "DEPARTMENT_ASSET_KIT_UPSERTED",
      targetId: kit.id,
      detail: {
        departmentId,
        itemCount: items.length,
        defaultExpenseCategoryId: dto.defaultExpenseCategoryId,
      },
    }).catch(console.error);

    return kit;
  }

  async remove(departmentId: number, actorId: string) {
    this.assertValidId(departmentId, "INVALID_DEPARTMENT_ID");
    const existing = await this.repo.findByDepartment(departmentId);
    if (!existing) throw new AppError(404, "KIT_NOT_FOUND");
    const removed = await this.repo.deleteByDepartment(departmentId);

    void writeAuditLog({
      actorId,
      action: "DEPARTMENT_ASSET_KIT_REMOVED",
      targetId: existing.id,
      detail: { departmentId },
    }).catch(console.error);

    return removed;
  }

  // ────────────────────────────────────────────
  // Internal validation
  // ────────────────────────────────────────────

  private assertValidId(value: unknown, code: string): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new AppError(400, code);
    }
  }

  private validateItems(input: unknown): AssetKitItemDto[] {
    if (!Array.isArray(input) || input.length === 0) {
      throw new AppError(400, "ASSET_ITEMS_REQUIRED");
    }
    const seen = new Set<string>();
    const out: AssetKitItemDto[] = [];
    for (const raw of input) {
      if (!raw || typeof raw !== "object") {
        throw new AppError(400, "INVALID_ASSET_ITEM");
      }
      const item = raw as Record<string, unknown>;
      const equipmentItemId = item["equipmentItemId"];
      const quantity = item["quantity"];
      const note = item["note"];
      if (typeof equipmentItemId !== "string" || equipmentItemId.length === 0) {
        throw new AppError(400, "INVALID_EQUIPMENT_ITEM_ID");
      }
      if (
        typeof quantity !== "number" ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new AppError(400, "INVALID_QUANTITY");
      }
      // Duplicate equipmentItemIds would produce two provisioned drafts for
      // the same hardware — collapse at validation time so the kit editor
      // forces the user to bump `quantity` instead.
      if (seen.has(equipmentItemId)) {
        throw new AppError(400, "DUPLICATE_EQUIPMENT_ITEM");
      }
      seen.add(equipmentItemId);

      const normalized: AssetKitItemDto = { equipmentItemId, quantity };
      if (note !== undefined && note !== null) {
        if (typeof note !== "string") throw new AppError(400, "INVALID_NOTE");
        if (note.length > 200) throw new AppError(400, "NOTE_TOO_LONG");
        const trimmed = note.trim();
        if (trimmed.length > 0) normalized.note = trimmed;
      }
      out.push(normalized);
    }
    return out;
  }
}
