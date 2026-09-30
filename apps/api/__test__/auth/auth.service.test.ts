import {
  describe,
  test,
  jest,
  expect,
  beforeEach,
} from "@jest/globals";
import { AuthService } from "../../src/auth/auth.service";
import * as token from "../../src/lib/token";
import * as hash from "../../src/lib/hash";

const MockRepo = {
  findByEmail: jest.fn(),
  getDepartmentCategories: jest.fn(),
  isEmailTaken: jest.fn(),
  isNicknameTaken: jest.fn(),
  createUser: jest.fn(),
  createInvite: jest.fn(),
  findInviteByToken: jest.fn(),
  markInviteUsed: jest.fn(),
  blacklistToken: jest.fn(),
  deleteExpiredBlacklistEntries: jest.fn(),
  isTokenBlacklisted: jest.fn(),
  listInvites: jest.fn(),
  findById: jest.fn(),
  anonymizeUser: jest.fn(),
  exportUserData: jest.fn(),
  findPhoneNumber: jest.fn(),
  isPhoneHashTaken: jest.fn(),
} as any;

jest.mock("../../src/lib/token", () => ({
  generateTokens: jest.fn(() => ({ accessToken: "fake.access.token", refreshToken: "fake.refresh.token" })),
}));

jest.mock("../../src/lib/hash", () => ({
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));

jest.mock("../../src/lib/crypto", () => ({
  encrypt: jest.fn(() => ({ encrypted: "enc", iv: "iv" })),
  decrypt: jest.fn(),
  validatePhoneEncryptionKey: jest.fn(),
  hashPhone: jest.fn(() => "phoneHashStub"),
}));

jest.mock("../../src/lib/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

const service = new AuthService(MockRepo);

describe("AuthService - login", () => {
  beforeEach(() => jest.clearAllMocks());

  test("email 없으면 401 에러", async () => {
    await expect(service.login({ email: "", password: "1234" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test("DB에 이메일 없으면 401", async () => {
    MockRepo.findByEmail.mockResolvedValue(null);
    await expect(service.login({ email: "test@test.com", password: "1234" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test("비밀번호 틀리면 401", async () => {
    MockRepo.findByEmail.mockResolvedValue({ id: 1, password: "hashed", role: "ADMIN", coachingRole: null, frontOfficeRole: null, teamId: null, clubId: null, isDemo: false });
    (hash.comparePassword as jest.Mock).mockResolvedValue(false);
    await expect(service.login({ email: "test@test.com", password: "wrong" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  test("로그인 성공 시 accessToken, refreshToken 반환", async () => {
    MockRepo.findByEmail.mockResolvedValue({ id: 1, password: "hashed", role: "ADMIN", coachingRole: null, frontOfficeRole: null, teamId: 1, clubId: null, isDemo: false });
    (hash.comparePassword as jest.Mock).mockResolvedValue(true);
    MockRepo.getDepartmentCategories.mockResolvedValue([]);
    jest.spyOn(token, "generateTokens").mockReturnValue({ accessToken: "access-token", refreshToken: "refresh-token" });

    const result = await service.login({ email: "test@test.com", password: "1234" });
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
  });
});

describe("AuthService - createUser", () => {
  beforeEach(() => jest.clearAllMocks());

  test("비밀번호 불일치시 400", async () => {
    await expect(service.createUser({
      email: "a@test.com", password: "1234", confirmedPassword: "5678",
      nickname: "nick", username: "user", phoneNumber: "01011112222",
      role: "ADMIN", nationalityId: 1, dateOfBirth: new Date("2000-01-01"),
    } as any)).rejects.toMatchObject({ statusCode: 400 });
  });

  test("이메일 중복시 409", async () => {
    MockRepo.isEmailTaken.mockResolvedValue(true);
    await expect(service.createUser({
      email: "dup@test.com", password: "1234", confirmedPassword: "1234",
      nickname: "nick", username: "user", phoneNumber: "01011112222",
      role: "ADMIN", nationalityId: 1, dateOfBirth: new Date("2000-01-01"),
    } as any)).rejects.toMatchObject({ statusCode: 409 });
  });

  test("닉네임 중복시 409", async () => {
    MockRepo.isEmailTaken.mockResolvedValue(false);
    MockRepo.isNicknameTaken.mockResolvedValue(true);
    await expect(service.createUser({
      email: "new@test.com", password: "1234", confirmedPassword: "1234",
      nickname: "dupnick", username: "user", phoneNumber: "01011112222",
      role: "ADMIN", nationalityId: 1, dateOfBirth: new Date("2000-01-01"),
    } as any)).rejects.toMatchObject({ statusCode: 409 });
  });

  test("성공시 user 반환", async () => {
    MockRepo.isEmailTaken.mockResolvedValue(false);
    MockRepo.isNicknameTaken.mockResolvedValue(false);
    (hash.hashPassword as jest.Mock).mockResolvedValue("hashed");
    MockRepo.createUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001", email: "ok@test.com", nickname: "nick", role: "ADMIN" });

    const result = await service.createUser({
      email: "ok@test.com", password: "1234", confirmedPassword: "1234",
      nickname: "nick", username: "user", phoneNumber: "01011112222",
      role: "ADMIN", nationalityId: 1, dateOfBirth: new Date("2000-01-01"),
    } as any);
    expect(result).toMatchObject({ id: "00000000-0000-4000-8000-000000000001", email: "ok@test.com" });
  });
});

describe("AuthService - me", () => {
  beforeEach(() => jest.clearAllMocks());

  test("유저 없으면 404", async () => {
    MockRepo.findById.mockResolvedValue(null);
    await expect(service.me("00000000-0000-4000-8000-000000000099")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("유저 존재하면 반환", async () => {
    MockRepo.findById.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001", email: "a@a.com", role: "ADMIN" });
    const result = await service.me("00000000-0000-4000-8000-000000000001");
    expect(result.id).toBe("00000000-0000-4000-8000-000000000001");
  });
});

describe("AuthService - gdprErasure", () => {
  beforeEach(() => jest.clearAllMocks());

  test("유저 없으면 404", async () => {
    MockRepo.findById.mockResolvedValue(null);
    await expect(service.gdprErasure("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("이미 삭제된 유저면 409", async () => {
    MockRepo.findById.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", isDeleted: true });
    await expect(service.gdprErasure("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001")).rejects.toMatchObject({ statusCode: 409 });
  });

  test("삭제 성공", async () => {
    MockRepo.findById.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", isDeleted: false });
    MockRepo.anonymizeUser.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000002", email: "deleted" });
    const result = await service.gdprErasure("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001");
    expect(MockRepo.anonymizeUser).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000002");
    expect(result).toMatchObject({ id: "00000000-0000-4000-8000-000000000002" });
  });
});
