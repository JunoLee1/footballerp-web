/**
 * DTOs for DepartmentDefaultAssetKit (#373).
 *
 * `assetItems` is stored as `Json` on the row — this shape mirrors the runtime
 * type used by `provisionNewEmployeeAssets()` when reading the kit back. Kept
 * in the DTO namespace so callers (upsert / GET) share one source of truth.
 */

export interface AssetKitItemDto {
  // EquipmentItem.id — hardware master reference. Runtime existence check
  // lives in the service layer (Prisma FK is not enforced through JSON).
  equipmentItemId: string;
  quantity: number;
  note?: string;
}

export interface UpsertDepartmentAssetKitDto {
  assetItems: AssetKitItemDto[];
  defaultExpenseCategoryId: string;
}
