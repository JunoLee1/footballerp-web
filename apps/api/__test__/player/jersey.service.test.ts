import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { JerseyService } from "../../src/player/jersey.service";
import { AppError } from "../../src/lib/appError";

const mockRepo = {
  findByNumberAndTeam: jest.fn<() => Promise<any>>(),
  findByPlayer: jest.fn<() => Promise<any[]>>(),
  create: jest.fn<() => Promise<any>>(),
  updateStatus: jest.fn<() => Promise<any>>(),
  findByTeam: jest.fn<() => Promise<any[]>>(),
} as any;

const service = new JerseyService(mockRepo);

describe("JerseyService - assignToPlayer", () => {
  beforeEach(() => jest.clearAllMocks());

  test("빈 번호 배정 성공", async () => {
    mockRepo.findByNumberAndTeam.mockResolvedValue(null);
    mockRepo.create.mockResolvedValue({ id: 1, number: 7, status: "OCCUPIED", playerId: "p1" });

    const result = await service.assignToPlayer(1, { number: 7, playerId: "p1" });
    expect(result.status).toBe("OCCUPIED");
  });

  test("OCCUPIED 번호 배정 시도 → 409", async () => {
    mockRepo.findByNumberAndTeam.mockResolvedValue({ id: 1, number: 7, status: "OCCUPIED", player: { playerName: "Kim" } });

    await expect(service.assignToPlayer(1, { number: 7, playerId: "p2" }))
      .rejects.toMatchObject({ statusCode: 409, code: "JERSEY_NUMBER_OCCUPIED" });
  });

  test("RETIRED 번호 배정 시도 → 403", async () => {
    mockRepo.findByNumberAndTeam.mockResolvedValue({ id: 1, number: 10, status: "RETIRED", player: null });

    await expect(service.assignToPlayer(1, { number: 10, playerId: "p1" }))
      .rejects.toMatchObject({ statusCode: 403, code: "JERSEY_NUMBER_RETIRED" });
  });
});

describe("JerseyService - retire", () => {
  beforeEach(() => jest.clearAllMocks());

  test("AVAILABLE → RETIRED 전환 성공", async () => {
    mockRepo.findByNumberAndTeam.mockResolvedValue({ id: 1, number: 9, status: "AVAILABLE", player: null });
    mockRepo.updateStatus.mockResolvedValue({ id: 1, number: 9, status: "RETIRED" });

    const result = await service.retire(1, 9);
    expect(result.status).toBe("RETIRED");
    expect(mockRepo.updateStatus).toHaveBeenCalledWith(1, { status: "RETIRED", playerId: null });
  });

  test("OCCUPIED 상태는 RETIRED 불가 → 409", async () => {
    mockRepo.findByNumberAndTeam.mockResolvedValue({ id: 1, number: 9, status: "OCCUPIED", player: { playerName: "Park" } });

    await expect(service.retire(1, 9))
      .rejects.toMatchObject({ statusCode: 409, code: "JERSEY_MUST_BE_AVAILABLE_TO_RETIRE" });
  });
});

const mockNotifRepo = {
  createForUser: jest.fn<() => Promise<any>>().mockResolvedValue({}),
} as any;

describe("JerseyService - assignToPlayer with notification", () => {
  beforeEach(() => jest.clearAllMocks());

  test("OCCUPIED 충돌 시 선수에게 알림 발송", async () => {
    mockRepo.findByNumberAndTeam.mockResolvedValue({
      id: 1, number: 7, status: "OCCUPIED", playerId: "existing",
    });
    mockRepo.findPlayerUserId = jest.fn<() => Promise<any>>().mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000099" });

    const serviceWithNotif = new JerseyService(mockRepo, mockNotifRepo);

    await expect(serviceWithNotif.assignToPlayer(1, { number: 7, playerId: "p2" }))
      .rejects.toMatchObject({ code: "JERSEY_NUMBER_OCCUPIED" });

    // fire-and-forget — wait a tick
    await new Promise((r) => setTimeout(r, 10));
    expect(mockNotifRepo.createForUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000099", "JERSEY_NUMBER_CONFLICT",
      expect.any(Function),
    );
  });

  test("userId 없는 선수는 알림 미발송", async () => {
    mockRepo.findByNumberAndTeam.mockResolvedValue({
      id: 1, number: 7, status: "OCCUPIED",
    });
    mockRepo.findPlayerUserId = jest.fn<() => Promise<any>>().mockResolvedValue({ userId: null });

    const serviceWithNotif = new JerseyService(mockRepo, mockNotifRepo);

    await expect(serviceWithNotif.assignToPlayer(1, { number: 7, playerId: "p2" }))
      .rejects.toMatchObject({ code: "JERSEY_NUMBER_OCCUPIED" });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockNotifRepo.createForUser).not.toHaveBeenCalled();
  });
});
