import { describe, test, jest, expect, beforeEach } from "@jest/globals";

const mockWriteAuditLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: mockWriteAuditLog }));

const mockRepo = {
  findById: jest.fn(),
  updateStatus: jest.fn(),
};
const mockNotifRepo = { createForGuardian: jest.fn() };
const mockInviteService = { inviteUser: jest.fn() };

import { YouthRegistrationService } from "../../src/youth-registration/youth-registration.service";

describe("YouthRegistrationService — guardian consent log", () => {
  let service: YouthRegistrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new YouthRegistrationService(mockRepo as any, mockNotifRepo as any, mockInviteService as any);
  });

  test("guardianApprove writes GUARDIAN_CONSENT_GRANTED audit log", async () => {
    mockRepo.findById.mockResolvedValue({
      id: 1,
      guardianId: "00000000-0000-4000-8000-000000000042",
      status: "PENDING",
      playerName: "김철수",
    });
    mockRepo.updateStatus.mockResolvedValue({ id: 1, status: "GUARDIAN_APPROVED" });

    await service.guardianApprove(1, "00000000-0000-4000-8000-000000000042");

    // Fire-and-forget — flush microtask queue
    await Promise.resolve();

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "00000000-0000-4000-8000-000000000042",
        action: "GUARDIAN_CONSENT_GRANTED",
        targetId: 1,
      })
    );
  });
});
