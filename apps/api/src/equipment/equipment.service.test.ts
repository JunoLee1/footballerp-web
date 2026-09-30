import { EquipmentService } from "./equipment.service";
import { AppError } from "../lib/appError";
import type { EquipmentRepository } from "./equipment.repo";

jest.mock("../lib/cache", () => ({
  cached: jest.fn((_key: string, _ttl: number, fn: any) => fn()),
}));

const makeRepo = (overrides: any = {}): any => ({
  findUnitWithDepreciation: jest.fn().mockResolvedValue(null),
  updateUnitDepreciation: jest.fn().mockResolvedValue({}),
  ...overrides,
} as unknown as EquipmentRepository);

describe("EquipmentService.calculateAndSaveDepreciation", () => {
  it("computes declining balance correctly", async () => {
    const updateUnitDepreciation = jest.fn().mockResolvedValue({});
    const repo = makeRepo({
      findUnitWithDepreciation: jest.fn().mockResolvedValue({
        id: 1, purchaseValue: 1000, bookValue: 1000, depreciationRate: 0.2,
        depreciationMethod: "DECLINING_BALANCE", purchasedAt: new Date(),
      }),
      updateUnitDepreciation,
    });
    const service = new EquipmentService(repo, undefined as any, undefined as any);
    await service.calculateAndSaveDepreciation("cmxtestequnit0000000000001");
    // 1000 * (1 - 0.2) = 800
    expect(updateUnitDepreciation).toHaveBeenCalledWith("cmxtestequnit0000000000001", 800);
  });

  it("computes straight line correctly", async () => {
    const updateUnitDepreciation = jest.fn().mockResolvedValue({});
    const purchasedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // ~1 month ago
    const repo = makeRepo({
      findUnitWithDepreciation: jest.fn().mockResolvedValue({
        id: 1, purchaseValue: 1000, bookValue: 1000, depreciationRate: 0.1,
        depreciationMethod: "STRAIGHT_LINE", purchasedAt,
      }),
      updateUnitDepreciation,
    });
    const service = new EquipmentService(repo, undefined as any, undefined as any);
    await service.calculateAndSaveDepreciation("cmxtestequnit0000000000001");
    // 1000 - (1000 * 0.1) * 1 month = 900
    expect(updateUnitDepreciation).toHaveBeenCalledWith("cmxtestequnit0000000000001", 900);
  });

  it("throws 400 when newBookValue would go negative", async () => {
    const repo = makeRepo({
      findUnitWithDepreciation: jest.fn().mockResolvedValue({
        id: 1, purchaseValue: 1000, bookValue: 100, depreciationRate: 0.5,
        depreciationMethod: "STRAIGHT_LINE",
        purchasedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 12 months
      }),
    });
    const service = new EquipmentService(repo, undefined as any, undefined as any);
    await expect(service.calculateAndSaveDepreciation("cmxtestequnit0000000000001"))
      .rejects.toThrow(new AppError(400, "NEGATIVE_BOOK_VALUE"));
  });
});

describe("EquipmentService — clubId 스코핑 (Phase 2.5)", () => {
  describe("getAllItems", () => {
    it("actorClubId 를 repo.findAllItems 에 전달", async () => {
      const findAllItems = jest.fn().mockResolvedValue([]);
      const repo = makeRepo({ findAllItems });
      const service = new EquipmentService(repo, undefined as any, undefined as any);
      await service.getAllItems("cmxtestclub00000000000001");
      expect(findAllItems).toHaveBeenCalledWith("cmxtestclub00000000000001");
    });

    it("actorClubId undefined → filter 생략 (SUPER_ADMIN)", async () => {
      const findAllItems = jest.fn().mockResolvedValue([]);
      const repo = makeRepo({ findAllItems });
      const service = new EquipmentService(repo, undefined as any, undefined as any);
      await service.getAllItems();
      expect(findAllItems).toHaveBeenCalledWith(undefined);
    });
  });

  describe("getItemById", () => {
    it("일치하는 clubId → 아이템 반환", async () => {
      const findItemById = jest.fn().mockResolvedValue({ id: 1, name: "kit", units: [] });
      const repo = makeRepo({ findItemById });
      const service = new EquipmentService(repo, undefined as any, undefined as any);
      const result = await service.getItemById("cmxtestequip0000000000001", "cmxtestclub00000000000001");
      expect(findItemById).toHaveBeenCalledWith("cmxtestequip0000000000001", "cmxtestclub00000000000001");
      expect(result.id).toBe(1);
    });

    it("다른 clubId → repo null → 404 EQUIPMENT_ITEM_NOT_FOUND", async () => {
      const findItemById = jest.fn().mockResolvedValue(null);
      const repo = makeRepo({ findItemById });
      const service = new EquipmentService(repo, undefined as any, undefined as any);
      await expect(service.getItemById("cmxtestequip0000000000001", "cmxtestclub0000000000099"))
        .rejects.toThrow(new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND"));
    });
  });

  describe("createItem", () => {
    it("actorClubId 를 repo.createItem 에 전달", async () => {
      const createItem = jest.fn().mockResolvedValue({ id: 1 });
      const repo = makeRepo({ createItem });
      const service = new EquipmentService(repo, undefined as any, undefined as any);
      const dto = { name: "ball", category: "OTHER" as any, trackedIndividually: false };
      await service.createItem(dto, "cmxtestclub00000000000001");
      expect(createItem).toHaveBeenCalledWith(dto, "cmxtestclub00000000000001");
    });
  });

  describe("listLoans", () => {
    it("status + clubId 캐시 키 분리 → cross-club 오염 방지", async () => {
      const findAllLoans = jest.fn().mockResolvedValue([]);
      const repo = makeRepo({ findAllLoans });
      const service = new EquipmentService(repo, undefined as any, undefined as any);
      await service.listLoans("REQUESTED" as any, "cmxtestclub00000000000001");
      expect(findAllLoans).toHaveBeenCalledWith("REQUESTED", "cmxtestclub00000000000001");
    });
  });

  describe("requestLoan", () => {
    it("actorClubId 필터 통과 item 만 대여 가능", async () => {
      const findItemById = jest.fn().mockResolvedValue({ id: 1, name: "kit" });
      const createLoan = jest.fn().mockResolvedValue({ id: 10 });
      const findEquipmentManagers = jest.fn().mockResolvedValue([]);
      const repo = makeRepo({ findItemById, createLoan, findEquipmentManagers });
      const notifRepo = { create: jest.fn().mockResolvedValue({}) };
      const service = new EquipmentService(repo, notifRepo as any, undefined as any);
      await service.requestLoan("33333333-3333-3333-3333-333333333333", { equipmentItemId: "cmxtestequip0000000000001" } as any, "cmxtestclub00000000000001");
      expect(findItemById).toHaveBeenCalledWith("cmxtestequip0000000000001", "cmxtestclub00000000000001");
      expect(createLoan).toHaveBeenCalledWith("33333333-3333-3333-3333-333333333333", { equipmentItemId: 1 }, "cmxtestclub00000000000001");
    });

    it("다른 클럽 item → findItemById null → 404 EQUIPMENT_ITEM_NOT_FOUND", async () => {
      const findItemById = jest.fn().mockResolvedValue(null);
      const repo = makeRepo({ findItemById });
      const service = new EquipmentService(repo, undefined as any, undefined as any);
      await expect(service.requestLoan("33333333-3333-3333-3333-333333333333", { equipmentItemId: 1 } as any, "cmxtestclub0000000000099"))
        .rejects.toThrow(new AppError(404, "EQUIPMENT_ITEM_NOT_FOUND"));
    });
  });

  describe("approveLoan", () => {
    it("다른 클럽 loan → 404 LOAN_NOT_FOUND", async () => {
      const findLoanById = jest.fn().mockResolvedValue(null);
      const repo = makeRepo({ findLoanById });
      const service = new EquipmentService(repo, undefined as any, undefined as any);
      await expect(service.approveLoan("cmxtestloan0000000000001", "44444444-4444-4444-4444-444444444444", "cmxtestclub0000000000099"))
        .rejects.toThrow(new AppError(404, "LOAN_NOT_FOUND"));
    });
  });
});
