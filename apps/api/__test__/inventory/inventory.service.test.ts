import { InventoryService } from "../../src/inventory/inventory.service";
import { AppError } from "../../src/lib/appError";
import type { InventoryRepository } from "../../src/inventory/inventory.repo";

const makeRepo = (overrides: Partial<InventoryRepository> = {}): InventoryRepository => ({
  findById: jest.fn().mockResolvedValue({ id: 1, quantity: 10, minThreshold: 5 }),
  updateQuantity: jest.fn().mockImplementation(async (id, q) => ({ id, quantity: q })),
  findAllForAlertCheck: jest.fn().mockResolvedValue([]),
  ...overrides,
} as unknown as InventoryRepository);

describe("InventoryService", () => {
  it("adjusts quantity correctly", async () => {
    const updateQuantity = jest.fn().mockImplementation(async (id, q) => ({ id, quantity: q }));
    const repo = makeRepo({ updateQuantity });
    const service = new InventoryService(repo);
    await service.adjustQuantity(1, -3);
    expect(updateQuantity).toHaveBeenCalledWith(1, 7);
  });

  it("throws 404 when item not found on adjustQuantity", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const service = new InventoryService(repo);
    await expect(service.adjustQuantity(999, 1))
      .rejects.toThrow(new AppError(404, "INVENTORY_ITEM_NOT_FOUND"));
  });

  it("getAlerts returns items at or below minThreshold", async () => {
    const items = [
      { id: 1, name: "cones", quantity: 10, minThreshold: 5 },
      { id: 2, name: "balls", quantity: 3, minThreshold: 5 },
      { id: 3, name: "vests", quantity: 5, minThreshold: 5 },
    ];
    const repo = makeRepo({ findAllForAlertCheck: jest.fn().mockResolvedValue(items) });
    const service = new InventoryService(repo);
    const alerts = await service.getAlerts();
    expect(alerts.map(i => i.id).sort()).toEqual([2, 3]);
  });
});
