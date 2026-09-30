import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { AcquisitionSurveyService } from "../../src/acquisition-survey/acquisition-survey.service";

const openSurvey = {
  id: 1,
  title: "2025 시즌 영입 수요조사",
  status: "OPEN" as const,
  dueDate: new Date("2025-12-31"),
  notes: null,
  createdById: "00000000-0000-4000-8000-000000000010",
  createdAt: new Date(),
  closedAt: null,
};

const closedSurvey = { ...openSurvey, status: "CLOSED" as const, closedAt: new Date() };

const mockRepo = {
  findAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([openSurvey]),
  findById: jest.fn<() => Promise<any>>().mockResolvedValue(openSurvey),
  create: jest.fn<() => Promise<any>>().mockResolvedValue(openSurvey),
  close: jest.fn<() => Promise<any>>().mockResolvedValue(closedSurvey),
  findResponse: jest.fn<() => Promise<any>>().mockResolvedValue(null),
  submitResponse: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  getResponses: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
} as any;

const mockNotify = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockNotifyClosed = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const service = new AcquisitionSurveyService(mockRepo, {
  notifyAcquisitionSurveyPublished: mockNotify,
  notifyAcquisitionSurveyClosed: mockNotifyClosed,
} as any);

describe("AcquisitionSurveyService.create", () => {
  beforeEach(() => jest.clearAllMocks());

  test("생성 후 알림 발송", async () => {
    mockRepo.create.mockResolvedValue(openSurvey);

    const result = await service.create(
      { title: "2025 시즌 영입 수요조사", dueDate: "2025-12-31" },
      "00000000-0000-4000-8000-000000000010",
    );

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: "2025 시즌 영입 수요조사", createdById: "00000000-0000-4000-8000-000000000010" }),
    );
    expect(mockNotify).toHaveBeenCalledWith(openSurvey.id, openSurvey.title);
    expect(result.status).toBe("OPEN");
  });
});

describe("AcquisitionSurveyService.getById", () => {
  beforeEach(() => jest.clearAllMocks());

  test("존재하면 반환", async () => {
    mockRepo.findById.mockResolvedValue(openSurvey);
    const result = await service.getById(1);
    expect(result.id).toBe(1);
  });

  test("없으면 404", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.getById(99)).rejects.toMatchObject({
      statusCode: 404,
      code: "SURVEY_NOT_FOUND",
    });
  });
});

describe("AcquisitionSurveyService.close", () => {
  beforeEach(() => jest.clearAllMocks());

  test("OPEN → CLOSED 성공", async () => {
    mockRepo.findById.mockResolvedValue(openSurvey);
    mockRepo.close.mockResolvedValue(closedSurvey);

    const result = await service.close(1);
    expect(result.status).toBe("CLOSED");
    expect(mockRepo.close).toHaveBeenCalledWith(1);
  });

  test("이미 CLOSED이면 409", async () => {
    mockRepo.findById.mockResolvedValue(closedSurvey);

    await expect(service.close(1)).rejects.toMatchObject({
      statusCode: 409,
      code: "SURVEY_ALREADY_CLOSED",
    });
    expect(mockRepo.close).not.toHaveBeenCalled();
  });
});

describe("AcquisitionSurveyService.submitResponse", () => {
  beforeEach(() => jest.clearAllMocks());

  const items = [
    { position: "STRIKER", priority: "HIGH" as const, budgetMin: 100_000_000, budgetMax: 200_000_000 },
  ];

  const RESPONDENT_UUID = "00000000-0000-4000-8000-000000000020";

  test("CLOSED 수요조사에 응답 → 409", async () => {
    mockRepo.findById.mockResolvedValue(closedSurvey);

    await expect(service.submitResponse(1, RESPONDENT_UUID, items)).rejects.toMatchObject({
      statusCode: 409,
      code: "SURVEY_CLOSED",
    });
  });

  test("이미 응답 제출한 경우 → 409", async () => {
    mockRepo.findById.mockResolvedValue(openSurvey);
    mockRepo.findResponse.mockResolvedValue({ id: 5, submittedAt: new Date() });

    await expect(service.submitResponse(1, RESPONDENT_UUID, items)).rejects.toMatchObject({
      statusCode: 409,
      code: "ALREADY_SUBMITTED",
    });
  });

  test("응답 제출 성공", async () => {
    mockRepo.findById.mockResolvedValue(openSurvey);
    mockRepo.findResponse.mockResolvedValue(null);
    mockRepo.submitResponse.mockResolvedValue({ id: 1 });

    const result = await service.submitResponse(1, RESPONDENT_UUID, items);
    expect(mockRepo.submitResponse).toHaveBeenCalledWith(1, RESPONDENT_UUID, items);
    expect(result.id).toBe(1);
  });

  test("존재하지 않는 수요조사 → 404", async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(service.submitResponse(99, RESPONDENT_UUID, items)).rejects.toMatchObject({
      statusCode: 404,
      code: "SURVEY_NOT_FOUND",
    });
  });
});

describe("AcquisitionSurveyService.getResponses", () => {
  beforeEach(() => jest.clearAllMocks());

  test("수요조사 응답 목록 반환", async () => {
    mockRepo.findById.mockResolvedValue(openSurvey);
    mockRepo.getResponses.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const result = await service.getResponses(1);
    expect(result).toHaveLength(2);
    expect(mockRepo.getResponses).toHaveBeenCalledWith(1);
  });

  test("존재하지 않는 수요조사 → 404", async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(service.getResponses(99)).rejects.toMatchObject({
      statusCode: 404,
      code: "SURVEY_NOT_FOUND",
    });
  });
});
