import { TrainingLoadService } from "../../src/training-load/training-load.service";
import type { TrainingLoadRepository } from "../../src/training-load/training-load.repo";

const makeRepo = (overrides: Partial<TrainingLoadRepository> = {}): TrainingLoadRepository =>
  ({
    getLoadsBetween: jest.fn().mockResolvedValue([]),
    findAll: jest.fn(),
    upsert: jest.fn(),
    getWeeklyLoadTotal: jest.fn().mockResolvedValue(0),
    getPlayerName: jest.fn().mockResolvedValue(null),
    getInjuryLoadCorrelation: jest.fn().mockResolvedValue([]),
    getPlayerGrowthTrajectory: jest.fn().mockResolvedValue({ playerId: "", trajectory: [], dataPoints: 0 }),
    getAllWithSession: jest.fn().mockResolvedValue([]),
    findActiveInjury: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as TrainingLoadRepository);

const makeSvc = (overrides: Partial<TrainingLoadRepository> = {}) =>
  new TrainingLoadService(makeRepo(overrides), {} as any);

// KST 기준 월요일 두 개 (서로 다른 ISO 주)
const week1Mon = new Date("2026-08-03T00:00:00Z");
const week2Mon = new Date("2026-08-10T00:00:00Z");

describe("TrainingLoadService.getAcuteChronicRatio", () => {
  it("2주 데이터 → chronicWeeklyAvg = total / 2 (not /4)", async () => {
    const svc = makeSvc({
      getLoadsBetween: jest.fn()
        .mockResolvedValueOnce([]) // acute
        .mockResolvedValueOnce([
          { load: 400, rpe: 7, session: { date: week1Mon } },
          { load: 400, rpe: 7, session: { date: week2Mon } },
        ]),
    });
    const result = await svc.getAcuteChronicRatio("player-1");
    expect(result.chronicWeeklyAvg).toBe(400); // 800 / 2
  });

  it("같은 주에 여러 건 → distinct weeks = 1로 취급", async () => {
    const wednesday = new Date("2026-08-05T00:00:00Z"); // week1Mon과 같은 주
    const svc = makeSvc({
      getLoadsBetween: jest.fn()
        .mockResolvedValueOnce([]) // acute
        .mockResolvedValueOnce([
          { load: 300, rpe: 6, session: { date: week1Mon } },
          { load: 200, rpe: 6, session: { date: wednesday } },
        ]),
    });
    const result = await svc.getAcuteChronicRatio("player-1");
    expect(result.chronicWeeklyAvg).toBe(500); // 500 / 1
  });

  it("28일 데이터 없음 → ratio null, riskLevel UNKNOWN", async () => {
    const svc = makeSvc({
      getLoadsBetween: jest.fn().mockResolvedValue([]),
    });
    const result = await svc.getAcuteChronicRatio("player-1");
    expect(result.acuteChronicRatio).toBeNull();
    expect(result.riskLevel).toBe("UNKNOWN");
  });

  it("ratio < 0 → AppError 500 ACWR_CALC_ERROR", async () => {
    const svc = makeSvc({
      getLoadsBetween: jest.fn()
        .mockResolvedValueOnce([{ load: -100, rpe: 5, session: { date: week2Mon } }]) // acute 음수
        .mockResolvedValueOnce([{ load: 400, rpe: 7, session: { date: week1Mon } }]),
    });
    await expect(svc.getAcuteChronicRatio("player-1")).rejects.toMatchObject({
      statusCode: 500,
      message: "ACWR_CALC_ERROR",
    });
  });

  it("ratio = 0 → UNDERTRAINED (에러 아님)", async () => {
    const svc = makeSvc({
      getLoadsBetween: jest.fn()
        .mockResolvedValueOnce([]) // acute: 0
        .mockResolvedValueOnce([{ load: 400, rpe: 7, session: { date: week1Mon } }]),
    });
    const result = await svc.getAcuteChronicRatio("player-1");
    expect(result.acuteChronicRatio).toBe(0);
    expect(result.riskLevel).toBe("UNDERTRAINED");
  });

  it("ratio 1.08 → OPTIMAL (coupled 모델 확인)", async () => {
    // 커플드: chronic 창이 acute 주를 포함
    const svc = makeSvc({
      getLoadsBetween: jest.fn()
        .mockResolvedValueOnce([{ load: 850, rpe: 7, session: { date: week2Mon } }]) // acute
        .mockResolvedValueOnce([
          { load: 720, rpe: 7, session: { date: week1Mon } },
          { load: 850, rpe: 7, session: { date: week2Mon } }, // acute 주 포함 (coupled)
        ]),
    });
    const result = await svc.getAcuteChronicRatio("player-1");
    // chronicTotal=1570, actualWeeks=2, avg=785, ratio=850/785≈1.08
    expect(result.riskLevel).toBe("OPTIMAL");
    expect(result.acuteChronicRatio).toBe(1.08);
  });

  it("ratio > 1.3 → HIGH_RISK", async () => {
    const svc = makeSvc({
      getLoadsBetween: jest.fn()
        .mockResolvedValueOnce([{ load: 1200, rpe: 9, session: { date: week2Mon } }]) // acute
        .mockResolvedValueOnce([
          { load: 600, rpe: 6, session: { date: week1Mon } },
          { load: 1200, rpe: 9, session: { date: week2Mon } },
        ]),
    });
    const result = await svc.getAcuteChronicRatio("player-1");
    // avg=900, ratio=1200/900≈1.33 → HIGH_RISK
    expect(result.riskLevel).toBe("HIGH_RISK");
  });
});
