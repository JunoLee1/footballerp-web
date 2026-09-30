import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock getPrisma to return a shared mock client
const mockClient: any = {
  user: { findUnique: jest.fn(), findFirst: jest.fn() },
  medicalEquipmentLoanLedger: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  equipmentLoan: { create: jest.fn(), update: jest.fn() },
  operatingExpense: { update: jest.fn() },
  department: { findFirst: jest.fn() },
  $transaction: jest.fn(),
};

jest.mock("../../src/lib/prisma", () => ({
  getPrisma: () => mockClient,
}));

jest.mock("../../src/medical-equipment-loan/helpers/resolvePartnerDiscount", () => ({
  resolvePartnerDiscount: jest.fn(),
}));

jest.mock("../../src/medical-equipment-loan/helpers/checkAndReserveBudget", () => ({
  checkAndReserveBudget: jest.fn(),
}));

const mockCreate = jest.fn();
const mockCreateForMedicalDirector = jest.fn();
const mockCreateForGM = jest.fn();
jest.mock("../../src/notification/notification.repo", () => ({
  NotificationRepository: jest.fn().mockImplementation(() => ({
    create: mockCreate,
    createForMedicalDirector: mockCreateForMedicalDirector,
    createForGM: mockCreateForGM,
  })),
}));

import { resolvePartnerDiscount } from "../../src/medical-equipment-loan/helpers/resolvePartnerDiscount";
import { checkAndReserveBudget } from "../../src/medical-equipment-loan/helpers/checkAndReserveBudget";

const mockResolvePartnerDiscount = resolvePartnerDiscount as jest.MockedFunction<typeof resolvePartnerDiscount>;
const mockCheckAndReserveBudget = checkAndReserveBudget as jest.MockedFunction<typeof checkAndReserveBudget>;

describe("MedicalEquipmentLoanService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: $transaction runs the callback with the mock client
    mockClient.$transaction.mockImplementation((fn: any) => fn(mockClient));
    mockClient.department.findFirst.mockResolvedValue({ id: 99 }); // medical dept
    mockCreateForMedicalDirector.mockResolvedValue(undefined);
    mockCreateForGM.mockResolvedValue(undefined);
    mockCreate.mockResolvedValue(undefined);
  });

  // ─── 권한 ────────────────────────────────────────────────────────────────

  describe("requestNormalLoan — 권한 검증", () => {
    it("MEDICAL 역할 요청자 성공", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 1, role: "STAFF", coachingRole: "MEDICAL", nickname: "의무사",
      });
      mockResolvePartnerDiscount.mockResolvedValue({
        partnerId: null, partnerContractId: null, sponsorshipId: null, discountRate: 0,
      });
      mockCheckAndReserveBudget.mockResolvedValue({ operatingExpenseId: 10 });
      mockClient.equipmentLoan.create.mockResolvedValue({ id: 100, status: "REQUESTED" });
      mockClient.medicalEquipmentLoanLedger.create.mockImplementation((args: any) => ({
        id: 1, ...args.data,
      }));

      const { requestNormalLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      const result = await requestNormalLoan(1, {
        equipmentItemId: 5, originalCost: 50000, budgetLineId: 3, seasonId: 1, categoryId: 2,
      });
      expect(result.ledger).toBeDefined();
      expect(result.loan.id).toBe(100);
    });

    it("MEDICAL 역할 없는 사용자 403", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 2, role: "STAFF", coachingRole: null, nickname: "일반 직원",
      });
      const { requestNormalLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      await expect(
        requestNormalLoan(2, {
          equipmentItemId: 5, originalCost: 50000, budgetLineId: 3, seasonId: 1, categoryId: 2,
        })
      ).rejects.toMatchObject({ statusCode: 403, code: "MEDICAL_ROLE_REQUIRED" });
    });
  });

  // ─── 파트너 할인 ─────────────────────────────────────────────────────────

  describe("requestNormalLoan — 파트너 할인", () => {
    it("Sponsorship 있으면 discountRate=100, finalCost=0", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 1, role: "STAFF", coachingRole: "MEDICAL", nickname: "의무사",
      });
      mockResolvePartnerDiscount.mockResolvedValue({
        partnerId: 7, partnerContractId: null, sponsorshipId: 3, discountRate: 100,
      });
      mockCheckAndReserveBudget.mockResolvedValue({ operatingExpenseId: 10 });
      mockClient.equipmentLoan.create.mockResolvedValue({ id: 101 });
      mockClient.medicalEquipmentLoanLedger.create.mockImplementation((args: any) => ({
        id: 2, ...args.data,
      }));

      const { requestNormalLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      const result = await requestNormalLoan(1, {
        equipmentItemId: 5, originalCost: 100000, budgetLineId: 3, seasonId: 1, categoryId: 2,
      });
      expect(result.ledger.finalCost).toBe(0);
      expect(result.ledger.discountRate).toBe(100);
    });

    it("PartnerContract discountRate=30 → finalCost=70000", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 1, role: "STAFF", coachingRole: "MEDICAL", nickname: "의무사",
      });
      mockResolvePartnerDiscount.mockResolvedValue({
        partnerId: 8, partnerContractId: 5, sponsorshipId: null, discountRate: 30,
      });
      mockCheckAndReserveBudget.mockResolvedValue({ operatingExpenseId: 11 });
      mockClient.equipmentLoan.create.mockResolvedValue({ id: 102 });
      mockClient.medicalEquipmentLoanLedger.create.mockImplementation((args: any) => ({
        id: 3, ...args.data,
      }));

      const { requestNormalLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      const result = await requestNormalLoan(1, {
        equipmentItemId: 5, originalCost: 100000, budgetLineId: 3, seasonId: 1, categoryId: 2,
      });
      expect(result.ledger.finalCost).toBe(70000);
    });
  });

  // ─── 예산 초과 ────────────────────────────────────────────────────────────

  describe("requestNormalLoan — 예산 체크", () => {
    it("BUDGET_EXCEEDED 시 400 throw", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 1, role: "STAFF", coachingRole: "MEDICAL", nickname: "의무사",
      });
      mockResolvePartnerDiscount.mockResolvedValue({
        discountRate: 0, partnerId: null, partnerContractId: null, sponsorshipId: null,
      });
      mockCheckAndReserveBudget.mockRejectedValue({ statusCode: 400, code: "BUDGET_EXCEEDED" });

      const { requestNormalLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      await expect(
        requestNormalLoan(1, {
          equipmentItemId: 5, originalCost: 9999999, budgetLineId: 3, seasonId: 1, categoryId: 2,
        })
      ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    });
  });

  // ─── 응급 대여 ────────────────────────────────────────────────────────────

  describe("requestEmergencyLoan", () => {
    it("emergencyReason 없으면 400", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 1, role: "STAFF", coachingRole: "MEDICAL", nickname: "의무사",
      });
      const { requestEmergencyLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      await expect(
        requestEmergencyLoan(1, {
          equipmentItemId: 5, originalCost: 50000, emergencyReason: "",
        })
      ).rejects.toMatchObject({ statusCode: 400, code: "EMERGENCY_REASON_REQUIRED" });
    });

    it("응급 요청 성공 시 status=EMERGENCY_PENDING_POST_APPROVAL, budgetLineId 없음", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 1, role: "STAFF", coachingRole: "MEDICAL", nickname: "의무사",
      });
      mockResolvePartnerDiscount.mockResolvedValue({
        discountRate: 0, partnerId: null, partnerContractId: null, sponsorshipId: null,
      });
      mockClient.equipmentLoan.create.mockResolvedValue({ id: 103, status: "ISSUED" });
      mockClient.medicalEquipmentLoanLedger.create.mockImplementation((args: any) => ({
        id: 4, ...args.data,
      }));

      const { requestEmergencyLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      const result = await requestEmergencyLoan(1, {
        equipmentItemId: 5, originalCost: 50000, emergencyReason: "선수 응급 처치",
      });
      expect(result.ledger.status).toBe("EMERGENCY_PENDING_POST_APPROVAL");
      expect(result.ledger.budgetLineId).toBeUndefined();
      // budget check NOT called
      expect(mockCheckAndReserveBudget).not.toHaveBeenCalled();
    });
  });

  // ─── 자기 자신 승인 차단 ──────────────────────────────────────────────────

  describe("approveLoan — self-approval block", () => {
    it("요청자 == 승인자 (비admin) → 403", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 1, role: "STAFF", coachingRole: "MEDICAL_DIRECTOR", nickname: "팀장",
      });
      mockClient.medicalEquipmentLoanLedger.findUnique.mockResolvedValue({
        id: 10,
        status: "DRAFT",
        requestedById: "00000000-0000-4000-8000-000000000001",
        equipmentLoanId: 100,
        finalCost: 50000,
        operatingExpenseId: null,
        equipmentLoan: { equipmentItem: { name: "AED" } },
      });

      const { approveLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      await expect(approveLoan(10, "00000000-0000-4000-8000-000000000001")).rejects.toMatchObject({
        statusCode: 403, code: "SELF_APPROVAL_FORBIDDEN",
      });
    });

    it("admin 은 자기 승인 가능", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 1, role: "ADMIN", coachingRole: null, nickname: "관리자",
      });
      mockClient.medicalEquipmentLoanLedger.findUnique.mockResolvedValue({
        id: 10,
        status: "DRAFT",
        requestedById: "00000000-0000-4000-8000-000000000001",
        equipmentLoanId: 100,
        finalCost: 50000,
        operatingExpenseId: 5,
        budgetLineId: 3,
        equipmentLoan: { equipmentItem: { name: "AED" } },
      });
      mockClient.equipmentLoan.update.mockResolvedValue({});
      mockClient.medicalEquipmentLoanLedger.update.mockResolvedValue({
        id: 10, status: "APPROVED",
      });

      const { approveLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      await expect(approveLoan(10, 1)).resolves.toBeDefined();
    });
  });

  // ─── 응급 사후 승인 backfill ──────────────────────────────────────────────

  describe("approveLoan — 응급 사후 backfill", () => {
    it("EMERGENCY_PENDING 승인 시 budgetLineId 없으면 400", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 2, role: "STAFF", coachingRole: "MEDICAL_DIRECTOR", nickname: "팀장",
      });
      mockClient.medicalEquipmentLoanLedger.findUnique.mockResolvedValue({
        id: 11,
        status: "EMERGENCY_PENDING_POST_APPROVAL",
        requestedById: "00000000-0000-4000-8000-000000000001",
        equipmentLoanId: 101,
        finalCost: 30000,
        operatingExpenseId: null,
        budgetLineId: null,
        equipmentLoan: { equipmentItem: { name: "부목" } },
      });

      const { approveLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      await expect(approveLoan(11, 2, {})).rejects.toMatchObject({
        statusCode: 400,
        code: "BUDGET_LINE_REQUIRED_FOR_EMERGENCY_BACKFILL",
      });
    });
  });

  // ─── 응급 반려 → RETURN_REQUIRED 알림 ──────────────────────────────────

  describe("rejectLoan — emergency rejected", () => {
    it("EMERGENCY_PENDING_POST_APPROVAL 반려 시 RETURN_REQUIRED 알림 발송", async () => {
      mockClient.user.findUnique.mockResolvedValue({
        id: 2, role: "STAFF", coachingRole: "MEDICAL_DIRECTOR", nickname: "팀장",
      });
      mockClient.medicalEquipmentLoanLedger.findUnique.mockResolvedValue({
        id: 11,
        status: "EMERGENCY_PENDING_POST_APPROVAL",
        requestedById: "00000000-0000-4000-8000-000000000001",
        equipmentLoanId: 101,
        equipmentLoan: { equipmentItem: { name: "부목" } },
      });
      mockClient.medicalEquipmentLoanLedger.update.mockResolvedValue({
        id: 11, status: "EMERGENCY_REJECTED",
      });

      const { rejectLoan } = await import(
        "../../src/medical-equipment-loan/medical-equipment-loan.service"
      );
      await rejectLoan(11, 2, { rejectionReason: "불필요 물품" });
      // Called twice: EMERGENCY_REJECTED notification + RETURN_REQUIRED notification
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: "MEDICAL_EQUIPMENT_LOAN_RETURN_REQUIRED" })
      );
    });
  });
});
