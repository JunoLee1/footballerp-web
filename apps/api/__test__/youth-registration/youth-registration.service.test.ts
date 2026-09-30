import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { YouthRegistrationService } from "../../src/youth-registration/youth-registration.service";

const mockRepo = {
  findAll: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  findById: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  findGuardianByEmail: jest.fn(),
  contractAndCreatePlayer: jest.fn(),
} as any;

const mockNotifRepo = {
  createForGuardian: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
} as any;

const mockInviteService = {
  inviteUser: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 99 }),
} as any;

const service = new YouthRegistrationService(mockRepo, mockNotifRepo, mockInviteService);

describe("YouthRegistrationService - create", () => {
  beforeEach(() => jest.clearAllMocks());

  test("기존 GUARDIAN가 있으면 초대 없이 guardianId 연결", async () => {
    mockRepo.findGuardianByEmail.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000010", email: "parent@test.com" });
    mockRepo.create.mockResolvedValue({ id: 1, playerName: "홍길동", guardianId: "00000000-0000-4000-8000-000000000010", team: { name: "U15" } });

    const result = await service.create(
      { playerName: "홍길동", birthDate: "2010-01-01T00:00:00.000Z", teamId: 1, guardianEmail: "parent@test.com" },
      "00000000-0000-4000-8000-000000000001",
    );

    expect(mockInviteService.inviteUser).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ guardianId: "00000000-0000-4000-8000-000000000010" }));
    expect(result.id).toBe(1);
  });

  test("GUARDIAN가 없으면 초대 발송 후 생성", async () => {
    mockRepo.findGuardianByEmail.mockResolvedValue(null);
    mockInviteService.inviteUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000020" });
    mockRepo.create.mockResolvedValue({ id: 2, playerName: "김철수", guardianId: "00000000-0000-4000-8000-000000000020", team: { name: "U18" } });

    await service.create(
      { playerName: "김철수", birthDate: "2008-03-15T00:00:00.000Z", teamId: 2, guardianEmail: "newparent@test.com" },
      "00000000-0000-4000-8000-000000000001",
    );

    expect(mockInviteService.inviteUser).toHaveBeenCalledWith(expect.objectContaining({ email: "newparent@test.com", role: "GUARDIAN" }));
    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ guardianId: "00000000-0000-4000-8000-000000000020" }));
  });
});

describe("YouthRegistrationService - guardianApprove", () => {
  beforeEach(() => jest.clearAllMocks());

  test("PENDING 상태만 승인 가능", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: "CONTRACTED", guardianId: "00000000-0000-4000-8000-000000000010" });
    await expect(service.guardianApprove(1, "00000000-0000-4000-8000-000000000010")).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATUS" });
  });

  test("다른 GUARDIAN는 승인 불가", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: "PENDING", guardianId: "00000000-0000-4000-8000-000000000010" });
    await expect(service.guardianApprove(1, "00000000-0000-4000-8000-000000000099")).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  test("본인 GUARDIAN가 PENDING 승인 → GUARDIAN_APPROVED 전환", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: "PENDING", guardianId: "00000000-0000-4000-8000-000000000010", playerName: "홍길동" });
    mockRepo.updateStatus.mockResolvedValue({ id: 1, status: "GUARDIAN_APPROVED" });

    await service.guardianApprove(1, "00000000-0000-4000-8000-000000000010");

    expect(mockRepo.updateStatus).toHaveBeenCalledWith(1, "GUARDIAN_APPROVED");
  });
});

describe("YouthRegistrationService - contract", () => {
  beforeEach(() => jest.clearAllMocks());

  test("GUARDIAN_APPROVED 상태만 계약 처리 가능", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, status: "PENDING" });
    await expect(service.contract(1, "00000000-0000-4000-8000-000000000001", 1)).rejects.toMatchObject({ statusCode: 409, code: "INVALID_STATUS" });
  });

  test("GUARDIAN_APPROVED → CONTRACTED + Player 생성", async () => {
    const reg = { id: 1, status: "GUARDIAN_APPROVED", playerName: "홍길동", birthDate: new Date("2010-01-01"), teamId: 2, guardianId: "00000000-0000-4000-8000-000000000010", preferredJerseyNumber: 7 };
    mockRepo.findById.mockResolvedValue(reg);
    mockRepo.contractAndCreatePlayer.mockResolvedValue({ id: "player-uuid" });

    await service.contract(1, "00000000-0000-4000-8000-000000000001", 82);

    expect(mockRepo.contractAndCreatePlayer).toHaveBeenCalledWith(1, reg, 82);
    expect(mockNotifRepo.createForGuardian).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000010",
      "YOUTH_REGISTRATION_STATUS_CHANGED",
      expect.any(Function),
      1,
    );
  });
});
