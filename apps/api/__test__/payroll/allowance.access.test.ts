import { AllowanceController } from "../../src/payroll/allowance/allowance.controller";
import { AppError } from "../../src/lib/appError";

const makeService = () => ({
  list: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue(undefined),
});

function makeReq(role: string, foRole: string | null = null): any {
  return { user: { id: "00000000-0000-4000-8000-000000000001", role, frontOfficeRole: foRole, departmentCategories: [] }, query: {}, body: {}, params: { id: "cmxtestsalary000000000001", aid: "10" } };
}
function makeRes(): any {
  return { json: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() };
}

describe("AllowanceController — canReadPayroll / canWritePayroll", () => {
  let ctrl: AllowanceController;
  let svc: ReturnType<typeof makeService>;
  beforeEach(() => { svc = makeService(); ctrl = new AllowanceController(svc as any); });

  describe("list (canReadPayroll)", () => {
    it("HR_STAFF → 200 (신규 커버)", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_STAFF"); const res = makeRes(); const next = jest.fn();
      await ctrl.list(req, res, next);
      expect(svc.list).toHaveBeenCalled();
    });
    it("FINANCE_MANAGER → 200", async () => {
      const req = makeReq("FRONT_OFFICE", "FINANCE_MANAGER"); const res = makeRes(); const next = jest.fn();
      await ctrl.list(req, res, next);
      expect(svc.list).toHaveBeenCalled();
    });
    it("PLAYER → 403", async () => {
      const req = makeReq("PLAYER"); const res = makeRes(); const next = jest.fn();
      await ctrl.list(req, res, next);
      expect(svc.list).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe("create (canWritePayroll)", () => {
    it("HR_MANAGER → 201 (신규 커버)", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_MANAGER"); const res = makeRes(); const next = jest.fn();
      await ctrl.create(req, res, next);
      expect(svc.create).toHaveBeenCalled();
    });
    it("HR_STAFF → 403 (write 는 MANAGER 만)", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_STAFF"); const res = makeRes(); const next = jest.fn();
      await ctrl.create(req, res, next);
      expect(svc.create).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
    it("PLAYER → 403", async () => {
      const req = makeReq("PLAYER"); const res = makeRes(); const next = jest.fn();
      await ctrl.create(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe("update (canWritePayroll)", () => {
    it("HR_MANAGER → 200 (신규 커버)", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_MANAGER"); const res = makeRes(); const next = jest.fn();
      await ctrl.update(req, res, next);
      expect(svc.update).toHaveBeenCalled();
    });
    it("ASSET_MANAGER → 403", async () => {
      const req = makeReq("FRONT_OFFICE", "ASSET_MANAGER"); const res = makeRes(); const next = jest.fn();
      await ctrl.update(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe("remove (canWritePayroll)", () => {
    it("HR_MANAGER → 204 (신규 커버)", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_MANAGER"); const res = makeRes(); const next = jest.fn();
      await ctrl.remove(req, res, next);
      expect(svc.remove).toHaveBeenCalled();
    });
    it("COACH → 403", async () => {
      const req = makeReq("COACHING_STAFF"); const res = makeRes(); const next = jest.fn();
      await ctrl.remove(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });
});
