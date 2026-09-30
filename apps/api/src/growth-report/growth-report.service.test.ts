import { GrowthReportService } from "./growth-report.service";
import type { GrowthReportRepository } from "./growth-report.repo";
import type { NotificationRepository } from "../notification/notification.repo";
import type { DevelopmentPlanRepository } from "../development-plan/development-plan.repo";

const makeRepo = (overrides: Partial<GrowthReportRepository> = {}): GrowthReportRepository =>
  ({
    findEvaluationsByPlayer: jest.fn().mockResolvedValue([]),
    findPublishedEvaluationsByPlayer: jest.fn().mockResolvedValue([]),
    findEvaluationById: jest.fn().mockResolvedValue(null),
    findEvaluationByPeriod: jest.fn().mockResolvedValue(null),
    createEvaluation: jest.fn(),
    updateEvaluation: jest.fn(),
    publishEvaluation: jest.fn(),
    findBadgesByPlayer: jest.fn().mockResolvedValue([]),
    awardBadge: jest.fn(),
    ...overrides,
  } as unknown as GrowthReportRepository);

const makeNotifRepo = (): NotificationRepository =>
  ({
    createForGuardian: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationRepository);

const makePlanRepo = (activePlanId?: number): DevelopmentPlanRepository =>
  ({
    findActiveByPlayer: jest.fn().mockResolvedValue(activePlanId ? { id: activePlanId } : null),
  } as unknown as DevelopmentPlanRepository);

const fakePlayer = { id: "player-uuid-1", playerName: "김철수", guardianId: "99999999-9999-9999-9999-999999999999" };
const fakeEval = {
  id: 1,
  playerId: "player-uuid-1",
  coachId: "10101010-1010-1010-1010-101010101010",
  year: 2026,
  month: 7,
  isPublished: false,
  publishedAt: null,
  attitudeScore: 8,
  attitudeComment: "성실함",
  fundamentalsScore: 7,
  fundamentalsComment: "기본기 양호",
  spatialScore: 6,
  spatialComment: "공간 인식 보통",
  physicalScore: 9,
  physicalComment: "체력 우수",
  player: fakePlayer,
  coach: { id: "10101010-1010-1010-1010-101010101010", username: "coach1", nickname: "감독" },
};

describe("GrowthReportService", () => {
  describe("createEvaluation", () => {
    it("중복 기간이면 409 에러", async () => {
      const repo = makeRepo({ findEvaluationByPeriod: jest.fn().mockResolvedValue(fakeEval) });
      const svc = new GrowthReportService(repo, makeNotifRepo(), makePlanRepo(), undefined as any);
      await expect(
        svc.createEvaluation(
          {
            playerId: "player-uuid-1",
            year: 2026,
            month: 7,
            attitudeScore: 8,
            attitudeComment: "good",
            fundamentalsScore: 7,
            fundamentalsComment: "ok",
            spatialScore: 6,
            spatialComment: "ok",
            physicalScore: 9,
            physicalComment: "great",
          },
          "10101010-1010-1010-1010-101010101010",
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("신규 평가 생성 성공", async () => {
      const created = { ...fakeEval };
      const repo = makeRepo({
        findEvaluationByPeriod: jest.fn().mockResolvedValue(null),
        createEvaluation: jest.fn().mockResolvedValue(created),
      });
      const svc = new GrowthReportService(repo, makeNotifRepo(), makePlanRepo(), undefined as any);
      const result = await svc.createEvaluation(
        {
          playerId: "player-uuid-1",
          year: 2026,
          month: 7,
          attitudeScore: 8,
          attitudeComment: "good",
          fundamentalsScore: 7,
          fundamentalsComment: "ok",
          spatialScore: 6,
          spatialComment: "ok",
          physicalScore: 9,
          physicalComment: "great",
        },
        "10101010-1010-1010-1010-101010101010",
      );
      expect(result).toBe(created);
    });
  });

  describe("publishEvaluation", () => {
    it("존재하지 않으면 404", async () => {
      const repo = makeRepo({ findEvaluationById: jest.fn().mockResolvedValue(null) });
      const svc = new GrowthReportService(repo, makeNotifRepo(), makePlanRepo(), undefined as any);
      await expect(svc.publishEvaluation(999)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("이미 발행된 경우 409", async () => {
      const repo = makeRepo({
        findEvaluationById: jest.fn().mockResolvedValue({ ...fakeEval, isPublished: true }),
      });
      const svc = new GrowthReportService(repo, makeNotifRepo(), makePlanRepo(), undefined as any);
      await expect(svc.publishEvaluation(1)).rejects.toMatchObject({ statusCode: 409 });
    });

    it("발행 성공 시 guardianId 있으면 알림 전송", async () => {
      const published = { ...fakeEval, isPublished: true, publishedAt: new Date() };
      const repo = makeRepo({
        findEvaluationById: jest.fn().mockResolvedValue(fakeEval),
        publishEvaluation: jest.fn().mockResolvedValue(published),
      });
      const notifRepo = makeNotifRepo();
      const svc = new GrowthReportService(repo, notifRepo, makePlanRepo(), undefined as any);
      await svc.publishEvaluation(1);
      expect(notifRepo.createForGuardian).toHaveBeenCalledWith(
        fakePlayer.guardianId,
        "GROWTH_REPORT_PUBLISHED",
        expect.any(Function),
        1,
      );
    });

    it("guardianId 없으면 알림 미전송", async () => {
      const evalNoGuardian = { ...fakeEval, player: { ...fakePlayer, guardianId: null } };
      const repo = makeRepo({
        findEvaluationById: jest.fn().mockResolvedValue(evalNoGuardian),
        publishEvaluation: jest.fn().mockResolvedValue({ ...evalNoGuardian, isPublished: true }),
      });
      const notifRepo = makeNotifRepo();
      const svc = new GrowthReportService(repo, notifRepo, makePlanRepo(), undefined as any);
      await svc.publishEvaluation(1);
      expect(notifRepo.createForGuardian).not.toHaveBeenCalled();
    });
  });

  describe("awardBadge", () => {
    it("배지 수여 성공", async () => {
      const badge = {
        id: 1,
        playerId: "player-uuid-1",
        coachId: "10101010-1010-1010-1010-101010101010",
        badgeType: "PASSION_KING",
        awardedAt: new Date(),
        note: null,
        sessionId: null,
        player: fakePlayer,
        coach: { id: "10101010-1010-1010-1010-101010101010", username: "coach1", nickname: "감독" },
        session: null,
      };
      const repo = makeRepo({ awardBadge: jest.fn().mockResolvedValue(badge) });
      const svc = new GrowthReportService(repo, makeNotifRepo(), makePlanRepo(), undefined as any);
      const result = await svc.awardBadge(
        { playerId: "player-uuid-1", badgeType: "PASSION_KING" as const },
        "10101010-1010-1010-1010-101010101010",
      );
      expect(result).toBe(badge);
    });
  });
});

describe("GrowthReportService.getEvaluationsByPlayerForGuardian — IDOR 방지", () => {
  const makeGuardianRepo = (child: { id: string } | null) => ({
    findChildByIdAndGuardian: jest.fn().mockResolvedValue(child),
  });

  it("자녀가 아니면 403", async () => {
    const guardianRepo = makeGuardianRepo(null);
    const service = new GrowthReportService(
      makeRepo(),
      makeNotifRepo(),
      makePlanRepo(),
      guardianRepo as any,
    );
    await expect(service.getEvaluationsByPlayerForGuardian("player-uuid-1", "99999999-9999-9999-9999-999999999999"))
      .rejects.toMatchObject({ statusCode: 403, message: "FORBIDDEN" });
  });

  it("자녀이면 published evaluations 반환", async () => {
    const guardianRepo = makeGuardianRepo({ id: "player-uuid-1" });
    const evals = [{ id: 1, playerId: "player-uuid-1", isPublished: true }];
    const repo = makeRepo({ findPublishedEvaluationsByPlayer: jest.fn().mockResolvedValue(evals) });
    const service = new GrowthReportService(repo, makeNotifRepo(), makePlanRepo(), guardianRepo as any);
    const result = await service.getEvaluationsByPlayerForGuardian("player-uuid-1", "99999999-9999-9999-9999-999999999999");
    expect(result).toBe(evals);
  });
});
