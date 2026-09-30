import { SalesService } from "./sales.service";
import { AppError } from "../lib/appError";
import type { SalesRepository } from "./sales.repo";
import type { PrismaClient } from "../generated/client";

jest.mock("../lib/auditLog", () => ({ writeAuditLog: jest.fn() }));

const makeRepo = (overrides: Partial<SalesRepository> = {}): SalesRepository => ({
  create: jest.fn().mockImplementation(async (data) => ({ id: 1, ...data })),
  ...overrides,
} as unknown as SalesRepository);

const makePrisma = (overrides: Partial<PrismaClient> = {}): PrismaClient =>
  overrides as unknown as PrismaClient;

describe("SalesService.create", () => {
  it("throws 400 when quantity is negative", async () => {
    const service = new SalesService(makeRepo(), makePrisma());
    await expect(service.create({ type: "TICKET", quantity: -1, unitPrice: 100, saleDate: "2026-08-05" } as any, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"))
      .rejects.toThrow(new AppError(400, "NEGATIVE_SALES_VALUE"));
  });

  it("throws 400 when unitPrice is negative", async () => {
    const service = new SalesService(makeRepo(), makePrisma());
    await expect(service.create({ type: "TICKET", quantity: 1, unitPrice: -100, saleDate: "2026-08-05" } as any, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"))
      .rejects.toThrow(new AppError(400, "NEGATIVE_SALES_VALUE"));
  });

  it("computes totalAmount correctly for non-TICKET type", async () => {
    const txRecord = { id: 1, type: "UNIFORM", quantity: 3, unitPrice: 50000, totalAmount: 150000 };
    const mockTx = {
      salesRecord: { create: jest.fn().mockResolvedValue(txRecord) },
      ledgerEntry: { create: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.create({ type: "UNIFORM", quantity: 3, unitPrice: 50000, saleDate: "2026-08-05" } as any, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    expect(mockTx.salesRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totalAmount: 150000 }) }),
    );
  });
});

// Task A: COMPLIMENTARY ticket limit (BS6)
describe("SalesService.create — COMPLIMENTARY limit (BS6)", () => {
  function makeCompTx({
    compsSoldQty = 0,
    limit = 10,
    matchCapacity = 1000,
  }: { compsSoldQty?: number; limit?: number; matchCapacity?: number } = {}) {
    const txRecord = { id: 99, type: "COMPLIMENTARY", quantity: 1, unitPrice: 0, totalAmount: 0 };
    return {
      match: {
        findUnique: jest.fn().mockResolvedValue({
          homeTeamName: "FC Seoul",
          awayTeamName: "수원 삼성",
          capacity: matchCapacity,
        }),
      },
      clubSettings: {
        findUnique: jest.fn().mockResolvedValue({ complimentaryTicketLimit: limit }),
      },
      salesRecord: {
        aggregate: jest.fn().mockImplementation(({ where }: any) => {
          // capacity check returns 0 sold overall, comp limit check returns compsSoldQty
          if (where?.type?.in || (where?.type && where.type !== "COMPLIMENTARY")) {
            return Promise.resolve({ _sum: { quantity: 0 } });
          }
          return Promise.resolve({ _sum: { quantity: compsSoldQty } });
        }),
        create: jest.fn().mockResolvedValue(txRecord),
      },
      ledgerEntry: { create: jest.fn() },
      seatZone: { update: jest.fn() },
    };
  }

  it("throws COMPLIMENTARY_LIMIT_EXCEEDED when adding beyond limit", async () => {
    const mockTx = makeCompTx({ compsSoldQty: 10, limit: 10 });
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await expect(
      service.create(
        { type: "COMPLIMENTARY", quantity: 1, unitPrice: 0, matchId: 42, saleDate: "2026-08-05", description: "VIP guest" } as any,
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      ),
    ).rejects.toThrow(new AppError(400, "COMPLIMENTARY_LIMIT_EXCEEDED"));
  });

  it("succeeds when under complimentary limit (5 of 10 used)", async () => {
    const mockTx = makeCompTx({ compsSoldQty: 5, limit: 10 });
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await expect(
      service.create(
        { type: "COMPLIMENTARY", quantity: 1, unitPrice: 0, matchId: 42, saleDate: "2026-08-05", description: "VIP guest" } as any,
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      ),
    ).resolves.toBeDefined();
  });
});

// Task B: SeatZone soldCount increment on create (BS10)
describe("SalesService.create — SeatZone soldCount (BS10)", () => {
  it("increments seatZone.soldCount when seatZoneId is provided", async () => {
    const txRecord = { id: 5, type: "TICKET", quantity: 2, unitPrice: 30000, totalAmount: 60000 };
    const mockTx = {
      match: {
        findUnique: jest.fn().mockResolvedValue({
          homeTeamName: "FC Seoul",
          awayTeamName: "수원 삼성",
          capacity: null,
        }),
      },
      salesRecord: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        create: jest.fn().mockResolvedValue(txRecord),
      },
      ledgerEntry: { create: jest.fn() },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.create(
      { type: "TICKET", quantity: 2, unitPrice: 30000, matchId: 10, seatZoneId: 7, saleDate: "2026-08-05" } as any,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    );
    expect(mockTx.seatZone.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: { soldCount: { increment: 2 } },
      }),
    );
  });

  it("does NOT call seatZone.update when seatZoneId is absent", async () => {
    const txRecord = { id: 6, type: "TICKET", quantity: 1, unitPrice: 30000, totalAmount: 30000 };
    const mockTx = {
      match: {
        findUnique: jest.fn().mockResolvedValue({
          homeTeamName: "FC Seoul",
          awayTeamName: "부산 아이파크",
          capacity: null,
        }),
      },
      salesRecord: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        create: jest.fn().mockResolvedValue(txRecord),
      },
      ledgerEntry: { create: jest.fn() },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.create(
      { type: "TICKET", quantity: 1, unitPrice: 30000, matchId: 10, saleDate: "2026-08-05" } as any,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    );
    expect(mockTx.seatZone.update).not.toHaveBeenCalled();
  });
});

// Task B: SeatZone soldCount decrement on delete (BS10)
describe("SalesService.delete — SeatZone soldCount (BS10)", () => {
  it("decrements seatZone.soldCount when existing record has seatZoneId", async () => {
    const existingRecord = { id: 10, seatZoneId: 3, quantity: 2, deletedAt: null };
    const mockTx = {
      ledgerEntry: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      salesRecord: {
        findUnique: jest.fn().mockResolvedValue(existingRecord),
        update: jest.fn(),
      },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.delete(10, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    expect(mockTx.seatZone.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 3 },
        data: { soldCount: { decrement: 2 } },
      }),
    );
  });

  it("does NOT call seatZone.update when existing record has no seatZoneId", async () => {
    const existingRecord = { id: 11, seatZoneId: null, quantity: 1, deletedAt: null };
    const mockTx = {
      ledgerEntry: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      salesRecord: {
        findUnique: jest.fn().mockResolvedValue(existingRecord),
        update: jest.fn(),
      },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.delete(11, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    expect(mockTx.seatZone.update).not.toHaveBeenCalled();
  });
});

// Task C: REFUNDED status on cancel (BS8)
describe("SalesService.delete — REFUNDED status (BS8)", () => {
  it("sets status=REFUNDED when soft-deleting a sales record", async () => {
    const existingRecord = { id: 20, seatZoneId: null, quantity: 3, deletedAt: null };
    const mockTx = {
      ledgerEntry: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      salesRecord: {
        findUnique: jest.fn().mockResolvedValue(existingRecord),
        update: jest.fn(),
      },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.delete(20, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5");
    expect(mockTx.salesRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 20 },
        data: expect.objectContaining({ status: "REFUNDED" }),
      }),
    );
  });
});

// Double-cancel protection
describe("SalesService.delete — double-cancel protection", () => {
  it("throws ALREADY_CANCELLED when record is already soft-deleted", async () => {
    const alreadyDeleted = { id: 50, seatZoneId: null, quantity: 1, deletedAt: new Date("2026-08-01") };
    const mockTx = {
      ledgerEntry: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      salesRecord: {
        findUnique: jest.fn().mockResolvedValue(alreadyDeleted),
        update: jest.fn(),
      },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await expect(service.delete(50, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1")).rejects.toThrow(new AppError(400, "ALREADY_CANCELLED"));
    // must NOT have attempted the soft-delete update or soldCount decrement
    expect(mockTx.salesRecord.update).not.toHaveBeenCalled();
    expect(mockTx.seatZone.update).not.toHaveBeenCalled();
  });

  it("throws SALES_RECORD_NOT_FOUND when record does not exist", async () => {
    const mockTx = {
      ledgerEntry: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      salesRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await expect(service.delete(999, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1")).rejects.toThrow(new AppError(404, "SALES_RECORD_NOT_FOUND"));
  });
});

describe("SalesService.delete — reversal ledger entry (L1)", () => {
  it("creates a reversal entry when a linked ledger entry exists", async () => {
    const existingEntry = {
      id: 5, type: "INCOME", category: "TICKET_SALE",
      amount: 30000, currency: "KRW", exchangeRate: 1, amountKrw: 30000,
      reversedById: null,
    };
    const ledgerCreate = jest.fn().mockResolvedValue({ id: 6 });
    const ledgerUpdate = jest.fn();
    const mockTx = {
      ledgerEntry: {
        findFirst: jest.fn().mockResolvedValue(existingEntry),
        create: ledgerCreate,
        update: ledgerUpdate,
      },
      salesRecord: {
        findUnique: jest.fn().mockResolvedValue({ id: 10, seatZoneId: null, quantity: 1, deletedAt: null }),
        update: jest.fn(),
      },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn: any) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.delete(10, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    expect(ledgerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "REFUND",
          amount: -30000,
          amountKrw: -30000,
          isRefund: true,
          reversalOfId: 5,
        }),
      }),
    );
    expect(ledgerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 5 },
        data: { reversedById: 6 },
      }),
    );
  });

  it("skips reversal when no linked ledger entry exists", async () => {
    const ledgerCreate = jest.fn();
    const mockTx = {
      ledgerEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: ledgerCreate,
        update: jest.fn(),
      },
      salesRecord: {
        findUnique: jest.fn().mockResolvedValue({ id: 20, seatZoneId: null, quantity: 1, deletedAt: null }),
        update: jest.fn(),
      },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn: any) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.delete(20, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    expect(ledgerCreate).not.toHaveBeenCalled();
  });
});

// Task D: Auto LedgerEntry for UNIFORM/OTHER (JO7)
describe("SalesService.create — LedgerEntry for UNIFORM/OTHER (JO7)", () => {
  it("creates a ledgerEntry with UNIFORM_SALES category for UNIFORM sale", async () => {
    const txRecord = { id: 30, type: "UNIFORM", quantity: 2, unitPrice: 80000, totalAmount: 160000 };
    const mockTx = {
      salesRecord: { create: jest.fn().mockResolvedValue(txRecord) },
      ledgerEntry: { create: jest.fn() },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.create(
      { type: "UNIFORM", quantity: 2, unitPrice: 80000, saleDate: "2026-08-05" } as any,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    );
    expect(mockTx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "UNIFORM_SALES",
          amount: 160000,
          type: "INCOME",
          isRefund: false,
        }),
      }),
    );
  });

  it("creates a ledgerEntry with OTHER category for OTHER sale", async () => {
    const txRecord = { id: 31, type: "OTHER", quantity: 1, unitPrice: 5000, totalAmount: 5000 };
    const mockTx = {
      salesRecord: { create: jest.fn().mockResolvedValue(txRecord) },
      ledgerEntry: { create: jest.fn() },
      seatZone: { update: jest.fn() },
    };
    const prisma = makePrisma({
      $transaction: jest.fn().mockImplementation((fn) => fn(mockTx)),
    } as any);
    const service = new SalesService(makeRepo(), prisma);
    await service.create(
      { type: "OTHER", quantity: 1, unitPrice: 5000, saleDate: "2026-08-05" } as any,
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    );
    expect(mockTx.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "OTHER",
          amount: 5000,
          type: "INCOME",
          isRefund: false,
        }),
      }),
    );
  });
});
