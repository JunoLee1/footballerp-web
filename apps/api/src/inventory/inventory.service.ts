import { AppError } from "../lib/appError";
import type { InventoryRepository } from "./inventory.repo";
import type { CreateInventoryItemDto } from "./dto/inventory.dto";

export class InventoryService {
  constructor(private repo: InventoryRepository) {}

  findAll() { return this.repo.findAll(); }

  create(dto: CreateInventoryItemDto) {
    return this.repo.create(dto);
  }

  async adjustQuantity(id: string, delta: number) {
    const item = await this.repo.findById(id);
    if (!item) throw new AppError(404, "INVENTORY_ITEM_NOT_FOUND");
    const newQty = item.quantity + delta;
    return this.repo.updateQuantity(id, newQty);
  }

  async getAlerts() {
    const items = await this.repo.findAllForAlertCheck();
    return items.filter(i => i.quantity <= i.minThreshold);
  }
}
