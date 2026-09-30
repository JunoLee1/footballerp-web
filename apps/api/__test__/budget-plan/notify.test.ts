import { notifyBudgetPlanEvent } from "../../src/budget-plan/notify";

const makeDeps = () => {
  const repo = {
    createForFinanceManager: jest.fn().mockResolvedValue(undefined),
    createForGM: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
  };
  const email = {
    sendCapacityFailedEmail: jest.fn().mockResolvedValue(undefined),
    sendReviewOpenedEmail: jest.fn().mockResolvedValue(undefined),
    sendReviewDeadlineD1Email: jest.fn().mockResolvedValue(undefined),
  };
  return { notificationRepo: repo, email };
};

const reviewer = (userId: number, email: string | null = "u@example.com") => ({
  userId,
  email,
  language: "ko",
  scope: "TEAM" as const,
  ownerId: "00000000-0000-4000-8000-000000000001",
});

describe("notifyBudgetPlanEvent (ADR 0021 channel routing)", () => {
  test("DRAFT_READY → FinanceManager 만, email 없음", async () => {
    const deps = makeDeps();
    await notifyBudgetPlanEvent("DRAFT_READY", { seasonId: 5 }, deps);
    expect(deps.notificationRepo.createForFinanceManager).toHaveBeenCalledWith(
      "BUDGET_PLAN_DRAFT_READY",
      expect.any(Function),
      5,
    );
    expect(deps.email.sendCapacityFailedEmail).not.toHaveBeenCalled();
    expect(deps.email.sendReviewOpenedEmail).not.toHaveBeenCalled();
    expect(deps.email.sendReviewDeadlineD1Email).not.toHaveBeenCalled();
  });

  test("CAPACITY_FAILED → GM in-app + reviewers 있으면 email", async () => {
    const deps = makeDeps();
    await notifyBudgetPlanEvent(
      "CAPACITY_FAILED",
      { seasonId: 5, reason: "insufficient", reviewers: [reviewer(1), reviewer(2, null)] },
      deps,
    );
    expect(deps.notificationRepo.createForGM).toHaveBeenCalledWith(
      "BUDGET_PLAN_CAPACITY_FAILED",
      expect.any(Function),
      5,
    );
    // email 은 email 있는 reviewer 만
    expect(deps.email.sendCapacityFailedEmail).toHaveBeenCalledTimes(1);
    expect(deps.email.sendCapacityFailedEmail).toHaveBeenCalledWith("u@example.com", 5, "insufficient");
  });

  test("REVIEW_OPENED → 각 reviewer in-app + email (email 있는 경우)", async () => {
    const deps = makeDeps();
    const deadline = new Date("2026-12-31");
    await notifyBudgetPlanEvent(
      "REVIEW_OPENED",
      { seasonId: 5, deadline, reviewers: [reviewer(1), reviewer(2, null)] },
      deps,
    );
    expect(deps.notificationRepo.create).toHaveBeenCalledTimes(2);
    expect(deps.email.sendReviewOpenedEmail).toHaveBeenCalledTimes(1);
    expect(deps.email.sendReviewOpenedEmail).toHaveBeenCalledWith("u@example.com", 5, deadline);
  });

  test("REMINDER_D7 → in-app 만, email X", async () => {
    const deps = makeDeps();
    await notifyBudgetPlanEvent(
      "REMINDER_D7",
      { seasonId: 5, reviewers: [reviewer(1), reviewer(2)] },
      deps,
    );
    expect(deps.notificationRepo.create).toHaveBeenCalledTimes(2);
    expect(deps.email.sendReviewOpenedEmail).not.toHaveBeenCalled();
    expect(deps.email.sendReviewDeadlineD1Email).not.toHaveBeenCalled();
  });

  test("REMINDER_D1 → in-app + email (email 있는 경우)", async () => {
    const deps = makeDeps();
    const deadline = new Date("2026-12-31");
    await notifyBudgetPlanEvent(
      "REMINDER_D1",
      { seasonId: 5, deadline, reviewers: [reviewer(1), reviewer(2, null)] },
      deps,
    );
    expect(deps.notificationRepo.create).toHaveBeenCalledTimes(2);
    expect(deps.email.sendReviewDeadlineD1Email).toHaveBeenCalledTimes(1);
  });

  test("FINALIZED → in-app 만", async () => {
    const deps = makeDeps();
    await notifyBudgetPlanEvent(
      "FINALIZED",
      { seasonId: 5, reviewers: [reviewer(1)] },
      deps,
    );
    expect(deps.notificationRepo.create).toHaveBeenCalledTimes(1);
    expect(deps.email.sendReviewOpenedEmail).not.toHaveBeenCalled();
  });

  test("REVIEW_OPENED reviewers 없음 → no-op", async () => {
    const deps = makeDeps();
    await notifyBudgetPlanEvent("REVIEW_OPENED", { seasonId: 5 }, deps);
    expect(deps.notificationRepo.create).not.toHaveBeenCalled();
    expect(deps.email.sendReviewOpenedEmail).not.toHaveBeenCalled();
  });
});
