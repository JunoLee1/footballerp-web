import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { collectWeeklyScheduleByGuardian } from "../../src/jobs/youthWeeklySchedule";

const monday = new Date("2026-07-20T00:00:00.000Z");

const mockPrisma = {
  trainingSession: {
    findMany: jest.fn<() => Promise<any[]>>().mockResolvedValue([
      {
        id: 1, date: new Date("2026-07-21T09:00:00.000Z"), sessionType: "FIELD",
        team: { id: 2, name: "U15" },
      },
    ]),
  },
  match: {
    findMany: jest.fn<() => Promise<any[]>>().mockResolvedValue([
      {
        id: 10, date: new Date("2026-07-23T14:00:00.000Z"),
        homeTeamName: "우리팀 U15", awayTeamName: "상대팀",
        team: { id: 2 },
      },
    ]),
  },
  player: {
    findMany: jest.fn<() => Promise<any[]>>().mockResolvedValue([
      { guardianId: "00000000-0000-4000-8000-000000000100", teamId: 2 },
      { guardianId: "00000000-0000-4000-8000-000000000101", teamId: 2 },
    ]),
  },
} as any;

describe("collectWeeklyScheduleByGuardian", () => {
  beforeEach(() => jest.clearAllMocks());

  test("이번 주 훈련과 경기를 guardianId별로 묶어 반환", async () => {
    const result = await collectWeeklyScheduleByGuardian(mockPrisma, monday);
    expect(result).toHaveLength(2);
    expect(result[0]!.guardianId).toBe("00000000-0000-4000-8000-000000000100");
    expect(result[0]!.sessions).toHaveLength(1);
    expect(result[0]!.matches).toHaveLength(1);
  });

  test("guardianId 없는 선수는 제외", async () => {
    mockPrisma.player.findMany.mockResolvedValueOnce([{ guardianId: null, teamId: 2 }, { guardianId: "00000000-0000-4000-8000-000000000200", teamId: 2 }]);
    const result = await collectWeeklyScheduleByGuardian(mockPrisma, monday);
    expect(result.every(r => r.guardianId !== null)).toBe(true);
  });
});
