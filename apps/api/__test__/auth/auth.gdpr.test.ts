import { describe, test, jest, expect, beforeEach } from "@jest/globals";

process.env["PHONE_ENCRYPTION_KEY"] = "a".repeat(64);

const mockWriteAuditLog = jest.fn().mockResolvedValue(undefined);
jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: mockWriteAuditLog }));
jest.mock("../../src/lib/hash", () => ({ hashPassword: jest.fn(), comparePassword: jest.fn() }));
jest.mock("../../src/lib/crypto", () => ({ encrypt: jest.fn(), decrypt: jest.fn() }));
jest.mock("../../src/lib/token", () => ({ generateTokens: jest.fn() }));

const mockRepo = {
  findById: jest.fn(),
  anonymizeUser: jest.fn(),
  exportUserData: jest.fn(),
};

jest.mock("../../src/lib/prisma", () => ({ getPrisma: () => ({}) }));

import { AuthService } from "../../src/auth/auth.service";

describe("AuthService — GDPR", () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(mockRepo as any);
  });

  test("gdprErasure calls anonymizeUser and writes audit log", async () => {
    mockRepo.findById.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000005", email: "test@example.com", isDeleted: false });
    mockRepo.anonymizeUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000005", email: "deleted_5@deleted.com", isDeleted: true });

    await service.gdprErasure("00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000001");

    expect(mockRepo.anonymizeUser).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000005");
    await Promise.resolve();
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "00000000-0000-4000-8000-000000000001", action: "GDPR_ERASURE_REQUESTED", targetId: "00000000-0000-4000-8000-000000000005" })
    );
  });

  test("gdprErasure throws 404 if user not found", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.gdprErasure("00000000-0000-4000-8000-000000000999", "00000000-0000-4000-8000-000000000001")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("gdprExport returns user data for ADMIN", async () => {
    mockRepo.exportUserData.mockResolvedValue({ profile: { id: "00000000-0000-4000-8000-000000000005" }, player: null, contracts: [] });

    const result = await service.gdprExport("00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000001", "ADMIN");

    expect(mockRepo.exportUserData).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000005");
    expect(result.profile.id).toBe("00000000-0000-4000-8000-000000000005");
  });

  test("gdprExport returns user data when self-requesting", async () => {
    mockRepo.exportUserData.mockResolvedValue({ profile: { id: "00000000-0000-4000-8000-000000000005" }, player: null, contracts: [] });

    const result = await service.gdprExport("00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000005", "PLAYER");

    expect(mockRepo.exportUserData).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000005");
    expect(result.profile.id).toBe("00000000-0000-4000-8000-000000000005");
  });

  test("gdprExport throws 403 when non-admin requests another user", async () => {
    await expect(service.gdprExport("00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000099", "PLAYER")).rejects.toMatchObject({ statusCode: 403 });
  });
});
