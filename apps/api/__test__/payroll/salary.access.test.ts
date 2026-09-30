import { SalaryController } from "../../src/payroll/salary/salary.controller";
import { AppError } from "../../src/lib/appError";

const makeService = () => ({
  list: jest.fn().mockResolvedValue([]),
  get: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
});

function makeReq(role: string, foRole: string | null = null): any {
  return { user: { id: "00000000-0000-4000-8000-000000000001", role, frontOfficeRole: foRole, departmentCategories: [] }, query: {}, body: {}, params: { id: "1" } };
}
function makeRes(): any {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

describe("SalaryController — canReadPayroll / canWritePayroll", () => {
  let ctrl: SalaryController;
  let svc: ReturnType<typeof makeService>;
  beforeEach(() => { svc = makeService(); ctrl = new SalaryController(svc as any); });

  describe("list (canReadPayroll)", () => {
    it("HR_STAFF → 200 (신규 커버)", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_STAFF"); const res = makeRes(); const next = jest.fn();
      await ctrl.list(req, res, next);
      expect(svc.list).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
    it("HR_MANAGER → 200", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_MANAGER"); const res = makeRes(); const next = jest.fn();
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

  describe("get (canReadPayroll)", () => {
    it("HR_STAFF → 200", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_STAFF"); const res = makeRes(); const next = jest.fn();
      await ctrl.get(req, res, next);
      expect(svc.get).toHaveBeenCalled();
    });
    it("ASSET_MANAGER → 403", async () => {
      const req = makeReq("FRONT_OFFICE", "ASSET_MANAGER"); const res = makeRes(); const next = jest.fn();
      await ctrl.get(req, res, next);
      expect(svc.get).not.toHaveBeenCalled();
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
    it("FINANCE_MANAGER → 201", async () => {
      const req = makeReq("FRONT_OFFICE", "FINANCE_MANAGER"); const res = makeRes(); const next = jest.fn();
      await ctrl.create(req, res, next);
      expect(svc.create).toHaveBeenCalled();
    });
  });

  describe("update (canWritePayroll)", () => {
    it("HR_MANAGER → 200 (신규 커버)", async () => {
      const req = makeReq("FRONT_OFFICE", "HR_MANAGER"); const res = makeRes(); const next = jest.fn();
      await ctrl.update(req, res, next);
      expect(svc.update).toHaveBeenCalled();
    });
    it("PLAYER → 403", async () => {
      const req = makeReq("PLAYER"); const res = makeRes(); const next = jest.fn();
      await ctrl.update(req, res, next);
      expect(svc.update).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });
});
