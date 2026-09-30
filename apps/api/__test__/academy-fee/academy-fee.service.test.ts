import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { AcademyFeeService } from "../../src/academy-fee/academy-fee.service";

const mockRepo = {
  findById: jest.fn(),
  findByPlayer: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  findAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  findAllActiveYouthPlayers: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  create: jest.fn(),
  createMany: jest.fn<() => Promise<any>>().mockResolvedValue({ count: 0 }),
  updateStatus: jest.fn(),
  submitPaymentProof: jest.fn(),
  approvePayment: jest.fn(),
  lockPlayer: jest.fn(),
  findOverdue: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  getFinanceStats: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
} as any;

const mockNotifRepo = {
  createForGuardian: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
} as any;

const service = new AcademyFeeService(mockRepo, mockNotifRepo);

describe("AcademyFeeService - issueMonthlyFees", () => {
  beforeEach(() => jest.clearAllMocks());

  test("활성 유소년 선수에게 청구서 발행", async () => {
    mockRepo.findAllActiveYouthPlayers.mockResolvedValue([
      { id: "player-1", playerName: "홍길동", guardianId: "00000000-0000-4000-8000-000000000010" },
      { id: "player-2", playerName: "김철수", guardianId: "00000000-0000-4000-8000-000000000011" },
    ]);
    await service.issueMonthlyFees(2026, 7, 50000);
    expect(mockRepo.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ playerId: "player-1", guardianId: "00000000-0000-4000-8000-000000000010", amount: 50000, year: 2026, month: 7 }),
      ]),
    );
    expect(mockNotifRepo.createForGuardian).toHaveBeenCalledTimes(2);
  });

  test("guardianId 없는 선수는 제외", async () => {
    mockRepo.findAllActiveYouthPlayers.mockResolvedValue([
      { id: "player-3", playerName: "이영희", guardianId: null },
    ]);
    await service.issueMonthlyFees(2026, 7, 50000);
    expect(mockRepo.createMany).toHaveBeenCalledWith([]);
  });
});

describe("AcademyFeeService - processOverdue", () => {
  beforeEach(() => jest.clearAllMocks());

  test("D+1: PENDING → 리마인더 발송", async () => {
    const dueDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    mockRepo.findOverdue.mockResolvedValue([
      { id: 1, status: "PENDING", dueDate, guardianId: "00000000-0000-4000-8000-000000000010", playerId: "p1",
        player: { playerName: "홍길동", status: "ACTIVE" } },
    ]);
    await service.processOverdue();
    expect(mockNotifRepo.createForGuardian).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000010", "FEE_REMINDER", expect.any(Function), 1,
    );
    expect(mockRepo.lockPlayer).not.toHaveBeenCalled();
  });

  test("D+30: LOCKED + Player suspended + 알림", async () => {
    const dueDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    mockRepo.findOverdue.mockResolvedValue([
      { id: 2, status: "OVERDUE", dueDate, guardianId: "00000000-0000-4000-8000-000000000011", playerId: "p2",
        player: { playerName: "김철수", status: "ACTIVE" } },
    ]);
    await service.processOverdue();
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(2, "LOCKED");
    expect(mockRepo.lockPlayer).toHaveBeenCalledWith("p2");
    expect(mockNotifRepo.createForGuardian).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000011", "FEE_ACCOUNT_LOCKED", expect.any(Function), 2,
    );
  });
});
