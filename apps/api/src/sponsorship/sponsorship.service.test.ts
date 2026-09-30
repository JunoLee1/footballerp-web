import { SponsorshipService } from "./sponsorship.service";
import { fetchKrwRate } from "../lib/exchangeRate";

jest.mock("../lib/exchangeRate", () => ({
  fetchKrwRate: jest.fn(),
}));

const makeRepo = () => ({
  findBySponsorName: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  createPayments: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn().mockResolvedValue({
    id: 1,
    sponsorName: "테스트",
    isOverseas: false,
    payments: [],
  }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const makeMarkPaidRepo = (overrides: Record<string, any> = {}) => ({
  ...makeRepo(),
  findPaymentById: jest.fn(),
  updatePayment: jest.fn(),
  ...overrides,
});

const makeMarkPaidLedger = () => ({
  createAutoEntry: jest.fn().mockResolvedValue(undefined),
});

const makeLedger = () => ({} as any);

describe("SponsorshipService.create — region fields", () => {
  it("국내 스폰서 생성 시 isOverseas:false 와 businessRegNumber 를 repo.create 에 전달한다", async () => {
    const repo = makeRepo();
    const service = new SponsorshipService(repo as any, makeLedger());
    await service.create(
      {
        sponsorName: "테스트",
        type: "TITLE",
        totalFee: 1_000_000,
        contractStart: "2026-01-01",
        contractEnd: "2026-12-31",
        paymentSchedule: "ANNUAL",
        isOverseas: false,
        businessRegNumber: "123-45-67890",
        postalCode: "06236",
        address: "서울 강남구 테헤란로 427",
        addressDetail: "10층",
      },
      "11111111-1111-1111-1111-111111111111",
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isOverseas: false,
        businessRegNumber: "123-45-67890",
        postalCode: "06236",
        address: "서울 강남구 테헤란로 427",
        addressDetail: "10층",
      }),
    );
  });

  it("해외 스폰서 생성 시 isOverseas:true 와 taxId 를 repo.create 에 전달한다", async () => {
    const repo = makeRepo();
    const service = new SponsorshipService(repo as any, makeLedger());
    await service.create(
      {
        sponsorName: "Overseas Corp",
        type: "KIT",
        totalFee: 500_000,
        contractStart: "2026-01-01",
        contractEnd: "2026-12-31",
        paymentSchedule: "ANNUAL",
        isOverseas: true,
        taxId: "GB123456789",
        overseasAddress: "10 Downing Street, London",
      },
      "22222222-2222-2222-2222-222222222222",
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isOverseas: true,
        taxId: "GB123456789",
        overseasAddress: "10 Downing Street, London",
      }),
    );
  });
});

describe("SponsorshipService.markPaid — PA4/PA6 paths", () => {
  const SPONSORSHIP_ID = "cmxtestspons0000000000010";
  const PAYMENT_ID = "cmxtestpayment0000000020";
  const USER_ID = "33333333-3333-3333-3333-333333333333";

  const makeKrwSponsorship = () => ({
    id: SPONSORSHIP_ID,
    sponsorName: "Test Sponsor",
    isOverseas: false,
    currency: "KRW",
    payments: [],
  });

  const makeUsdSponsorship = () => ({
    id: SPONSORSHIP_ID,
    sponsorName: "Global Sponsor",
    isOverseas: true,
    currency: "USD",
    payments: [],
  });

  const makePendingPayment = (amount: number = 1_000_000) => ({
    id: PAYMENT_ID,
    sponsorshipId: SPONSORSHIP_ID,
    amount,
    status: "PENDING",
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses dto.adjustedAmount for ledger when provided", async () => {
    const repo = makeMarkPaidRepo({
      findById: jest.fn().mockResolvedValue(makeKrwSponsorship()),
      findPaymentById: jest.fn().mockResolvedValue(makePendingPayment(1_000_000)),
      updatePayment: jest.fn().mockResolvedValue({ id: PAYMENT_ID, status: "PAID" }),
    });
    const ledger = makeMarkPaidLedger();
    const service = new SponsorshipService(repo as any, ledger as any);

    await service.markPaid(SPONSORSHIP_ID, PAYMENT_ID, USER_ID, { adjustedAmount: 800_000 });

    expect(ledger.createAutoEntry).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 800_000 }),
      USER_ID,
    );
  });

  it("throws 400 INVALID_PAYMENT_AMOUNT when dto.adjustedAmount <= 0", async () => {
    const repo = makeMarkPaidRepo({
      findById: jest.fn().mockResolvedValue(makeKrwSponsorship()),
      findPaymentById: jest.fn().mockResolvedValue(makePendingPayment(1_000_000)),
    });
    const ledger = makeMarkPaidLedger();
    const service = new SponsorshipService(repo as any, ledger as any);

    await expect(
      service.markPaid(SPONSORSHIP_ID, PAYMENT_ID, USER_ID, { adjustedAmount: 0 }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_PAYMENT_AMOUNT" });
  });

  it("uses dto.exchangeRate without fetching when provided for non-KRW sponsorship", async () => {
    const repo = makeMarkPaidRepo({
      findById: jest.fn().mockResolvedValue(makeUsdSponsorship()),
      findPaymentById: jest.fn().mockResolvedValue(makePendingPayment(100)),
      updatePayment: jest.fn().mockResolvedValue({ id: PAYMENT_ID, status: "PAID" }),
    });
    const ledger = makeMarkPaidLedger();
    const service = new SponsorshipService(repo as any, ledger as any);

    await service.markPaid(SPONSORSHIP_ID, PAYMENT_ID, USER_ID, { exchangeRate: 1350 });

    expect(fetchKrwRate).not.toHaveBeenCalled();
    expect(ledger.createAutoEntry).toHaveBeenCalledWith(
      expect.objectContaining({ exchangeRate: 1350, amountKrw: 135000 }),
      USER_ID,
    );
  });

  it("throws 400 INVALID_EXCHANGE_RATE when dto.exchangeRate <= 0", async () => {
    const repo = makeMarkPaidRepo({
      findById: jest.fn().mockResolvedValue(makeUsdSponsorship()),
      findPaymentById: jest.fn().mockResolvedValue(makePendingPayment(100)),
    });
    const ledger = makeMarkPaidLedger();
    const service = new SponsorshipService(repo as any, ledger as any);

    await expect(
      service.markPaid(SPONSORSHIP_ID, PAYMENT_ID, USER_ID, { exchangeRate: 0 }),
    ).rejects.toMatchObject({ statusCode: 400, code: "INVALID_EXCHANGE_RATE" });
  });

  it("fetches live rate when non-KRW and no dto.exchangeRate", async () => {
    (fetchKrwRate as jest.Mock).mockResolvedValue(1380);
    const repo = makeMarkPaidRepo({
      findById: jest.fn().mockResolvedValue(makeUsdSponsorship()),
      findPaymentById: jest.fn().mockResolvedValue(makePendingPayment(100)),
      updatePayment: jest.fn().mockResolvedValue({ id: PAYMENT_ID, status: "PAID" }),
    });
    const ledger = makeMarkPaidLedger();
    const service = new SponsorshipService(repo as any, ledger as any);

    await service.markPaid(SPONSORSHIP_ID, PAYMENT_ID, USER_ID, {});

    expect(fetchKrwRate).toHaveBeenCalledWith("USD");
    expect(ledger.createAutoEntry).toHaveBeenCalledWith(
      expect.objectContaining({ exchangeRate: 1380, amountKrw: 138000 }),
      USER_ID,
    );
  });

  it("throws 502 EXCHANGE_RATE_UNAVAILABLE when fetch returns null", async () => {
    (fetchKrwRate as jest.Mock).mockResolvedValue(null);
    const repo = makeMarkPaidRepo({
      findById: jest.fn().mockResolvedValue(makeUsdSponsorship()),
      findPaymentById: jest.fn().mockResolvedValue(makePendingPayment(100)),
    });
    const ledger = makeMarkPaidLedger();
    const service = new SponsorshipService(repo as any, ledger as any);

    await expect(
      service.markPaid(SPONSORSHIP_ID, PAYMENT_ID, USER_ID, {}),
    ).rejects.toMatchObject({ statusCode: 502, code: "EXCHANGE_RATE_UNAVAILABLE" });
  });
});
