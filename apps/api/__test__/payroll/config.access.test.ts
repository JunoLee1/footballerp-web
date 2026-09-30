import { ConfigController } from "../../src/payroll/config/config.controller";
import { AppError } from "../../src/lib/appError";

const makeService = () => ({
  list: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
});

function makeReq(role: string, foRole: string | null = null): any {
  return { user: { id: "00000000-0000-4000-8000-000000000001", role, frontOfficeRole: foRole, departmentCategories: [] }, query: {}, body: {}, params: {} };
}
function makeRes(): any {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

describe("ConfigController.list — canReadPayroll guard (issue #565)", () => {
  let ctrl: ConfigController;
  let svc: ReturnType<typeof makeService>;
  beforeEach(() => {
    svc = makeService();
    ctrl = new ConfigController(svc as any);
  });

  const ALLOWED = ["ADMIN", "SUPER_ADMIN", "GM"];
  for (const role of ALLOWED) {
    it(`${role} → 200 (service.list 호출)`, async () => {
      const req = makeReq(role);
      const res = makeRes();
      const next = jest.fn();
      await ctrl.list(req, res, next);
      expect(svc.list).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });
  }

  const FO_ALLOWED = ["FINANCE_MANAGER", "FINANCE_STAFF", "HR_MANAGER", "HR_STAFF"];
  for (const foRole of FO_ALLOWED) {
    it(`FRONT_OFFICE + ${foRole} → 200`, async () => {
      const req = makeReq("FRONT_OFFICE", foRole);
      const res = makeRes();
      const next = jest.fn();
      await ctrl.list(req, res, next);
      expect(svc.list).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
    });
  }

  const BLOCKED: Array<[string, string | null]> = [
    ["PLAYER", null],
    ["FRONT_OFFICE", "ASSET_MANAGER"],
    ["FRONT_OFFICE", "FACILITY_MANAGER"],
    ["FRONT_OFFICE", "TD"],
    ["COACHING_STAFF", null],
    ["AGENT", null],
    ["GUARDIAN", null],
  ];
  for (const [role, foRole] of BLOCKED) {
    it(`${role}${foRole ? " + " + foRole : ""} → 403 FORBIDDEN`, async () => {
      const req = makeReq(role, foRole);
      const res = makeRes();
      const next = jest.fn();
      await ctrl.list(req, res, next);
      expect(svc.list).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const err = next.mock.calls[0][0] as AppError;
      expect(err.code).toBe("FORBIDDEN");
      expect(err.statusCode).toBe(403);
    });
  }
});
