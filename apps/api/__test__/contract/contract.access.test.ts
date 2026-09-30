import { ContractService } from "../../src/contract/contract.service";

jest.mock("../../src/lib/auditLog", () => ({ writeAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/lib/prisma", () => ({
  getPrisma: jest.fn().mockReturnValue({ player: { findUnique: jest.fn() } }),
}));

const CONTRACT = { id: 1, playerId: "player-001", salary: 50000000 };

const makeRepo = () => ({
  findById: jest.fn().mockResolvedValue(CONTRACT),
  findPlayerOwnerUserId: jest.fn(),
  hasBuyout: jest.fn(),
  create: jest.fn(),
  createBuyout: jest.fn(),
  createExtension: jest.fn(),
  createBonus: jest.fn(),
  updateStatus: jest.fn(),
  findByPlayerId: jest.fn(),
  findActiveBuyout: jest.fn(),
  getSquadSalaryByPosition: jest.fn(),
  getContractExpirySoonWithMarketValue: jest.fn(),
  getTransferPnL: jest.fn(),
  getSalaryBenchmarkByLevel: jest.fn(),
  getProspectCostSummary: jest.fn(),
  terminateActiveContracts: jest.fn(),
});
const makeWageCap = () => ({ check: jest.fn().mockResolvedValue({ status: "OK" }) });
const makeNotifRepo = () => ({ createForGM: jest.fn(), createForTD: jest.fn() });

const makeService = (repoOverride: Record<string, unknown> | null = null) => {
  const repo = repoOverride || makeRepo();
  return { svc: new ContractService(repo as any, makeWageCap() as any, makeNotifRepo() as any), repo };
};

describe("ContractService.getContractById — owner-scope guard (issue #560)", () => {
  it("actor 없이 호출 → 그대로 반환 (하위 호환)", async () => {
    const { svc } = makeService(null);
    await expect(svc.getContractById(1)).resolves.toEqual(CONTRACT);
  });

  it("존재하지 않는 contract → 404", async () => {
    const repo = makeRepo(); repo.findById.mockResolvedValue(null);
    const { svc } = makeService(repo);
    await expect(svc.getContractById(999, { userId: "00000000-0000-4000-8000-000000000001", role: "ADMIN" })).rejects.toMatchObject({ code: "CONTRACT_NOT_FOUND" });
  });

  describe("privileged roles → 200", () => {
    it("ADMIN 통과", async () => {
      const { svc } = makeService(null);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000001", role: "ADMIN" })).resolves.toEqual(CONTRACT);
    });
    it("SUPER_ADMIN 통과", async () => {
      const { svc } = makeService(null);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000001", role: "SUPER_ADMIN" })).resolves.toEqual(CONTRACT);
    });
    it("GM 통과", async () => {
      const { svc } = makeService(null);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000001", role: "GM" })).resolves.toEqual(CONTRACT);
    });
    it("FRONT_OFFICE + FINANCE_MANAGER 통과 (canReadFinance)", async () => {
      const { svc } = makeService(null);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000001", role: "FRONT_OFFICE", frontOfficeRole: "FINANCE_MANAGER" })).resolves.toEqual(CONTRACT);
    });
    it("FRONT_OFFICE + HR_MANAGER 통과 (canReadHR)", async () => {
      const { svc } = makeService(null);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000001", role: "FRONT_OFFICE", frontOfficeRole: "HR_MANAGER" })).resolves.toEqual(CONTRACT);
    });
    it("FRONT_OFFICE + HR_STAFF 통과", async () => {
      const { svc } = makeService(null);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000001", role: "FRONT_OFFICE", frontOfficeRole: "HR_STAFF" })).resolves.toEqual(CONTRACT);
    });
    it("deptCategories 에 FINANCE 포함 → 통과", async () => {
      const { svc } = makeService(null);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000001", role: "COACHING_STAFF", departmentCategories: ["FINANCE"] })).resolves.toEqual(CONTRACT);
    });
  });

  describe("PLAYER 본인 계약 → 200 / 타인 계약 → 403", () => {
    it("본인 소유 (Player.userId === actor.userId) → 통과", async () => {
      const repo = makeRepo();
      repo.findPlayerOwnerUserId.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000077" });
      const { svc } = makeService(repo);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000077", role: "PLAYER" })).resolves.toEqual(CONTRACT);
    });

    it("타인 소유 → 403 FORBIDDEN", async () => {
      const repo = makeRepo();
      repo.findPlayerOwnerUserId.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000999" });
      const { svc } = makeService(repo);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000077", role: "PLAYER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Player 미존재 (userId null) → 403 (안전)", async () => {
      const repo = makeRepo();
      repo.findPlayerOwnerUserId.mockResolvedValue(null);
      const { svc } = makeService(repo);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000077", role: "PLAYER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("Player.userId=null (linked 안됨) → 403", async () => {
      const repo = makeRepo();
      repo.findPlayerOwnerUserId.mockResolvedValue({ userId: null });
      const { svc } = makeService(repo);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000077", role: "PLAYER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("non-privileged non-owner → 403", () => {
    it("COACHING_STAFF (no FINANCE/HR dept) → 403", async () => {
      const repo = makeRepo();
      repo.findPlayerOwnerUserId.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000999" });
      const { svc } = makeService(repo);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000077", role: "COACHING_STAFF" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("FRONT_OFFICE + ASSET_MANAGER (자산 담당) → 403", async () => {
      const repo = makeRepo();
      repo.findPlayerOwnerUserId.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000999" });
      const { svc } = makeService(repo);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000077", role: "FRONT_OFFICE", frontOfficeRole: "ASSET_MANAGER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("AGENT → 403 (본인 관리 선수만 봐야 하지만 현재 스코프 밖 → 우선 403)", async () => {
      const repo = makeRepo();
      repo.findPlayerOwnerUserId.mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000999" });
      const { svc } = makeService(repo);
      await expect(svc.getContractById(1, { userId: "00000000-0000-4000-8000-000000000077", role: "AGENT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
