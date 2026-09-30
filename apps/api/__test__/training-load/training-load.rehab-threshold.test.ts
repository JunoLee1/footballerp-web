import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TrainingLoadService, getLoadThreshold, getEffectiveThreshold } from "../../src/training-load/training-load.service";

// getEffectiveThreshold 함수 테스트
describe("getEffectiveThreshold", () => {
  test("rehabLoadPercentage 없으면 기본 임계치 반환", () => {
    expect(getEffectiveThreshold("CB", null)).toBe(500);
  });

  test("rehabLoadPercentage 60이면 임계치 × 0.6", () => {
    expect(getEffectiveThreshold("CB", 60)).toBe(300);
  });

  test("rehabLoadPercentage 100이면 임계치 그대로", () => {
    expect(getEffectiveThreshold("GK", 100)).toBe(400);
  });

  test("rehabLoadPercentage 0이면 임계치 0 반환", () => {
    expect(getEffectiveThreshold("CB", 0)).toBe(0);
  });
});

// upsert 응답에 allowedActivities 포함 테스트
describe("TrainingLoadService — allowedActivities in response", () => {
  const mockRepo = {
    upsert: jest.fn(),
    getWeeklyLoadTotal: jest.fn().mockResolvedValue(0),
    getPlayerName: jest.fn().mockResolvedValue({ playerName: "테스트", position: "CB" }),
    findActiveInjuryWithReport: jest.fn(),
  } as any;
  const mockNotifRepo = { createForPhysicalCoach: jest.fn(), createForHeadCoach: jest.fn(), createForMedicalDirector: jest.fn() } as any;

  let service: TrainingLoadService;
  beforeEach(() => {
    jest.clearAllMocks();
    service = new TrainingLoadService(mockRepo, mockNotifRepo);
    mockRepo.upsert.mockResolvedValue({ id: 1, playerId: "p1", load: 300 });
  });

  test("활성 부상 + allowedActivities 있으면 응답에 포함", async () => {
    mockRepo.findActiveInjuryWithReport.mockResolvedValue({
      status: "REHABILITATING",
      injuryReport: { rehabLoadPercentage: 60, allowedActivities: "상체 훈련만 허용" },
    });
    const result = await service.upsert(
      { playerId: "p1", sessionId: 1, load: 300 },
      "p1", "COACHING_STAFF", "PHYSICAL_COACH"
    );
    expect((result as any).allowedActivities).toBe("상체 훈련만 허용");
  });

  test("부상 없으면 allowedActivities 없음", async () => {
    mockRepo.findActiveInjuryWithReport.mockResolvedValue(null);
    const result = await service.upsert(
      { playerId: "p1", sessionId: 1, load: 200 },
      "p1", "COACHING_STAFF", "PHYSICAL_COACH"
    );
    expect((result as any).allowedActivities).toBeUndefined();
  });

  test("rehabLoadPercentage 0이면 과부하 알림 없음 (threshold=0 guard)", async () => {
    mockRepo.findActiveInjuryWithReport.mockResolvedValue({
      status: "REHABILITATING",
      injuryReport: { rehabLoadPercentage: 0, allowedActivities: null },
    });
    mockRepo.getWeeklyLoadTotal.mockResolvedValue(100);
    await service.upsert(
      { playerId: "p1", sessionId: 1, load: 100 },
      "p1", "COACHING_STAFF", "PHYSICAL_COACH"
    );
    expect(mockNotifRepo.createForPhysicalCoach).not.toHaveBeenCalled();
  });

  test("rehabLoadPercentage 60 → 임계치 300으로 낮아져 500 부하 시 overload 알림", async () => {
    mockRepo.findActiveInjuryWithReport.mockResolvedValue({
      status: "REHABILITATING",
      injuryReport: { rehabLoadPercentage: 60, allowedActivities: null },
    });
    mockRepo.getWeeklyLoadTotal.mockResolvedValue(350);
    await service.upsert(
      { playerId: "p1", sessionId: 1, load: 350 },
      "p1", "COACHING_STAFF", "PHYSICAL_COACH"
    );
    expect(mockNotifRepo.createForPhysicalCoach).toHaveBeenCalledWith(
      "TRAINING_LOAD_ALERT",
      expect.any(Function),
      undefined
    );
  });
});
