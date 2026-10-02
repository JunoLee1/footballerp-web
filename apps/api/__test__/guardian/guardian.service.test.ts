import { GuardianService } from "../../src/guardian/guardian.service";
import type { GuardianRepository } from "../../src/guardian/guardian.repo";
import type { AcademyFeeRepository } from "../../src/academy-fee/academy-fee.repo";

const makeRepo = (overrides: Partial<GuardianRepository> = {}): GuardianRepository =>
  ({
    findPlayerBySearch: jest.fn().mockResolvedValue(null),
    findInviteCode: jest.fn().mockResolvedValue(null),
    findActiveInviteCode: jest.fn().mockResolvedValue(null),
    createInviteCode: jest.fn(),
    linkGuardianToPlayer: jest.fn().mockResolvedValue({}),
    markCodeUsed: jest.fn().mockResolvedValue({}),
    findChildById: jest.fn().mockResolvedValue(null),
    findChildrenByGuardian: jest.fn().mockResolvedValue([]),
    findDashboard: jest.fn().mockResolvedValue([null, [], [], [], null, null, [], null, []]),
    ...overrides,
  } as unknown as GuardianRepository);

const fakePlayer = { id: "player-1", guardianId: null, playerName: "김유소" };

const makeSvc = (overrides: Partial<GuardianRepository> = {}) =>
  new GuardianService(makeRepo(overrides), {} as any, {} as any, {} as any);

describe("GuardianService.linkBySearch", () => {
  it("존재하지 않는 자녀 → 404", async () => {
    const svc = makeSvc();
    await expect(
      svc.linkBySearch({ studentCode: "SC001", playerName: "김유소", dateOfBirth: "2015-01-01" }, "11111111-1111-1111-1111-111111111111")
    ).rejects.toMatchObject({ statusCode: 404, message: "PLAYER_NOT_FOUND" });
  });

  it("이미 다른 guardian에 연동된 자녀 → 409", async () => {
    const svc = makeSvc({ findPlayerBySearch: jest.fn().mockResolvedValue({ ...fakePlayer, guardianId: "99999999-9999-9999-9999-999999999999" }) });
    await expect(
      svc.linkBySearch({ studentCode: "SC001", playerName: "김유소", dateOfBirth: "2015-01-01" }, "11111111-1111-1111-1111-111111111111")
    ).rejects.toMatchObject({ statusCode: 409, message: "ALREADY_LINKED" });
  });

  it("성공 → linkGuardianToPlayer 호출", async () => {
    const repo = makeRepo({ findPlayerBySearch: jest.fn().mockResolvedValue(fakePlayer) });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    await svc.linkBySearch({ studentCode: "SC001", playerName: "김유소", dateOfBirth: "2015-01-01" }, "11111111-1111-1111-1111-111111111111");
    expect(repo.linkGuardianToPlayer).toHaveBeenCalledWith("player-1", "11111111-1111-1111-1111-111111111111");
  });
});

describe("GuardianService.linkByCode", () => {
  it("존재하지 않는 코드 → 404", async () => {
    const svc = makeSvc();
    await expect(svc.linkByCode({ code: "ABCD1234" }, "11111111-1111-1111-1111-111111111111")).rejects.toMatchObject({ statusCode: 404, message: "INVALID_CODE" });
  });

  it("이미 사용된 코드 → 409", async () => {
    const repo = makeRepo({
      findInviteCode: jest.fn().mockResolvedValue({
        id: 1, playerId: "player-1", usedAt: new Date(), expiresAt: new Date(Date.now() + 1000),
      }),
    });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    await expect(svc.linkByCode({ code: "ABCD1234" }, "11111111-1111-1111-1111-111111111111")).rejects.toMatchObject({ statusCode: 409, message: "CODE_ALREADY_USED" });
  });

  it("만료된 코드 → 410", async () => {
    const repo = makeRepo({
      findInviteCode: jest.fn().mockResolvedValue({
        id: 1, playerId: "player-1", usedAt: null, expiresAt: new Date(Date.now() - 1000),
      }),
    });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    await expect(svc.linkByCode({ code: "ABCD1234" }, "11111111-1111-1111-1111-111111111111")).rejects.toMatchObject({ statusCode: 410, message: "CODE_EXPIRED" });
  });

  it("성공 → linkGuardianToPlayer + markCodeUsed 호출", async () => {
    const repo = makeRepo({
      findInviteCode: jest.fn().mockResolvedValue({
        id: 1, playerId: "player-1", usedAt: null, expiresAt: new Date(Date.now() + 100000),
      }),
    });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    await svc.linkByCode({ code: "ABCD1234" }, "11111111-1111-1111-1111-111111111111");
    expect(repo.linkGuardianToPlayer).toHaveBeenCalledWith("player-1", "11111111-1111-1111-1111-111111111111");
    expect(repo.markCodeUsed).toHaveBeenCalledWith(1, "11111111-1111-1111-1111-111111111111");
  });
});

describe("GuardianService.issueInviteCode", () => {
  it("미사용·미만료 코드가 있으면 기존 코드 반환", async () => {
    const existing = { id: 1, code: "EXIST123", playerId: "player-1", usedAt: null, expiresAt: new Date(Date.now() + 1000), issuedById: "22222222-2222-2222-2222-222222222222" };
    const repo = makeRepo({ findActiveInviteCode: jest.fn().mockResolvedValue(existing) });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    const result = await svc.issueInviteCode({ playerId: "player-1" }, "22222222-2222-2222-2222-222222222222");
    expect(result).toBe(existing);
    expect(repo.createInviteCode).not.toHaveBeenCalled();
  });

  it("없으면 새 코드 생성", async () => {
    const repo = makeRepo({ createInviteCode: jest.fn().mockResolvedValue({ code: "NEW12345" }) });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    await svc.issueInviteCode({ playerId: "player-1" }, "22222222-2222-2222-2222-222222222222");
    expect(repo.createInviteCode).toHaveBeenCalled();
  });
});

describe("GuardianService.getChildren", () => {
  it("자녀가 없으면 빈 배열 반환", async () => {
    const svc = makeSvc();
    const result = await svc.getChildren("11111111-1111-1111-1111-111111111111");
    expect(result).toEqual([]);
  });

  it("자녀가 있으면 배열 반환", async () => {
    const children = [
      { id: "player-1", playerName: "김유소", position: "STRIKER", level: "YOUTH", teamId: 1, team: { name: "FC Seoul Youth" } },
      { id: "player-2", playerName: "김유이", position: "GK", level: "YOUTH", teamId: 1, team: { name: "FC Seoul Youth" } },
    ];
    const repo = makeRepo({ findChildrenByGuardian: jest.fn().mockResolvedValue(children) });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    const result = await svc.getChildren("11111111-1111-1111-1111-111111111111");
    expect(result).toHaveLength(2);
  });
});

describe("GuardianService.getDashboard", () => {
  it("playerId에 해당하는 자녀가 없으면 404", async () => {
    const svc = makeSvc();
    await expect(svc.getDashboard("player-999")).rejects.toMatchObject({ statusCode: 404, message: "CHILD_NOT_FOUND" });
  });

  it("부상 분류 — active vs history", async () => {
    const injuries = [
      { id: 1, status: "OCCURRED" },
      { id: 2, status: "REHABILITATING" },
      { id: 3, status: "RECOVERED" },
    ];
    const attendanceGroups = [{ attendance: "ATTENDED", _count: { attendance: 5 } }];
    const child = { id: "player-1", teamId: 1 };
    const repo = makeRepo({
      findChildById: jest.fn().mockResolvedValue(child),
      findDashboard: jest.fn().mockResolvedValue([
        child, [], [], attendanceGroups, null, null, injuries, null, [],
      ]),
    });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    const result = await svc.getDashboard("player-1");
    expect(result.injuries.active).toHaveLength(2);
    expect(result.injuries.history).toHaveLength(1);
    expect(result.attendance.total).toBe(5);
    expect(result.attendance.attended).toBe(5);
  });

  it("fees 분류 — pending vs overdue", async () => {
    const fees = [
      { id: 1, status: "PENDING" },
      { id: 2, status: "OVERDUE" },
      { id: 3, status: "PENDING" },
    ];
    const child = { id: "player-1", teamId: null };
    const repo = makeRepo({
      findChildById: jest.fn().mockResolvedValue(child),
      findDashboard: jest.fn().mockResolvedValue([
        child, [], [], [], null, null, [], null, fees,
      ]),
    });
    const svc = new GuardianService(repo, {} as any, {} as any, {} as any);
    const result = await svc.getDashboard("player-1");
    expect(result.fees.pending).toHaveLength(2);
    expect(result.fees.overdue).toHaveLength(1);
  });
});

describe("GuardianService.submitFeeProof — IDOR 방지", () => {
  const makeFeeRepo = (overrides: Partial<AcademyFeeRepository> = {}): AcademyFeeRepository =>
    ({
      findById: jest.fn().mockResolvedValue(null),
      submitPaymentProof: jest.fn().mockResolvedValue({ id: 10, status: "SUBMITTED" }),
      ...overrides,
    } as unknown as AcademyFeeRepository);

  it("fee가 존재하지 않으면 404", async () => {
    const feeRepo = makeFeeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const svc = new GuardianService(makeRepo(), {} as any, {} as any, feeRepo);
    await expect(svc.submitFeeProof(999, "http://proof.url", "player-1"))
      .rejects.toMatchObject({ statusCode: 404, message: "ACADEMY_FEE_NOT_FOUND" });
  });

  it("feeId가 다른 선수 것이면 403", async () => {
    const feeRepo = makeFeeRepo({
      findById: jest.fn().mockResolvedValue({ id: 10, playerId: "player-OTHER" }),
    });
    const svc = new GuardianService(makeRepo(), {} as any, {} as any, feeRepo);
    await expect(svc.submitFeeProof(10, "http://proof.url", "player-1"))
      .rejects.toMatchObject({ statusCode: 403, message: "FORBIDDEN" });
  });

  it("feeId가 자녀 것이면 정상 처리", async () => {
    const feeRepo = makeFeeRepo({
      findById: jest.fn().mockResolvedValue({ id: 10, playerId: "player-1" }),
    });
    const svc = new GuardianService(makeRepo(), {} as any, {} as any, feeRepo);
    await svc.submitFeeProof(10, "http://proof.url", "player-1");
    expect(feeRepo.submitPaymentProof).toHaveBeenCalledWith(10, "http://proof.url");
  });
});
