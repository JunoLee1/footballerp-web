import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { EquipmentService } from "../../src/equipment/equipment.service";

const FUTURE_DUE = new Date(Date.now() + 14 * 86_400_000).toISOString();
const PAST_DUE   = new Date(Date.now() -  1 * 86_400_000).toISOString();

const mockEquipmentRepo = {
  findAllItems: jest.fn(),
  findItemById: jest.fn(),
  createItem: jest.fn(),
  adjustQuantity: jest.fn(),
  createUnit: jest.fn(),
  findUnitById: jest.fn(),
  updateUnitStatus: jest.fn(),
  createAssignment: jest.fn(),
  findUnreturnedByPlayer: jest.fn(),
  findAssignmentById: jest.fn(),
  markReturned: jest.fn(),
  findEquipmentManagers: jest.fn<() => Promise<{ id: number }[]>>().mockResolvedValue([{ id: 10 }]),
  findLoanById: jest.fn(),
  findAllLoans: jest.fn(),
  findMyLoans: jest.fn(),
  createLoan: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, status: "REQUESTED" }),
  updateLoan: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  returnLoan: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, status: "RETURNED" }),
  hasActiveOverdueLoan: jest.fn<() => Promise<{ id: number } | null>>().mockResolvedValue(null),
} as any;

const mockNotificationRepo = { create: jest.fn<() => Promise<any>>().mockResolvedValue({}), createForStaff: jest.fn() } as any;
const mockLedgerService = { createAutoEntry: jest.fn<() => Promise<any>>().mockResolvedValue({}) } as any;

jest.mock("../../src/lib/auditLog", () => ({
  writeAuditLog: jest.fn(() => Promise.resolve()),
}));
import { writeAuditLog } from "../../src/lib/auditLog";

const service = new EquipmentService(mockEquipmentRepo, mockNotificationRepo, mockLedgerService);

describe("EquipmentService - requestLoan · dueDate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEquipmentRepo.findItemById.mockResolvedValue({ id: 1, name: "훈련화", quantity: 5 });
    mockEquipmentRepo.hasActiveOverdueLoan.mockResolvedValue(null);
    mockEquipmentRepo.findEquipmentManagers.mockResolvedValue([{ id: 10 }]);
  });

  test("dueDate 지정 → 대여 신청 생성 + EQUIPMENT_MANAGER 알림", async () => {
    await service.requestLoan(99, { equipmentItemId: 1, dueDate: FUTURE_DUE });
    expect(mockEquipmentRepo.createLoan).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ equipmentItemId: 1, dueDate: FUTURE_DUE }),
      undefined,
    );
    expect(mockNotificationRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 10, type: "EQUIPMENT_LOAN_REQUESTED" }),
    );
  });

  test("dueDate 누락 → 400 DUE_DATE_REQUIRED", async () => {
    await expect(service.requestLoan(99, { equipmentItemId: 1 } as any))
      .rejects.toMatchObject({ code: "DUE_DATE_REQUIRED" });
    expect(mockEquipmentRepo.createLoan).not.toHaveBeenCalled();
  });

  test("dueDate 형식 오류 → 400 INVALID_DUE_DATE", async () => {
    await expect(service.requestLoan(99, { equipmentItemId: 1, dueDate: "not-a-date" }))
      .rejects.toMatchObject({ code: "INVALID_DUE_DATE" });
  });

  test("과거 dueDate → 400 DUE_DATE_MUST_BE_FUTURE", async () => {
    await expect(service.requestLoan(99, { equipmentItemId: 1, dueDate: PAST_DUE }))
      .rejects.toMatchObject({ code: "DUE_DATE_MUST_BE_FUTURE" });
  });

  test("활성 연체 대여 있으면 403 HAS_ACTIVE_OVERDUE_LOAN", async () => {
    mockEquipmentRepo.hasActiveOverdueLoan.mockResolvedValue({ id: 42 });
    await expect(service.requestLoan(99, { equipmentItemId: 1, dueDate: FUTURE_DUE }))
      .rejects.toMatchObject({ code: "HAS_ACTIVE_OVERDUE_LOAN" });
    expect(mockEquipmentRepo.createLoan).not.toHaveBeenCalled();
  });
});

describe("EquipmentService - approveLoan / rejectLoan", () => {
  beforeEach(() => jest.clearAllMocks());

  test("REQUESTED 상태의 대여 승인", async () => {
    mockEquipmentRepo.findLoanById.mockResolvedValue({ id: 1, status: "REQUESTED", requestedBy: { id: 5 }, equipmentItem: { name: "훈련화" } });
    await service.approveLoan(1, 10);
    expect(mockEquipmentRepo.updateLoan).toHaveBeenCalledWith(1, expect.objectContaining({ status: "APPROVED", approvedById: 10 }));
  });

  test("REQUESTED가 아닌 상태에서 approveLoan 시 409", async () => {
    mockEquipmentRepo.findLoanById.mockResolvedValue({ id: 1, status: "ISSUED", requestedBy: { id: 5 }, equipmentItem: { name: "훈련화" } });
    await expect(service.approveLoan(1, 10)).rejects.toMatchObject({ code: "INVALID_LOAN_STATUS_TRANSITION" });
  });
});

describe("EquipmentService - returnLoan · latency audit", () => {
  beforeEach(() => jest.clearAllMocks());

  test("dueDate 이전 반납 → latencyDays=0", async () => {
    const dueDate = new Date(Date.now() + 7 * 86_400_000);
    mockEquipmentRepo.findLoanById.mockResolvedValue({
      id: 1, status: "ISSUED", dueDate, equipmentUnitId: null,
      requestedBy: { id: 5 }, equipmentItem: { name: "훈련화" },
    });
    await service.returnLoan(1, 10);
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "EQUIPMENT_LOAN_RETURNED",
      targetId: 1,
      detail: expect.objectContaining({ latencyDays: 0 }),
    }));
  });

  test("dueDate 지나서 반납 → latencyDays > 0", async () => {
    const dueDate = new Date(Date.now() - 3 * 86_400_000);
    mockEquipmentRepo.findLoanById.mockResolvedValue({
      id: 1, status: "ISSUED", dueDate, equipmentUnitId: null,
      requestedBy: { id: 5 }, equipmentItem: { name: "훈련화" },
    });
    await service.returnLoan(1, 10, "지연 반납");
    expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        latencyDays: expect.any(Number),
        returnNote: "지연 반납",
      }),
    }));
    const detail = (writeAuditLog as jest.Mock).mock.calls[0]![0] as { detail: { latencyDays: number } };
    expect(detail.detail.latencyDays).toBeGreaterThanOrEqual(3);
  });

  test("ISSUED가 아닌 상태에서 returnLoan → 409", async () => {
    mockEquipmentRepo.findLoanById.mockResolvedValue({
      id: 1, status: "APPROVED", dueDate: new Date(),
      requestedBy: { id: 5 }, equipmentItem: { name: "훈련화" },
    });
    await expect(service.returnLoan(1, 10)).rejects.toMatchObject({ code: "INVALID_LOAN_STATUS_TRANSITION" });
  });
});
