/**
 * Frontend types mirroring `apps/api/src/department-asset-kit` (#373).
 *
 * A per-department JSON-backed asset kit — read by the auto-provisioning
 * hook on `HiringDispatch.dispatch()` to auto-create AssetRequest DRAFTs
 * for a new employee. Editing surface is ADMIN + ASSET_MANAGER only.
 */

export interface DepartmentAssetKitItem {
  equipmentItemId: number
  quantity: number
  note?: string
}

/**
 * Full server row as returned by GET/PUT/DELETE. Nested actor badges are
 * included so the FE detail panel can render "created by X on Y" without a
 * second call.
 */
export interface DepartmentAssetKit {
  id: number
  departmentId: number
  assetItems: DepartmentAssetKitItem[]
  defaultExpenseCategoryId: number
  createdById: string
  updatedById: string | null
  createdAt: string
  updatedAt: string

  expenseCategory: { id: number; code: string; label: string }
  createdBy: { id: number; username: string; nickname: string }
  updatedBy: { id: number; username: string; nickname: string } | null
  department: { id: number; name: string }
}

export interface UpsertDepartmentAssetKitPayload {
  assetItems: DepartmentAssetKitItem[]
  defaultExpenseCategoryId: number
}
