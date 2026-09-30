import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { InjuryController } from "../../src/injury/injury.controller";

const mockService = {
  getByPlayer: jest.fn(),
  getById: jest.fn(),
  createInjury: jest.fn(),
  updateStatus: jest.fn(),
  getStats: jest.fn(),
  getReport: jest.fn(),
  saveReport: jest.fn(),
  getAssessment: jest.fn(),
  processAssessment: jest.fn(),
  getExternalReports: jest.fn(),
  updateExternalReportStatus: jest.fn(),
} as any;

const controller = new InjuryController(mockService);

const mockReq = (overrides: any) =>
  ({ user: { id: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF", coachingRole: "MEDICAL", frontOfficeRole: null }, body: {}, params: {}, query: {}, ...overrides }) as any;

const mockRes = () => {
  const r: any = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
};

const mockNext = jest.fn() as any;

describe("InjuryController - getAssessment", () => {
  beforeEach(() => jest.clearAllMocks());

  test("MEDICAL → 200 + assessment data", async () => {
    const mockAssessment = { id: 1, injuryId: 5, totalScore: 72 };
    mockService.getAssessment.mockResolvedValue(mockAssessment);
    const req = mockReq({ params: { id: "5" } });
    const res = mockRes();
    await controller.getAssessment(req, res, mockNext);
    expect(mockService.getAssessment).toHaveBeenCalledWith(5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockAssessment);
  });

  test("ADMIN도 접근 가능 → 200", async () => {
    mockService.getAssessment.mockResolvedValue(null);
    const req = mockReq({ user: { id: "00000000-0000-4000-8000-000000000002", role: "ADMIN", coachingRole: null, frontOfficeRole: null }, params: { id: "3" } });
    const res = mockRes();
    await controller.getAssessment(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("InjuryController - processAssessment", () => {
  beforeEach(() => jest.clearAllMocks());

  test("MEDICAL → processAssessment 호출 + 결과 반환", async () => {
    const mockResult = { assessment: { totalScore: 85 }, triggeredReports: true };
    mockService.processAssessment.mockResolvedValue(mockResult);
    const dto = { painLevel: 9, hasSwelling: true, romScore: 10, strengthScore: 5, sprintScore: 5, jumpScore: 5, psychScore: 90, positionRiskScore: 80 };
    const req = mockReq({ params: { id: "5" }, body: dto });
    const res = mockRes();
    await controller.processAssessment(req, res, mockNext);
    expect(mockService.processAssessment).toHaveBeenCalledWith(5, dto, "00000000-0000-4000-8000-000000000001");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResult);
  });

  test("FRONT_OFFICE → 403", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "FINANCE" },
      params: { id: "5" },
      body: {},
    });
    const res = mockRes();
    await controller.processAssessment(req, res, mockNext);
    expect(mockService.processAssessment).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

describe("InjuryController - getExternalReports", () => {
  beforeEach(() => jest.clearAllMocks());

  test("외부 보고서 목록 반환 → 200", async () => {
    const reports = [{ id: 1, target: "LEAGUE", status: "PENDING_SUBMISSION" }];
    mockService.getExternalReports.mockResolvedValue(reports);
    const req = mockReq({ params: { id: "5" } });
    const res = mockRes();
    await controller.getExternalReports(req, res, mockNext);
    expect(mockService.getExternalReports).toHaveBeenCalledWith(5);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(reports);
  });
});

describe("InjuryController - updateExternalReportStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  test("MEDICAL → service 호출 후 200", async () => {
    const mockReport = { id: 7, status: "SUBMITTED", submittedNote: "이메일 발송 완료", submittedAt: new Date().toISOString() };
    mockService.updateExternalReportStatus.mockResolvedValue(mockReport);

    const req = mockReq({ params: { id: "1", reportId: "7" }, body: { status: "SUBMITTED", note: "이메일 발송 완료" } });
    const res = mockRes();
    await controller.updateExternalReportStatus(req, res, mockNext);

    expect(mockService.updateExternalReportStatus).toHaveBeenCalledWith(7, "SUBMITTED", "이메일 발송 완료");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockReport);
  });

  test("FRONT_OFFICE → 403, service 미호출", async () => {
    const req = mockReq({
      user: { id: "00000000-0000-4000-8000-000000000003", role: "FRONT_OFFICE", coachingRole: null, frontOfficeRole: "GM" },
      params: { id: "1", reportId: "7" },
      body: { status: "SUBMITTED" },
    });
    const res = mockRes();
    await controller.updateExternalReportStatus(req, res, mockNext);

    expect(mockService.updateExternalReportStatus).not.toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test("service가 AppError 404 던지면 next로 전달", async () => {
    const { AppError } = await import("../../src/lib/appError");
    mockService.updateExternalReportStatus.mockRejectedValue(new AppError(404, "EXTERNAL_REPORT_NOT_FOUND"));

    const req = mockReq({ params: { id: "1", reportId: "999" }, body: { status: "SUBMITTED" } });
    const res = mockRes();
    await controller.updateExternalReportStatus(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });
});
