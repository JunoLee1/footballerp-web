import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TrainingService } from "../../src/training/training.service";

const mockRepo = {
  findById: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1, teamId: 1 }),
  upsertResult: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  countUnexcusedAttendance: jest.fn<() => Promise<any>>().mockResolvedValue({ absences: 0, lateCount: 0 }),
  findPlayerNameById: jest.fn<() => Promise<any>>().mockResolvedValue({ playerName: "김선수" }),
  findPlayerUserId: jest.fn<() => Promise<any>>().mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000055" }),
} as any;

const mockNotifRepo = {
  createForUser: jest.fn<() => Promise<any>>().mockResolvedValue({}),
  createForHeadCoach: jest.fn<() => Promise<any>>().mockResolvedValue({}),
} as any;

jest.mock("../../src/lib/io", () => ({
  getIO: () => ({ to: () => ({ emit: jest.fn() }) }),
}));
jest.mock("../../src/notification/notification.service", () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    notifyAttendancePenalty: jest.fn().mockResolvedValue(undefined),
    notifyAttendanceUnauthorized: jest.fn().mockResolvedValue(undefined),
    notifyAttendancePenaltyPlayer: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe("TrainingService - upsertResult 출결 알림", () => {
  beforeEach(() => jest.clearAllMocks());

  test("LATE_UNAUTHORIZED 시 선수에게 알림 발송", async () => {
    mockRepo.countUnexcusedAttendance.mockResolvedValue({ absences: 0, lateCount: 1 });

    const service = new TrainingService(mockRepo, mockNotifRepo);
    await service.upsertResult(1, { playerId: "p1", attendance: "LATE_UNAUTHORIZED" } as any);

    expect(mockRepo.findPlayerUserId).toHaveBeenCalledWith("p1");
  });

  test("ABSENT_UNAUTHORIZED 시 선수에게 알림 발송", async () => {
    mockRepo.countUnexcusedAttendance.mockResolvedValue({ absences: 1, lateCount: 0 });

    const service = new TrainingService(mockRepo, mockNotifRepo);
    await service.upsertResult(1, { playerId: "p1", attendance: "ABSENT_UNAUTHORIZED" } as any);

    expect(mockRepo.findPlayerUserId).toHaveBeenCalledWith("p1");
  });

  test("PRESENT는 알림 없음", async () => {
    const service = new TrainingService(mockRepo, mockNotifRepo);
    await service.upsertResult(1, { playerId: "p1", attendance: "PRESENT" } as any);

    expect(mockRepo.findPlayerUserId).not.toHaveBeenCalled();
  });
});
