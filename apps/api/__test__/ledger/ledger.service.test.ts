import { LedgerService, ALLOWED_MODULES } from "../../src/ledger/ledger.service";
import { AppError } from "../../src/lib/appError";
import type { LedgerRepository } from "../../src/ledger/ledger.repo";

jest.mock("../../src/lib/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const makeRepo = (overrides: Partial<LedgerRepository> = {}): LedgerRepository => ({
  findById: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation(async (data) => ({ id: 1, ...data })),
  findAll: jest.fn().mockResolvedValue([]),
  isPeriodLocked: jest.fn().mockResolvedValue(false),
  lockPeriod: jest.fn().mockResolvedValue(null),
  ...overrides,
} as unknown as LedgerRepository);

describe("LedgerService", () => {
  it("throws 400 when amount is negative", async () => {
    const service = new LedgerService(makeRepo());
    await expect(service.create({ type: "EXPENSE", category: "OTHER", amount: -100 } as any, "11111111-1111-1111-1111-111111111111"))
      .rejects.toThrow(new AppError(400, "INVALID_AMOUNT"));
  });

  it("auto-calculates amountKrw from amount * exchangeRate", async () => {
    const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
    const service = new LedgerService(makeRepo({ create }));
    await service.create({ type: "EXPENSE", category: "OTHER", amount: 100, currency: "USD", exchangeRate: 1300 } as any, "11111111-1111-1111-1111-111111111111");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ amountKrw: 130000 }));
  });

  it("throws 404 when original entry not found in createRefund", async () => {
    const service = new LedgerService(makeRepo({ findById: jest.fn().mockResolvedValue(null) }));
    await expect(service.createRefund("le-999-x-x-x-x-x-x-x-x-x", "11111111-1111-1111-1111-111111111111"))
      .rejects.toThrow(new AppError(404, "LEDGER_ENTRY_NOT_FOUND"));
  });

  it("refund creates a negative entry and marks original as reversed", async () => {
    const markReversed = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockImplementation(async (data) => ({ id: 2, ...data }));
    const service = new LedgerService(makeRepo({
      findById: jest.fn().mockResolvedValue({
        id: 1, type: "EXPENSE", category: "SALARY",
        amount: 100, currency: "KRW", exchangeRate: 1, amountKrw: 100,
        relatedModule: null, relatedId: null, reversedById: null,
      }),
      create,
      markReversed,
    }));
    await service.createRefund("cle1x11111111111111111", "42424242-4242-4242-4242-424242424242");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      amount: -100, amountKrw: -100, isRefund: true, category: "REFUND",
    }));
    expect(markReversed).toHaveBeenCalledWith("cle1x11111111111111111", "cle2x11111111111111111");
  });

  it("throws 400 when trying to refund an already-reversed entry", async () => {
    const service = new LedgerService(makeRepo({
      findById: jest.fn().mockResolvedValue({
        id: 1, type: "EXPENSE", category: "SALARY",
        amount: 100, currency: "KRW", exchangeRate: 1, amountKrw: 100,
        relatedModule: null, relatedId: null, reversedById: 5,
      }),
    }));
    await expect(service.createRefund("cle1x11111111111111111", "42424242-4242-4242-4242-424242424242"))
      .rejects.toThrow(new AppError(400, "ALREADY_REVERSED"));
  });

  describe("exchange rate validation", () => {
    it("throws 400 when exchangeRate is 0", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.create({ type: "EXPENSE", category: "OTHER", amount: 100, exchangeRate: 0 } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_EXCHANGE_RATE"));
    });

    it("throws 400 when exchangeRate is negative", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.create({ type: "EXPENSE", category: "OTHER", amount: 100, exchangeRate: -5 } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_EXCHANGE_RATE"));
    });

    it("throws 400 when exchangeRate exceeds 10000", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.create({ type: "EXPENSE", category: "OTHER", amount: 100, exchangeRate: 10001 } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_EXCHANGE_RATE"));
    });

    it("accepts boundary values 0.01 and 10000", async () => {
      const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
      const service = new LedgerService(makeRepo({ create }));
      await service.create({ type: "EXPENSE", category: "OTHER", amount: 100, exchangeRate: 0.01 } as any, "11111111-1111-1111-1111-111111111111");
      await service.create({ type: "EXPENSE", category: "OTHER", amount: 100, exchangeRate: 10000 } as any, "11111111-1111-1111-1111-111111111111");
      expect(create).toHaveBeenCalledTimes(2);
    });

    it("defaults to rate 1 when exchangeRate is undefined", async () => {
      const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
      const service = new LedgerService(makeRepo({ create }));
      await service.create({ type: "EXPENSE", category: "OTHER", amount: 100, currency: "KRW" } as any, "11111111-1111-1111-1111-111111111111");
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ exchangeRate: 1 }));
    });

    it("validates exchangeRate in createAutoEntry", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.createAutoEntry({ type: "EXPENSE", category: "OTHER", amount: 100, exchangeRate: -1 } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_EXCHANGE_RATE"));
    });
  });

  describe("relatedModule validation", () => {
    it("throws 400 when relatedModule is not in whitelist", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.create({ type: "EXPENSE", category: "OTHER", amount: 100, relatedModule: "INVALID" } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_RELATED_MODULE"));
    });

    it("accepts all whitelisted modules", async () => {
      const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
      const service = new LedgerService(makeRepo({ create }));
      for (const module of ALLOWED_MODULES) {
        await service.create({ type: "EXPENSE", category: "OTHER", amount: 100, relatedModule: module } as any, "11111111-1111-1111-1111-111111111111");
      }
      expect(create).toHaveBeenCalledTimes(ALLOWED_MODULES.length);
    });

    it("allows undefined relatedModule", async () => {
      const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
      const service = new LedgerService(makeRepo({ create }));
      await service.create({ type: "EXPENSE", category: "OTHER", amount: 100 } as any, "11111111-1111-1111-1111-111111111111");
      expect(create).toHaveBeenCalled();
    });
  });

  describe("relatedId validation", () => {
    it("throws 400 when relatedId is 0", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.create({ type: "EXPENSE", category: "OTHER", amount: 100, relatedId: 0 } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_RELATED_ID"));
    });

    it("throws 400 when relatedId is negative", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.create({ type: "EXPENSE", category: "OTHER", amount: 100, relatedId: -5 } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_RELATED_ID"));
    });

    it("throws 400 when relatedId is not an integer", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.create({ type: "EXPENSE", category: "OTHER", amount: 100, relatedId: 1.5 } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_RELATED_ID"));
    });

    it("accepts positive integer relatedId", async () => {
      const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
      const service = new LedgerService(makeRepo({ create }));
      await service.create({ type: "EXPENSE", category: "OTHER", amount: 100, relatedId: 1 } as any, "11111111-1111-1111-1111-111111111111");
      expect(create).toHaveBeenCalled();
    });

    it("allows undefined relatedId", async () => {
      const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
      const service = new LedgerService(makeRepo({ create }));
      await service.create({ type: "EXPENSE", category: "OTHER", amount: 100 } as any, "11111111-1111-1111-1111-111111111111");
      expect(create).toHaveBeenCalled();
    });
  });

  describe("createAutoEntry validation", () => {
    it("validates exchangeRate but skips relatedModule/relatedId", async () => {
      const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
      const service = new LedgerService(makeRepo({ create }));
      await service.createAutoEntry({
        type: "EXPENSE", category: "OTHER", amount: 100,
        relatedModule: "INVALID", relatedId: -1,
      } as any, "11111111-1111-1111-1111-111111111111");
      expect(create).toHaveBeenCalled();
    });

    it("throws on invalid exchangeRate in createAutoEntry", async () => {
      const service = new LedgerService(makeRepo());
      await expect(service.createAutoEntry({ type: "EXPENSE", category: "OTHER", amount: 100, exchangeRate: 20000 } as any, "11111111-1111-1111-1111-111111111111"))
        .rejects.toThrow(new AppError(400, "INVALID_EXCHANGE_RATE"));
    });
  });
});

describe("LedgerService period lock", () => {
  it("throws 409 PERIOD_LOCKED when period is locked", async () => {
    const repo = makeRepo({
      isPeriodLocked: jest.fn().mockResolvedValue(true),
    });
    const service = new LedgerService(repo);
    await expect(
      service.create({ type: "EXPENSE", category: "OTHER", amount: 100 } as any, "11111111-1111-1111-1111-111111111111")
    ).rejects.toThrow(new AppError(409, "PERIOD_LOCKED"));
  });

  it("allows entry when period is not locked", async () => {
    const create = jest.fn().mockImplementation(async (data) => ({ id: 1, ...data }));
    const repo = makeRepo({
      isPeriodLocked: jest.fn().mockResolvedValue(false),
      create,
    });
    const service = new LedgerService(repo);
    await service.create({ type: "EXPENSE", category: "OTHER", amount: 100 } as any, "11111111-1111-1111-1111-111111111111");
    expect(create).toHaveBeenCalled();
  });

  it("lockPeriod throws 409 when already locked", async () => {
    const repo = makeRepo({
      isPeriodLocked: jest.fn().mockResolvedValue(true),
      lockPeriod: jest.fn(),
    });
    const service = new LedgerService(repo);
    await expect(service.lockPeriod(2025, 3, "11111111-1111-1111-1111-111111111111")).rejects.toThrow(
      new AppError(409, "PERIOD_ALREADY_LOCKED")
    );
  });

  it("lockPeriod succeeds when not locked", async () => {
    const lockPeriod = jest.fn().mockResolvedValue({ id: 1, year: 2025, month: 3 });
    const repo = makeRepo({
      isPeriodLocked: jest.fn().mockResolvedValue(false),
      lockPeriod,
    });
    const service = new LedgerService(repo);
    await service.lockPeriod(2025, 3, "11111111-1111-1111-1111-111111111111");
    expect(lockPeriod).toHaveBeenCalledWith(2025, 3, "11111111-1111-1111-1111-111111111111");
  });
});

describe("LedgerService period lock - createRefund", () => {
  const lockedOriginal = {
    id: 1, type: "EXPENSE", category: "SALARY",
    amount: 100, currency: "KRW", exchangeRate: 1, amountKrw: 100,
    relatedModule: null, relatedId: null, reversedById: null,
  };

  it("throws 409 PERIOD_LOCKED in createRefund when period is locked", async () => {
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(lockedOriginal),
      isPeriodLocked: jest.fn().mockResolvedValue(true),
    });
    const service = new LedgerService(repo);
    await expect(service.createRefund("cle1x11111111111111111", "42424242-4242-4242-4242-424242424242")).rejects.toThrow(new AppError(409, "PERIOD_LOCKED"));
  });

  it("allows refund when period is not locked", async () => {
    const create = jest.fn().mockImplementation(async (data) => ({ id: 2, ...data }));
    const markReversed = jest.fn().mockResolvedValue({});
    const repo = makeRepo({
      findById: jest.fn().mockResolvedValue(lockedOriginal),
      isPeriodLocked: jest.fn().mockResolvedValue(false),
      create,
      markReversed,
    });
    const service = new LedgerService(repo);
    await service.createRefund("cle1x11111111111111111", "42424242-4242-4242-4242-424242424242");
    expect(create).toHaveBeenCalled();
  });
});

describe("LedgerService createAutoEntry - period lock", () => {
  it("throws 409 PERIOD_LOCKED when period is locked", async () => {
    const repo = makeRepo({ isPeriodLocked: jest.fn().mockResolvedValue(true) });
    const service = new LedgerService(repo);
    await expect(
      service.createAutoEntry({ type: "EXPENSE", category: "SALARY", amount: 1000 } as any, "11111111-1111-1111-1111-111111111111")
    ).rejects.toThrow(new AppError(409, "PERIOD_LOCKED"));
  });
});
