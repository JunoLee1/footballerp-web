import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { TrainingService } from "../../src/training/training.service";

const mockRepo = {
  findById: jest.fn(),
  approve: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  addAllActivePlayers: jest.fn(),
  addContent: jest.fn(),
  addParticipants: jest.fn(),
  upsertResult: jest.fn(),
  countUnexcusedAttendance: jest.fn(),
  findPlayerUserId: jest.fn(),
  findPlayerNameById: jest.fn(),
  findByIdWithTeam: jest.fn(),
  findGuardiansByTeam: jest.fn(),
  cancelSession: jest.fn(),
  updateSession: jest.fn(),
  findResultById: jest.fn(),
  updateAttendance: jest.fn(),
  findResults: jest.fn(),
} as any;

let service: TrainingService;

beforeEach(() => {
  jest.clearAllMocks();
  service = new TrainingService(mockRepo);
});

describe("TrainingService.approveSession — eval warning", () => {
  test("returns evalWarning when present players have null performanceScore", async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1, isApproved: false,
      results: [
        { attendance: "PRESENT", performanceScore: 8 },
        { attendance: "PRESENT", performanceScore: null },
        { attendance: "ABSENT_AUTHORIZED",  performanceScore: null },
      ],
    });
    mockRepo.approve.mockResolvedValue({ id: 1, isApproved: true, approvedById: "00000000-0000-4000-8000-000000000099" });

    const result = await service.approveSession(1, "00000000-0000-4000-8000-000000000099") as any;
    expect(result.evalWarning).toEqual({ missing: 1, total: 2 });
  });

  test("returns no evalWarning when all present players have scores", async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1, isApproved: false,
      results: [
        { attendance: "PRESENT", performanceScore: 7 },
        { attendance: "ABSENT_AUTHORIZED",  performanceScore: null },
      ],
    });
    mockRepo.approve.mockResolvedValue({ id: 1, isApproved: true, approvedById: "00000000-0000-4000-8000-000000000099" });

    const result = await service.approveSession(1, "00000000-0000-4000-8000-000000000099") as any;
    expect(result.evalWarning).toBeUndefined();
  });
});
