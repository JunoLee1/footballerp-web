import type { PrismaClient } from "../generated/client";
import type { CreateInventoryItemDto } from "./dto/inventory.dto";

export class InventoryRepository {
  constructor(private prisma: PrismaClient) {}

  findAll() {
    return this.prisma.facilityInventoryItem.findMany({ orderBy: { name: "asc" } });
  }

  findById(id: string) {
    return this.prisma.facilityInventoryItem.findUnique({ where: { id } });
  }

  create(data: CreateInventoryItemDto) {
    return this.prisma.facilityInventoryItem.create({
      data: {
        name: data.name,
        unit: data.unit,
        quantity: data.quantity ?? 0,
        minThreshold: data.minThreshold ?? 10,
      },
    });
  }

  updateQuantity(id: string, newQuantity: number) {
    return this.prisma.facilityInventoryItem.update({
      where: { id },
      data: { quantity: newQuantity },
    });
  }

  findAllForAlertCheck() {
    return this.prisma.facilityInventoryItem.findMany();
  }
}
