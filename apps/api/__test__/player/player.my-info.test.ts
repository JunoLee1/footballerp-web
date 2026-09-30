import { describe, test, jest, expect, beforeEach } from "@jest/globals";

process.env["PHONE_ENCRYPTION_KEY"] = "a".repeat(64);

const mockService = {
  getPlayerById: jest.fn(),
  updatePlayer: jest.fn(),
};

const mockReq = (overrides: Record<string, unknown> = {}) => ({
  user: { id: "00000000-0000-4000-8000-000000000010", role: "PLAYER" },
  params: { id: "player-uuid-1" },
  body: {},
  ...overrides,
});

const mockRes = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn();

jest.mock("../../src/lib/prisma", () => ({ getPrisma: () => ({}) }));

import { PlayerController } from "../../src/player/player.controller";

describe("PlayerController — updateMyInfo (RC18)", () => {
  let controller: PlayerController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PlayerController(mockService as any);
  });

  test("PLAYER can update their own emergency contacts", async () => {
    mockService.getPlayerById.mockResolvedValue({ id: "player-uuid-1", userId: "00000000-0000-4000-8000-000000000010" });
    mockService.updatePlayer.mockResolvedValue({ id: "player-uuid-1", emergencyContactName: "Jane" });

    const req = mockReq({ body: { emergencyContactName: "Jane" } }) as any;
    const res = mockRes();

    await controller.updateMyInfo(req, res, mockNext);

    expect(mockService.updatePlayer).toHaveBeenCalledWith("player-uuid-1", {
      emergencyContactName: "Jane",
    }, undefined);
    expect(res.json).toHaveBeenCalled();
  });

  test("returns 403 if player does not own the record", async () => {
    mockService.getPlayerById.mockResolvedValue({ id: "player-uuid-1", userId: "00000000-0000-4000-8000-000000000099" }); // different user

    const req = mockReq({ body: { emergencyContactName: "Jane" } }) as any;
    const res = mockRes();

    await controller.updateMyInfo(req, res, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  test("strips non-allowed fields from body", async () => {
    mockService.getPlayerById.mockResolvedValue({ id: "player-uuid-1", userId: "00000000-0000-4000-8000-000000000010" });
    mockService.updatePlayer.mockResolvedValue({ id: "player-uuid-1" });

    const req = mockReq({
      body: {
        emergencyContactName: "Jane",
        position: "STRIKER",     // not allowed
        salary: 999999,          // not allowed
      },
    }) as any;
    const res = mockRes();

    await controller.updateMyInfo(req, res, mockNext);

    const updateArg = (mockService.updatePlayer as jest.Mock).mock.calls[0][1];
    expect(updateArg.position).toBeUndefined();
    expect(updateArg.salary).toBeUndefined();
    expect(updateArg.emergencyContactName).toBe("Jane");
  });
});
