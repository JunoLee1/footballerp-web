import { TrainingService } from "./training.service";
import { TrainingRepository } from "./training.repo";
import { AppError } from "../lib/appError";

// training.service.ts가 모듈 최상위에서 getPrisma()를 호출하므로 mock 처리
jest.mock("../lib/prisma", () => ({
  getPrisma: () => ({}),
}));

jest.mock("../lib/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../notification/notification.service", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    notifyAttendanceUnauthorized: jest.fn().mockResolvedValue(undefined),
    notifyAttendancePenaltyPlayer: jest.fn().mockResolvedValue(undefined),
    notifyAttendancePenalty: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("../notification/notification.repo", () => ({
  NotificationRepository: jest.fn().mockImplementation(() => ({
    createForHeadCoach: jest.fn().mockResolvedValue(undefined),
    createForUser: jest.fn().mockResolvedValue(undefined),
    createForGuardian: jest.fn().mockResolvedValue(undefined),
  })),
}));

const USER_10 = "11111111-1111-1111-1111-11111111a010";
const SESSION_FIXTURE = {
  id: 1,
  date: new Date("2026-01-01"),
  goal: "기술 훈련",
  sessionType: "TECHNICAL",
  isApproved: false,
  seasonId: 1,
  createdById: USER_10,
  approvedById: null,
  contents: [],
  participants: [],
  results: [],
};

function mockRepo(): jest.Mocked<TrainingRepository> {
  return {
    findAll: jest.fn(),
    findById: jest.fn(),
    findByIdWithTeam: jest.fn(),
    create: jest.fn(),
    approve: jest.fn(),
    addContent: jest.fn(),
    addParticipants: jest.fn(),
    addAllActivePlayers: jest.fn().mockResolvedValue(undefined),
    upsertResult: jest.fn(),
    countUnexcusedAttendance: jest.fn().mockResolvedValue({ absences: 0, lateCount: 0 }),
    findPlayerUserId: jest.fn().mockResolvedValue(null),
    findPlayerNameById: jest.fn().mockResolvedValue(null),
    findResults: jest.fn(),
    findResultById: jest.fn(),
    updateAttendance: jest.fn(),
    findGuardiansByTeam: jest.fn().mockResolvedValue([]),
    updateSession: jest.fn(),
    cancelSession: jest.fn(),
  } as unknown as jest.Mocked<TrainingRepository>;
}

describe("TrainingService — clubId 스코핑", () => {
  let repo: jest.Mocked<TrainingRepository>;
  let service: TrainingService;

  beforeEach(() => {
    repo = mockRepo();
    service = new TrainingService(repo as any);
  });

  describe("getSessions", () => {
    it("actorClubId를 repo.findAll에 전달한다", async () => {
      repo.findAll.mockResolvedValue([]);
      await service.getSessions({ seasonId: 1 }, "cmxtestclub00000000000002");
      expect(repo.findAll).toHaveBeenCalledWith({ seasonId: 1 }, "cmxtestclub00000000000002");
    });

    it("actorClubId = null → null 전달 (SUPER_ADMIN bypass)", async () => {
      repo.findAll.mockResolvedValue([]);
      await service.getSessions({ seasonId: 1 }, null);
      expect(repo.findAll).toHaveBeenCalledWith({ seasonId: 1 }, null);
    });
  });

  describe("getSessionById", () => {
    it("일치하는 clubId → 세션 반환", async () => {
      repo.findById.mockResolvedValue(SESSION_FIXTURE as any);
      const result = await service.getSessionById(1, "cmxtestclub00000000000005");
      expect(repo.findById).toHaveBeenCalledWith(1, "cmxtestclub00000000000005");
      expect(result.id).toBe(1);
    });

    it("다른 clubId → repo null → 404 SESSION_NOT_FOUND", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getSessionById(1, "cmxtestclub0000000000099")).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    });

    it("actorClubId = null (SUPER_ADMIN) → 정상 반환", async () => {
      repo.findById.mockResolvedValue(SESSION_FIXTURE as any);
      const result = await service.getSessionById(1, null);
      expect(repo.findById).toHaveBeenCalledWith(1, null);
      expect(result.id).toBe(1);
    });
  });

  describe("createSession", () => {
    it("actorClubId를 repo.create에 전달한다", async () => {
      repo.create.mockResolvedValue({ id: 1, teamId: null } as any);
      const dto = {
        date: "2026-01-01",
        goal: "훈련",
        sessionType: "TECHNICAL" as any,
        seasonId: 1,
      };
      await service.createSession(dto, USER_10, "cmxtestclub00000000000005");
      expect(repo.create).toHaveBeenCalledWith(dto, USER_10, "cmxtestclub00000000000005");
    });
  });

  describe("approveSession", () => {
    it("다른 clubId → 404 SESSION_NOT_FOUND", async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.approveSession(1, USER_10, "cmxtestclub0000000000099")).rejects.toMatchObject({ code: "SESSION_NOT_FOUND" });
    });

    it("일치하는 clubId + 미승인 세션 → 승인 처리", async () => {
      repo.findById.mockResolvedValue(SESSION_FIXTURE as any);
      repo.approve.mockResolvedValue({ id: 1, isApproved: true, approvedById: USER_10 } as any);
      const result = await service.approveSession(1, USER_10, "cmxtestclub00000000000005");
      expect(repo.findById).toHaveBeenCalledWith(1, "cmxtestclub00000000000005");
      expect(repo.approve).toHaveBeenCalledWith(1, USER_10);
    });
  });
});
