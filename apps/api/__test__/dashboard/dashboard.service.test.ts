import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { DashboardService } from "../../src/dashboard/dashboard.service";

const mockMedicalDashboard = {
  currentInjuredCount: 4,
  weekNewInjuryCount: 1,
  returningIn7DaysCount: 2,
  reinjuryRiskCount: 3,
  incompleteDocCount: 1,
  pendingApprovalCount: 5,
  avgRecoveryDays: 21,
  injuriesByPosition: { GK: 0, DF: 2, MF: 1, FW: 1 },
};

const mockRepo = {
  getAdminStats: jest.fn(),
  getGmStats: jest.fn(),
  getTdStats: jest.fn(),
  getContractManagerStats: jest.fn(),
  getScoutStats: jest.fn(),
  getEquipmentManagerStats: jest.fn(),
  getTacticalAnalystStats: jest.fn(),
  getHeadCoachStats: jest.fn(),
  getSpecialistCoachStats: jest.fn(),
  getPhysicalCoachStats: jest.fn(),
  getMedicalStats: jest.fn(),
  getMedicalDirectorStats: jest.fn(),
  getMedicalDashboardStats: jest.fn(),
  getPlayerStats: jest.fn(),
  getAgentStats: jest.fn(),
} as any;

const service = new DashboardService(mockRepo);

describe("DashboardService.getStats", () => {
  beforeEach(() => jest.clearAllMocks());

  test("ADMIN → getAdminStats 호출", async () => {
    mockRepo.getAdminStats.mockResolvedValue({ activePlayerCount: 30 });
    const result = await service.getStats({ id: "00000000-0000-4000-8000-000000000001", role: "ADMIN", coachingRole: null, frontOfficeRole: null });
    expect(mockRepo.getAdminStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ activePlayerCount: 30 });
  });

  test("GM → getGmStats 호출", async () => {
    mockRepo.getGmStats.mockResolvedValue({ expiringContractCount: 2 });
    const result = await service.getStats({ id: "00000000-0000-4000-8000-000000000002", role: "GM", coachingRole: null, frontOfficeRole: null });
    expect(mockRepo.getGmStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ expiringContractCount: 2 });
  });

  test("FRONT_OFFICE + TD → getTdStats 호출", async () => {
    mockRepo.getTdStats.mockResolvedValue({ prospectCount: 5 });
    await service.getStats({ id: "00000000-0000-4000-8000-000000000003", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TD" });
    expect(mockRepo.getTdStats).toHaveBeenCalledTimes(1);
  });

  test("FRONT_OFFICE + CONTRACT_MANAGER → getContractManagerStats 호출", async () => {
    mockRepo.getContractManagerStats.mockResolvedValue({ expiringContractCount: 1 });
    await service.getStats({ id: "00000000-0000-4000-8000-000000000004", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "CONTRACT_MANAGER" });
    expect(mockRepo.getContractManagerStats).toHaveBeenCalledTimes(1);
  });

  test("FRONT_OFFICE + SCOUT → getScoutStats 호출", async () => {
    mockRepo.getScoutStats.mockResolvedValue({ prospectCount: 10 });
    await service.getStats({ id: "00000000-0000-4000-8000-000000000005", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "SCOUT" });
    expect(mockRepo.getScoutStats).toHaveBeenCalledTimes(1);
  });

  test("FRONT_OFFICE + EQUIPMENT_MANAGER → getEquipmentManagerStats 호출", async () => {
    mockRepo.getEquipmentManagerStats.mockResolvedValue({ lowStockEquipmentCount: 3 });
    const result = await service.getStats({ id: "00000000-0000-4000-8000-000000000006", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "EQUIPMENT_MANAGER" });
    expect(mockRepo.getEquipmentManagerStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ lowStockEquipmentCount: 3 });
  });

  test("FRONT_OFFICE + TACTICAL_ANALYST → getTacticalAnalystStats(userId) 호출", async () => {
    mockRepo.getTacticalAnalystStats.mockResolvedValue({ myDraftAnalysisCount: 2 });
    await service.getStats({ id: "00000000-0000-4000-8000-000000000007", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "TACTICAL_ANALYST" });
    expect(mockRepo.getTacticalAnalystStats).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000007");
  });

  test("COACHING_STAFF + HEAD_COACH → getHeadCoachStats + getMedicalDashboardStats 병합 반환", async () => {
    mockRepo.getHeadCoachStats.mockResolvedValue({ injuredPlayerCount: 2, thisMonthSessionCount: 5, attendanceWarningPlayerCount: 1 });
    mockRepo.getMedicalDashboardStats.mockResolvedValue(mockMedicalDashboard);
    const result = await service.getStats({ id: "00000000-0000-4000-8000-000000000008", role: "COACHING_STAFF", coachingRole: "HEAD_COACH", frontOfficeRole: null });
    expect(mockRepo.getHeadCoachStats).toHaveBeenCalledTimes(1);
    expect(mockRepo.getMedicalDashboardStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ injuredPlayerCount: 2, thisMonthSessionCount: 5, attendanceWarningPlayerCount: 1, medicalDashboard: mockMedicalDashboard });
  });

  test("COACHING_STAFF + ASSISTANT_COACH → getHeadCoachStats만 호출 (medicalDashboard 없음)", async () => {
    mockRepo.getHeadCoachStats.mockResolvedValue({ injuredPlayerCount: 2, thisMonthSessionCount: 5, attendanceWarningPlayerCount: 1 });
    const result = await service.getStats({ id: "00000000-0000-4000-8000-000000000009", role: "COACHING_STAFF", coachingRole: "ASSISTANT_COACH", frontOfficeRole: null });
    expect(mockRepo.getHeadCoachStats).toHaveBeenCalledTimes(1);
    expect(mockRepo.getMedicalDashboardStats).not.toHaveBeenCalled();
    expect(result).toEqual({ injuredPlayerCount: 2, thisMonthSessionCount: 5, attendanceWarningPlayerCount: 1 });
    expect((result as any).medicalDashboard).toBeUndefined();
  });

  test("COACHING_STAFF + DEFENSIVE_COACH → getSpecialistCoachStats(coachingRole, userId) 호출", async () => {
    mockRepo.getSpecialistCoachStats.mockResolvedValue({ assignedPlayerCount: 8 });
    await service.getStats({ id: "00000000-0000-4000-8000-000000000010", role: "COACHING_STAFF", coachingRole: "DEFENSIVE_COACH", frontOfficeRole: null });
    expect(mockRepo.getSpecialistCoachStats).toHaveBeenCalledWith("DEFENSIVE_COACH", "00000000-0000-4000-8000-000000000010");
  });

  test("COACHING_STAFF + PHYSICAL_COACH → getPhysicalCoachStats(userId) 호출", async () => {
    mockRepo.getPhysicalCoachStats.mockResolvedValue({ assignedPlayerCount: 25 });
    await service.getStats({ id: "00000000-0000-4000-8000-000000000011", role: "COACHING_STAFF", coachingRole: "PHYSICAL_COACH", frontOfficeRole: null });
    expect(mockRepo.getPhysicalCoachStats).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000011");
  });

  test("COACHING_STAFF + MEDICAL → getMedicalStats(userId) + getMedicalDashboardStats 병합 반환", async () => {
    mockRepo.getMedicalStats.mockResolvedValue({ myActiveInjuryCaseCount: 3, thisMonthReturnReadyCount: 1 });
    mockRepo.getMedicalDashboardStats.mockResolvedValue(mockMedicalDashboard);
    const result = await service.getStats({ id: "00000000-0000-4000-8000-000000000012", role: "COACHING_STAFF", coachingRole: "MEDICAL", frontOfficeRole: null });
    expect(mockRepo.getMedicalStats).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000012");
    expect(mockRepo.getMedicalDashboardStats).toHaveBeenCalledWith();
    expect(mockRepo.getMedicalDashboardStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ myActiveInjuryCaseCount: 3, thisMonthReturnReadyCount: 1, medicalDashboard: mockMedicalDashboard });
  });

  test("COACHING_STAFF + MEDICAL_DIRECTOR → getMedicalDirectorStats(userId) + getMedicalDashboardStats 병합 반환", async () => {
    mockRepo.getMedicalDirectorStats.mockResolvedValue({ myActiveInjuryCaseCount: 2, thisMonthReturnReadyCount: 0, totalInjuredPlayerCount: 5 });
    mockRepo.getMedicalDashboardStats.mockResolvedValue(mockMedicalDashboard);
    const result = await service.getStats({ id: "00000000-0000-4000-8000-000000000013", role: "COACHING_STAFF", coachingRole: "MEDICAL_DIRECTOR", frontOfficeRole: null });
    expect(mockRepo.getMedicalDirectorStats).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000013");
    expect(mockRepo.getMedicalDashboardStats).toHaveBeenCalledWith();
    expect(mockRepo.getMedicalDashboardStats).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ myActiveInjuryCaseCount: 2, thisMonthReturnReadyCount: 0, totalInjuredPlayerCount: 5, medicalDashboard: mockMedicalDashboard });
  });

  test("PLAYER → getPlayerStats(userId) 호출", async () => {
    mockRepo.getPlayerStats.mockResolvedValue({ thisSeasonMatchCount: 10 });
    await service.getStats({ id: "00000000-0000-4000-8000-000000000014", role: "PLAYER", coachingRole: null, frontOfficeRole: null });
    expect(mockRepo.getPlayerStats).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000014");
  });

  test("AGENT → getAgentStats(userId) 호출", async () => {
    mockRepo.getAgentStats.mockResolvedValue({ managedPlayerCount: 3 });
    await service.getStats({ id: "00000000-0000-4000-8000-000000000015", role: "AGENT", coachingRole: null, frontOfficeRole: null });
    expect(mockRepo.getAgentStats).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000015");
  });
});

describe("DashboardService — HEAD_COACH trainingEvalEntryRate", () => {
  test("HEAD_COACH stats include trainingEvalEntryRate from repo", async () => {
    mockRepo.getHeadCoachStats.mockResolvedValue({
      injuredPlayerCount: 2,
      thisMonthSessionCount: 5,
      attendanceWarningPlayerCount: 1,
      trainingEvalEntryRate: 72,
    });
    mockRepo.getMedicalDashboardStats.mockResolvedValue(mockMedicalDashboard);

    const result = await service.getStats({
      id: 10,
      role: "COACHING_STAFF",
      coachingRole: "HEAD_COACH",
      frontOfficeRole: null,
    }) as any;

    expect(result.trainingEvalEntryRate).toBe(72);
  });
});
