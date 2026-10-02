import { SalesController } from "../../src/sales/sales.controller";

describe("SalesController.cancel — requireUser 가드", () => {
  it("user가 없는 요청은 401을 next로 전달해야 한다", async () => {
    const mockService = { createCancellation: jest.fn() } as any;
    const ctrl = new SalesController(mockService);
    const req = { params: { id: "1" }, body: {}, user: undefined } as any;
    const res = { json: jest.fn() } as any;
    const next = jest.fn();
    await ctrl.cancel(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(mockService.createCancellation).not.toHaveBeenCalled();
  });

  it("canWriteFinance 실패 시 403을 next로 전달해야 한다", async () => {
    const mockService = { createCancellation: jest.fn() } as any;
    const ctrl = new SalesController(mockService);
    const req = {
      params: { id: "1" },
      body: {},
      user: { id: 1, role: "PLAYER", frontOfficeRole: null },
    } as any;
    const res = { json: jest.fn() } as any;
    const next = jest.fn();
    await ctrl.cancel(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(mockService.createCancellation).not.toHaveBeenCalled();
  });
});
