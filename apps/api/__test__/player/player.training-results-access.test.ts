import { describe, it, jest, expect, beforeEach } from "@jest/globals";

jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/lib/prisma", () => ({ getPrisma: () => ({}) }));

import { PlayerService } from "../../src/player/player.service";

const PLAYER_ID = "player-001";
const PLAYER_USER_ID = "00000000-0000-4000-8000-000000000001";
const AGENT_USER_ID = "00000000-0000-4000-8000-000000000002";
const GUARDIAN_USER_ID = "00000000-0000-4000-8000-000000000003";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000099";

const mockRepo = {
  findById: jest.fn<() => Promise<any>>().mockResolvedValue({
    id: PLAYER_ID,
    userId: PLAYER_USER_ID,
    agentId: AGENT_USER_ID,
    guardianId: GUARDIAN_USER_ID,
  }),
  getTrainingResults: jest.fn<() => Promise<any[]>>().mockResolvedValue([{ sessionId: 1, score: 8 }]),
} as any;

const svc = new PlayerService(mockRepo);

describe("PlayerService.getTrainingResults — #590 allow-list guard", () => {
  beforeEach(() => jest.clearAllMocks());
  beforeEach(() => {
    mockRepo.findById.mockResolvedValue({
      id: PLAYER_ID,
      userId: PLAYER_USER_ID,
      agentId: AGENT_USER_ID,
      guardianId: GUARDIAN_USER_ID,
    });
    mockRepo.getTrainingResults.mockResolvedValue([{ sessionId: 1, score: 8 }]);
  });

  describe("허용 (allow-list)", () => {
    it("ADMIN → 200", async () => {
      const r = await svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "ADMIN");
      expect(r).toHaveLength(1);
    });

    it("SUPER_ADMIN → 200", async () => {
      const r = await svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "SUPER_ADMIN");
      expect(r).toHaveLength(1);
    });

    it("GM → 200", async () => {
      const r = await svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "GM");
      expect(r).toHaveLength(1);
    });

    it("COACHING_STAFF → 200", async () => {
      const r = await svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "COACHING_STAFF");
      expect(r).toHaveLength(1);
    });

    it("PLAYER 본인 → 200", async () => {
      const r = await svc.getTrainingResults(PLAYER_ID, PLAYER_USER_ID, "PLAYER");
      expect(r).toHaveLength(1);
    });

    it("GUARDIAN 자녀 담당 → 200", async () => {
      const r = await svc.getTrainingResults(PLAYER_ID, GUARDIAN_USER_ID, "GUARDIAN");
      expect(r).toHaveLength(1);
    });

    it("AGENT 담당 선수 → 200", async () => {
      const r = await svc.getTrainingResults(PLAYER_ID, AGENT_USER_ID, "AGENT");
      expect(r).toHaveLength(1);
    });
  });

  describe("차단 (403)", () => {
    it("PLAYER (본인 아님) → 403", async () => {
      await expect(svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "PLAYER")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("GUARDIAN (본인 자녀 아님) → 403", async () => {
      await expect(svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "GUARDIAN")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("AGENT (담당 선수 아님) → 403", async () => {
      await expect(svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "AGENT")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("HR_MANAGER (FRONT_OFFICE) → 403", async () => {
      await expect(svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "FRONT_OFFICE")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("ASSET_MANAGER (FRONT_OFFICE) → 403", async () => {
      // FRONT_OFFICE role 자체가 차단 대상 (frontOfficeRole 무관하게 role 기준으로 판정)
      await expect(svc.getTrainingResults(PLAYER_ID, OTHER_USER_ID, "FRONT_OFFICE")).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  it("존재하지 않는 선수 → 404", async () => {
    mockRepo.findById.mockResolvedValueOnce(null);
    await expect(svc.getTrainingResults("nope", OTHER_USER_ID, "ADMIN")).rejects.toMatchObject({ statusCode: 404 });
  });
});
