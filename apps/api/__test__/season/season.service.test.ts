import { SeasonService } from "../../src/season/season.service";
import type { SeasonRepository } from "../../src/season/season.repo";
import type { RecruitmentService } from "../../src/recruitment/recruitment.service";

// carryover 는 side-effect 만 있고 반환값에 관여하지 않으므로 no-op 으로 mock.
jest.mock("../../src/lib/season-carryover", () => ({
  applyCarryOverToNextSeason: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/lib/prisma", () => ({
  getPrisma: () => ({}),
}));

describe("SeasonService.closeSeason (waitlist expire hook)", () => {
  test("closeSeason 성공 시 recruitmentService.expireAllWaitlists 호출", async () => {
    const seasonRepo = {
      findById: jest.fn().mockResolvedValue({ id: 1, status: "ACTIVE" }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1, status: "CLOSED" }),
    } as unknown as SeasonRepository;
    const recruitment = {
      expireAllWaitlists: jest.fn().mockResolvedValue(undefined),
    } as unknown as RecruitmentService;
    const svc = new SeasonService(seasonRepo, recruitment);
    await svc.closeSeason(1);
    expect(recruitment.expireAllWaitlists).toHaveBeenCalled();
  });

  test("expire 실패해도 closeSeason 자체는 성공 (best-effort)", async () => {
    const seasonRepo = {
      findById: jest.fn().mockResolvedValue({ id: 1, status: "ACTIVE" }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1, status: "CLOSED" }),
    } as unknown as SeasonRepository;
    const recruitment = {
      expireAllWaitlists: jest.fn().mockRejectedValue(new Error("boom")),
    } as unknown as RecruitmentService;
    const svc = new SeasonService(seasonRepo, recruitment);
    const result = await svc.closeSeason(1);
    expect(result.status).toBe("CLOSED");
  });

  test("recruitmentService 미주입 시 skip (backward-compat)", async () => {
    const seasonRepo = {
      findById: jest.fn().mockResolvedValue({ id: 1, status: "ACTIVE" }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1, status: "CLOSED" }),
    } as unknown as SeasonRepository;
    const svc = new SeasonService(seasonRepo);
    const result = await svc.closeSeason(1);
    expect(result.status).toBe("CLOSED");
  });
});

describe("SeasonService.closeSeason (budget draft hook)", () => {
  const makeRepo = () =>
    ({
      findById: jest.fn().mockResolvedValue({ id: 1, status: "ACTIVE" }),
      updateStatus: jest.fn().mockResolvedValue({ id: 1, status: "CLOSED" }),
    }) as unknown as SeasonRepository;

  test("budgetPlanDraftService 주입 시 createDraftForNextSeason 호출", async () => {
    const draftHook = {
      createDraftForNextSeason: jest.fn().mockResolvedValue({ nextSeasonId: 2, draftReportId: 100 }),
    };
    const svc = new SeasonService(makeRepo(), undefined, draftHook);
    await svc.closeSeason(1);
    expect(draftHook.createDraftForNextSeason).toHaveBeenCalledWith(1);
  });

  test("draft 훅 실패해도 closeSeason 자체는 성공 (best-effort)", async () => {
    const draftHook = {
      createDraftForNextSeason: jest.fn().mockRejectedValue(new Error("preview boom")),
    };
    const svc = new SeasonService(makeRepo(), undefined, draftHook);
    const result = await svc.closeSeason(1);
    expect(result.status).toBe("CLOSED");
  });

  test("budgetPlanDraftService 미주입 시 skip", async () => {
    const svc = new SeasonService(makeRepo());
    const result = await svc.closeSeason(1);
    expect(result.status).toBe("CLOSED");
  });
});
