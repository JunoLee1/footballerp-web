import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { IncidentReportService } from "../../src/incident-report/incident-report.service";

const mockRepo = {
  findAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  findById: jest.fn(),
  create: jest.fn(),
  submit: jest.fn(),
  sign: jest.fn(),
  markSigned: jest.fn(),
  createExternalReports: jest.fn<() => Promise<any>>().mockResolvedValue({ count: 2 }),
} as any;

const mockNotifRepo = {
  createForGuardian: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
} as any;

const service = new IncidentReportService(mockRepo, mockNotifRepo);

describe("IncidentReportService - submit", () => {
  beforeEach(() => jest.clearAllMocks());

  test("DRAFT만 제출 가능", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: "SUBMITTED" });
    await expect(service.submit(1)).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATUS" });
  });

  test("SUBMITTED 전환 시 GUARDIAN에게 알림 발송", async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1, status: "DRAFT", player: { playerName: "홍길동", guardianId: "00000000-0000-4000-8000-000000000010" }, teamId: 1,
    });
    mockRepo.submit.mockResolvedValue({ id: 1, status: "SUBMITTED" });

    await service.submit(1);

    expect(mockNotifRepo.createForGuardian).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000010", "INCIDENT_REPORT_SUBMITTED", expect.any(Function), 1,
    );
  });

  test("guardianId 없으면 알림 미발송", async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1, status: "DRAFT", player: { playerName: "홍길동", guardianId: null }, teamId: 1,
    });
    mockRepo.submit.mockResolvedValue({ id: 1, status: "SUBMITTED" });

    await service.submit(1);

    expect(mockNotifRepo.createForGuardian).not.toHaveBeenCalled();
  });
});

describe("IncidentReportService - sign", () => {
  beforeEach(() => jest.clearAllMocks());

  test("SUBMITTED 상태만 서명 가능", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: "DRAFT", supervisorSigned: false, medicalSigned: false });
    await expect(service.sign(1, "SUPERVISOR")).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATUS" });
  });

  test("SUPERVISOR 서명 처리", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: "SUBMITTED", supervisorSigned: false, medicalSigned: false });
    mockRepo.sign.mockResolvedValue({ id: 1, supervisorSigned: true, medicalSigned: false });

    await service.sign(1, "SUPERVISOR");

    expect(mockRepo.sign).toHaveBeenCalledWith(1, true, false);
    expect(mockRepo.markSigned).not.toHaveBeenCalled();
  });

  test("양측 서명 완료 시 SIGNED 전환 + ExternalReport 생성", async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1, status: "SUBMITTED", supervisorSigned: true, medicalSigned: false,
      player: { playerName: "홍길동" }, description: "넘어짐",
    });
    mockRepo.sign.mockResolvedValue({ id: 1, supervisorSigned: true, medicalSigned: true });

    await service.sign(1, "MEDICAL");

    expect(mockRepo.markSigned).toHaveBeenCalledWith(1);
    expect(mockRepo.createExternalReports).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({ target: "EDUCATION_OFFICE" }),
        expect.objectContaining({ target: "SCHOOL_SAFETY" }),
      ]),
      expect.any(Object),
    );
  });
});
