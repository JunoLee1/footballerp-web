import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TrainingService } from "../../src/training/training.service";

const mockRepo = {
  findByIdWithTeam: jest.fn(),
  updateSession: jest.fn(),
  cancelSession: jest.fn(),
  findGuardiansByTeam: jest.fn<() => Promise<string[]>>().mockResolvedValue(["00000000-0000-4000-8000-000000000100", "00000000-0000-4000-8000-000000000101"]),
  findById: jest.fn(),
  addAllActivePlayers: jest.fn().mockResolvedValue(undefined),
} as any;

const mockNotifRepo = {
  createForGuardian: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  createForHeadCoach: jest.fn().mockResolvedValue({ id: 2 }),
} as any;

const service = new TrainingService(mockRepo, mockNotifRepo);

describe("TrainingService - YOUTH 세션 변경 시 GUARDIAN 알림", () => {
  beforeEach(() => jest.clearAllMocks());

  test("YOUTH 팀 세션 변경 시 GUARDIAN에게 알림", async () => {
    mockRepo.findByIdWithTeam.mockResolvedValue({
      id: 1, teamId: 2, team: { type: "YOUTH", name: "U15" },
      date: new Date("2026-07-21T09:00:00.000Z"),
    });
    mockRepo.updateSession.mockResolvedValue({ id: 1 });

    await service.updateSession(1, { date: "2026-07-22T09:00:00.000Z" }, "00000000-0000-4000-8000-000000000001");

    expect(mockRepo.findGuardiansByTeam).toHaveBeenCalledWith(2);
    expect(mockNotifRepo.createForGuardian).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000100", "YOUTH_SESSION_CHANGED", expect.any(Function), 1,
    );
  });

  test("FIRST_TEAM 세션 변경 시 GUARDIAN 알림 없음", async () => {
    mockRepo.findByIdWithTeam.mockResolvedValue({
      id: 2, teamId: 3, team: { type: "FIRST_TEAM", name: "1군" },
      date: new Date(),
    });
    mockRepo.updateSession.mockResolvedValue({ id: 2 });

    await service.updateSession(2, { date: "2026-07-22T10:00:00.000Z" }, "00000000-0000-4000-8000-000000000001");

    expect(mockRepo.findGuardiansByTeam).not.toHaveBeenCalled();
    expect(mockNotifRepo.createForGuardian).not.toHaveBeenCalled();
  });
});
