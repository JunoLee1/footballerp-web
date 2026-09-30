import { describe, it, jest, expect, beforeEach } from "@jest/globals";

jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/lib/prisma", () => ({ getPrisma: () => ({}) }));

import { PlayerService } from "../../src/player/player.service";

const mockRepo = {
  findAll: jest.fn<() => Promise<any[]>>(),
  findById: jest.fn<() => Promise<any>>(),
  create: jest.fn<() => Promise<any>>(),
  updateStatus: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  promotePlayer: jest.fn(),
  updateWorkPermit: jest.fn(),
  getMatchStats: jest.fn(),
  getTrainingResults: jest.fn(),
  getPositionDiversity: jest.fn(),
};

const fakePlayer = {
  id: "p1",
  playerName: "홍길동",
  clubId: 1,
  dateOfBirthEncrypted: null,
  dateOfBirthIv: null,
  team: { id: 1, type: "FIRST_TEAM" },
};

const actor = { id: "00000000-0000-4000-8000-000000000010", role: "ADMIN", clubId: 1 } as any;

describe("PlayerService — club scoping", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getPlayerById", () => {
    it("clubId 불일치(null 반환) → PLAYER_NOT_FOUND", async () => {
      mockRepo.findById.mockResolvedValue(null);
      const svc = new PlayerService(mockRepo as any);
      await expect(svc.getPlayerById("p1", 2)).rejects.toMatchObject({
        statusCode: 404, code: "PLAYER_NOT_FOUND",
      });
      expect(mockRepo.findById).toHaveBeenCalledWith("p1", 2, false);
    });

    it("clubId 일치 → 반환", async () => {
      mockRepo.findById.mockResolvedValue(fakePlayer);
      const svc = new PlayerService(mockRepo as any);
      const result = await svc.getPlayerById("p1", 1);
      expect(result).toMatchObject({ id: "p1" });
    });
  });

  describe("createPlayer", () => {
    it("actor.clubId를 repo.create에 전달", async () => {
      mockRepo.create.mockResolvedValue(fakePlayer);
      const svc = new PlayerService(mockRepo as any);
      const dto = { playerName: "홍길동", dateOfBirth: "1990-01-01" } as any;
      await svc.createPlayer(dto, actor);
      expect(mockRepo.create).toHaveBeenCalledWith(dto, 1);
    });

    it("actor.clubId 없으면 null 전달", async () => {
      mockRepo.create.mockResolvedValue(fakePlayer);
      const svc = new PlayerService(mockRepo as any);
      const dto = { playerName: "홍길동", dateOfBirth: "1990-01-01" } as any;
      await svc.createPlayer(dto, { ...actor, clubId: undefined });
      expect(mockRepo.create).toHaveBeenCalledWith(dto, null);
    });
  });

  describe("getPlayers", () => {
    it("clubId를 repo.findAll에 전달", async () => {
      mockRepo.findAll.mockResolvedValue([]);
      const svc = new PlayerService(mockRepo as any);
      await svc.getPlayers({}, 1);
      expect(mockRepo.findAll).toHaveBeenCalledWith({}, 1);
    });
  });
});
