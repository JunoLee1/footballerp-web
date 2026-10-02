import { OpsReportService } from "../../src/ops-report/ops-report.service";
import type { OpsReportRepository } from "../../src/ops-report/ops-report.repo";
import type { PrismaClient } from "../../src/generated/client";

const makeRepo = (): OpsReportRepository => ({} as unknown as OpsReportRepository);

const makeMockPrisma = () => ({
  trainingSession: {
    findMany: jest.fn(),
  },
  trainingResult: {
    findMany: jest.fn(),
  },
});

type MockPrisma = ReturnType<typeof makeMockPrisma>;

describe("getPenaltyStatus", () => {
  let mockPrisma: MockPrisma;
  let service: OpsReportService;

  const mockSessions = [{ id: 1 }, { id: 2 }];
  const mockResults = [
    // Player A: 3 ABSENT_UNAUTHORIZED → effectiveAbsences=3 → TRIGGERED
    { playerId: "p1", attendance: "ABSENT_UNAUTHORIZED", player: { playerName: "김민준", team: { id: 10 } } },
    { playerId: "p1", attendance: "ABSENT_UNAUTHORIZED", player: { playerName: "김민준", team: { id: 10 } } },
    { playerId: "p1", attendance: "ABSENT_UNAUTHORIZED", player: { playerName: "김민준", team: { id: 10 } } },
    // Player B: 2 ABSENT_UNAUTHORIZED → effectiveAbsences=2 → WARNING
    { playerId: "p2", attendance: "ABSENT_UNAUTHORIZED", player: { playerName: "이성민", team: { id: 10 } } },
    { playerId: "p2", attendance: "ABSENT_UNAUTHORIZED", player: { playerName: "이성민", team: { id: 10 } } },
    // Player C: 3 LATE_UNAUTHORIZED → effectiveAbsences=1 → NORMAL
    { playerId: "p3", attendance: "LATE_UNAUTHORIZED", player: { playerName: "박지성", team: { id: 10 } } },
    { playerId: "p3", attendance: "LATE_UNAUTHORIZED", player: { playerName: "박지성", team: { id: 10 } } },
    { playerId: "p3", attendance: "LATE_UNAUTHORIZED", player: { playerName: "박지성", team: { id: 10 } } },
    // Player D: PRESENT only → effectiveAbsences=0 → excluded
    { playerId: "p4", attendance: "PRESENT", player: { playerName: "손흥민", team: { id: 10 } } },
    // Player E: different team → excluded
    { playerId: "p5", attendance: "ABSENT_UNAUTHORIZED", player: { playerName: "Other", team: { id: 99 } } },
  ];

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new OpsReportService(makeRepo(), mockPrisma as unknown as PrismaClient);
    mockPrisma.trainingSession.findMany.mockResolvedValue(mockSessions);
    mockPrisma.trainingResult.findMany.mockResolvedValue(mockResults);
  });

  it("returns players sorted by effectiveAbsences descending", async () => {
    const result = await service.getPenaltyStatus(10);
    expect(result[0]!.playerId).toBe("p1");
    expect(result[1]!.playerId).toBe("p2");
    expect(result[2]!.playerId).toBe("p3");
  });

  it("classifies TRIGGERED / WARNING / NORMAL correctly", async () => {
    const result = await service.getPenaltyStatus(10);
    const map = Object.fromEntries(result.map((r) => [r.playerId, r.status]));
    expect(map["p1"]).toBe("TRIGGERED");
    expect(map["p2"]).toBe("WARNING");
    expect(map["p3"]).toBe("NORMAL");
  });

  it("excludes players with effectiveAbsences === 0", async () => {
    const result = await service.getPenaltyStatus(10);
    expect(result.find((r) => r.playerId === "p4")).toBeUndefined();
  });

  it("excludes players from other teams", async () => {
    const result = await service.getPenaltyStatus(10);
    expect(result.find((r) => r.playerId === "p5")).toBeUndefined();
  });

  it("returns empty array when no sessions", async () => {
    mockPrisma.trainingSession.findMany.mockResolvedValue([]);
    const result = await service.getPenaltyStatus(10);
    expect(result).toEqual([]);
  });
});
