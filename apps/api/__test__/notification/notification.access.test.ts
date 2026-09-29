import { NotificationService } from "../../src/notification/notification.service";

jest.mock("../../src/lib/io", () => ({ getIO: jest.fn(() => ({ to: () => ({ emit: jest.fn() }) })) }));

// Repo mock — markRead returns Prisma updateMany result { count }.
const makeRepo = () => ({
  markRead: jest.fn(),
  findByUserId: jest.fn(),
  create: jest.fn(),
  createForStaff: jest.fn(),
  createForAllStaff: jest.fn(),
  createForAdmin: jest.fn(),
  createForGM: jest.fn(),
  createForTD: jest.fn(),
  createForContractManager: jest.fn(),
  createForHrManager: jest.fn(),
  createForFinanceManager: jest.fn(),
  createForAssetManager: jest.fn(),
  createForHeadCoach: jest.fn(),
  createForYouthHeadCoach: jest.fn(),
  createForMedicalDirector: jest.fn(),
  createForMedicalStaff: jest.fn(),
  createForCoachingStaff: jest.fn(),
  createForUser: jest.fn(),
  createForScout: jest.fn(),
  findExpiringContracts: jest.fn(),
});

describe("NotificationService.markRead — recipient guard (issue #561)", () => {
  it("본인 소유 알림 → 200 { ok: true }", async () => {
    const repo = makeRepo();
    repo.markRead.mockResolvedValue({ count: 1 });
    const svc = new NotificationService(repo as any);

    await expect(svc.markRead(42, 77)).resolves.toEqual({ ok: true });
    expect(repo.markRead).toHaveBeenCalledWith(42, 77);
  });

  it("타 유저 소유 알림 → 404 NOTIFICATION_NOT_FOUND (repo.updateMany count=0)", async () => {
    const repo = makeRepo();
    repo.markRead.mockResolvedValue({ count: 0 });
    const svc = new NotificationService(repo as any);

    await expect(svc.markRead(42, 77)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
  });

  it("존재하지 않는 알림 → 404 (동일 경로)", async () => {
    const repo = makeRepo();
    repo.markRead.mockResolvedValue({ count: 0 });
    const svc = new NotificationService(repo as any);

    await expect(svc.markRead(99999, 77)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
  });

  it("이미 read 상태인 알림 → 404 (repo where readAt: null → 매치 안됨)", async () => {
    const repo = makeRepo();
    repo.markRead.mockResolvedValue({ count: 0 });
    const svc = new NotificationService(repo as any);

    await expect(svc.markRead(42, 77)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND" });
  });

  it("repo 는 항상 (id, userId) 두 인자로 호출됨 — userId 누락 방어 회귀", async () => {
    const repo = makeRepo();
    repo.markRead.mockResolvedValue({ count: 1 });
    const svc = new NotificationService(repo as any);

    await svc.markRead(100, 200);

    const call = repo.markRead.mock.calls[0];
    expect(call).toHaveLength(2);
    expect(call![0]).toBe(100);
    expect(call![1]).toBe(200);
  });
});
