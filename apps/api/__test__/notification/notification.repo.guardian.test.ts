import { describe, test, jest, expect, beforeEach } from "@jest/globals";
import { NotificationRepository } from "../../src/notification/notification.repo";

const mockPrisma = {
  user: {
    findUnique: jest.fn<() => Promise<any>>().mockResolvedValue({ language: "ko" }),
  },
  notification: {
    create: jest.fn<() => Promise<any>>().mockResolvedValue({ id: 1 }),
  },
} as any;

const repo = new NotificationRepository(mockPrisma);

describe("NotificationRepository - createForGuardian", () => {
  beforeEach(() => jest.clearAllMocks());

  test("sends notification to specific guardian user", async () => {
    const getMsg = (_lang: string) => ({ title: "입단 승인", body: "승인되었습니다." });
    await repo.createForGuardian("00000000-0000-4000-8000-000000000010", "YOUTH_REGISTRATION_STATUS_CHANGED", getMsg, 5);
    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "00000000-0000-4000-8000-000000000010",
        type: "YOUTH_REGISTRATION_STATUS_CHANGED",
        title: "입단 승인",
        body: "승인되었습니다.",
        entityId: 5,
      }),
    });
  });
});
