import { describe, test, jest, expect, beforeEach } from "@jest/globals";

const mockRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findPlayerLevel: jest.fn(),
  findAll: jest.fn(),
  submit: jest.fn(),
  update: jest.fn(),
};
const mockNotifRepo = {
  createForMedicalDirector: jest.fn(),
};

jest.mock("../../src/lib/prisma", () => ({ getPrisma: () => ({}) }));

import { MedicalExpenseService } from "../../src/medical-expense/medical-expense.service";

describe("MedicalExpenseService — youth auto payerType", () => {
  let service: MedicalExpenseService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MedicalExpenseService(mockRepo as any, mockNotifRepo as any);
    mockRepo.create.mockResolvedValue({ id: 1, payerType: "CLUB" });
  });

  test("YOUTH player auto-sets payerType to CLUB regardless of submitted value", async () => {
    mockRepo.findPlayerLevel.mockResolvedValue("YOUTH");

    await service.create({
      submittedById: "00000000-0000-4000-8000-000000000001",
      receiptDate: new Date(),
      costCategory: "MEDICAL_TREATMENT",
      totalAmount: 50000,
      payerType: "INDIVIDUAL",
      playerId: "player-youth-1",
    });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ payerType: "CLUB" }),
    );
  });

  test("SENIOR player keeps submitted payerType", async () => {
    mockRepo.findPlayerLevel.mockResolvedValue("SENIOR");

    await service.create({
      submittedById: "00000000-0000-4000-8000-000000000001",
      receiptDate: new Date(),
      costCategory: "MEDICAL_TREATMENT",
      totalAmount: 50000,
      payerType: "INDIVIDUAL",
      playerId: "player-senior-1",
    });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ payerType: "INDIVIDUAL" }),
    );
  });

  test("no playerId keeps submitted payerType without lookup", async () => {
    await service.create({
      submittedById: "00000000-0000-4000-8000-000000000001",
      receiptDate: new Date(),
      costCategory: "MEDICAL_TREATMENT",
      totalAmount: 50000,
      payerType: "ASSOCIATION",
    });

    expect(mockRepo.findPlayerLevel).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ payerType: "ASSOCIATION" }),
    );
  });
});
