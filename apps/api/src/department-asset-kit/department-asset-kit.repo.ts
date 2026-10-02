import type { PrismaClient, Prisma } from "../generated/client";
import type { AssetKitItemDto } from "./dto/department-asset-kit.dto";

/**
 * Prisma boundary for DepartmentDefaultAssetKit (#373).
 *
 * Only two shapes here:
 *   - Read: `findByDepartment` includes ExpenseCategory + createdBy/updatedBy
 *     badges for the FE detail panel.
 *   - Write: `upsert` keyed on the unique departmentId — every call replaces
 *     the previous `assetItems` snapshot wholesale (no per-item update path,
 *     matches the plan's "kit editor saves whole list" UX).
 *
 * `assetItems` widens to `Prisma.InputJsonValue` when writing — the service
 * validates the array shape before handing it here.
 */
const ACTOR_SELECT = { id: true, username: true, nickname: true } as const;

const KIT_INCLUDE = {
  expenseCategory: { select: { id: true, code: true, label: true } },
  createdBy: { select: ACTOR_SELECT },
  updatedBy: { select: ACTOR_SELECT },
  department: { select: { id: true, name: true } },
} as const;

export interface UpsertKitData {//Dto 파일로 옮긴다?
  assetItems: AssetKitItemDto[];
  defaultExpenseCategoryId: string;
  actorId: string;
}

export class DepartmentAssetKitRepository {
  constructor(private prisma: PrismaClient) {}

  findByDepartment(departmentId: string) {
    return this.prisma.departmentDefaultAssetKit.findUnique({
      where: { departmentId },
      include: KIT_INCLUDE,
    });
  }

  upsert(departmentId: string, data: UpsertKitData) {
    const jsonPayload = data.assetItems as unknown as Prisma.InputJsonValue;
    return this.prisma.departmentDefaultAssetKit.upsert({
      where: { departmentId },
      create: {
        departmentId,
        assetItems: jsonPayload,
        defaultExpenseCategoryId: data.defaultExpenseCategoryId,
        createdById: data.actorId,
      },
      update: {
        assetItems: jsonPayload,
        defaultExpenseCategoryId: data.defaultExpenseCategoryId,
        updatedById: data.actorId,
      },
      include: KIT_INCLUDE,
    });
  }

  deleteByDepartment(departmentId: string) {
    return this.prisma.departmentDefaultAssetKit.delete({
      where: { departmentId },
    });
  }
}
