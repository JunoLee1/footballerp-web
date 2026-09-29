# Payroll Role Guard 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/payroll/configs` LEAK 파치 + payroll 4 sub-controller role guard 를 `canReadPayroll` / `canWritePayroll` helper 로 통일.

**Architecture:** `lib/permissions.ts` 에 `canReadPayroll = canReadFinance || canReadHR`, `canWritePayroll = canWriteFinance || canWriteHR` helper 추가. config/salary/allowance 3 controller 의 11 handler 를 helper 로 통일. run 은 이미 정합.

**Tech Stack:** TypeScript, Express, Jest (ts-jest preset), 기존 permissions helper 패턴.

**관련 이슈**: #565 (CRITICAL LEAK)
**Spec**: `docs/superpowers/specs/2026-09-29-payroll-role-guard-design.md`
**Branch**: `fix/fianance-payroll-access` (이미 spec 커밋됨)

---

## File Structure

- **Create**: `apps/api/__test__/payroll/access-guard.test.ts` (회귀 매트릭스)
- **Modify**: `apps/api/src/lib/permissions.ts` (+ 2 helper)
- **Modify**: `apps/api/src/payroll/config/config.controller.ts` (list 신규 guard + 2 handler 교체)
- **Modify**: `apps/api/src/payroll/salary/salary.controller.ts` (4 handler 교체)
- **Modify**: `apps/api/src/payroll/allowance/allowance.controller.ts` (4 handler 교체)
- **Unchanged**: `apps/api/src/payroll/run/*.ts` (이미 정합)

---

### Task 1: `canReadPayroll` / `canWritePayroll` helper 추가 (TDD)

**Files:**
- Test: `apps/api/__test__/lib/permissions.payroll.test.ts` (신규)
- Modify: `apps/api/src/lib/permissions.ts` (line 40~58 인접에 추가)

- [ ] **Step 1: 회귀 테스트 파일 신규 작성 (failing)**

```typescript
// apps/api/__test__/lib/permissions.payroll.test.ts
import { canReadPayroll, canWritePayroll } from "../../src/lib/permissions";

describe("canReadPayroll", () => {
  it("ADMIN 통과", () => {
    expect(canReadPayroll("ADMIN", null, [])).toBe(true);
  });
  it("SUPER_ADMIN 통과", () => {
    expect(canReadPayroll("SUPER_ADMIN", null, [])).toBe(true);
  });
  it("GM 통과", () => {
    expect(canReadPayroll("GM", null, [])).toBe(true);
  });
  it("FRONT_OFFICE + FINANCE_MANAGER 통과", () => {
    expect(canReadPayroll("FRONT_OFFICE", "FINANCE_MANAGER", [])).toBe(true);
  });
  it("FRONT_OFFICE + FINANCE_STAFF 통과 (canReadFinance)", () => {
    expect(canReadPayroll("FRONT_OFFICE", "FINANCE_STAFF", [])).toBe(true);
  });
  it("FRONT_OFFICE + HR_MANAGER 통과", () => {
    expect(canReadPayroll("FRONT_OFFICE", "HR_MANAGER", [])).toBe(true);
  });
  it("FRONT_OFFICE + HR_STAFF 통과", () => {
    expect(canReadPayroll("FRONT_OFFICE", "HR_STAFF", [])).toBe(true);
  });
  it("deptCategories 에 FINANCE 포함 → 통과", () => {
    expect(canReadPayroll("COACHING_STAFF", null, ["FINANCE"])).toBe(true);
  });
  it("deptCategories 에 HR 포함 → 통과", () => {
    expect(canReadPayroll("COACHING_STAFF", null, ["HR"])).toBe(true);
  });
  it("PLAYER 차단", () => {
    expect(canReadPayroll("PLAYER", null, [])).toBe(false);
  });
  it("FRONT_OFFICE + ASSET_MANAGER 차단", () => {
    expect(canReadPayroll("FRONT_OFFICE", "ASSET_MANAGER", [])).toBe(false);
  });
  it("COACHING_STAFF (dept 없음) 차단", () => {
    expect(canReadPayroll("COACHING_STAFF", null, [])).toBe(false);
  });
});

describe("canWritePayroll", () => {
  it("ADMIN 통과", () => {
    expect(canWritePayroll("ADMIN", null, [])).toBe(true);
  });
  it("GM 통과", () => {
    expect(canWritePayroll("GM", null, [])).toBe(true);
  });
  it("FRONT_OFFICE + FINANCE_MANAGER 통과", () => {
    expect(canWritePayroll("FRONT_OFFICE", "FINANCE_MANAGER", [])).toBe(true);
  });
  it("FRONT_OFFICE + HR_MANAGER 통과", () => {
    expect(canWritePayroll("FRONT_OFFICE", "HR_MANAGER", [])).toBe(true);
  });
  it("FRONT_OFFICE + FINANCE_STAFF 차단 (canWriteFinance 는 MANAGER 만)", () => {
    expect(canWritePayroll("FRONT_OFFICE", "FINANCE_STAFF", [])).toBe(false);
  });
  it("FRONT_OFFICE + HR_STAFF 차단 (canWriteHR 은 MANAGER 만)", () => {
    expect(canWritePayroll("FRONT_OFFICE", "HR_STAFF", [])).toBe(false);
  });
  it("PLAYER 차단", () => {
    expect(canWritePayroll("PLAYER", null, [])).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 → import 실패로 fail 확인**

```bash
cd /Users/juno/work/football/apps/api && pnpm jest __test__/lib/permissions.payroll.test.ts 2>&1 | tail -10
```

Expected: `Cannot find name 'canReadPayroll'` 또는 유사 컴파일/import 에러.

- [ ] **Step 3: `permissions.ts` 에 helper 2개 추가**

`apps/api/src/lib/permissions.ts` 의 `canWriteHR` (line 55~58) 다음 줄에 삽입:

```typescript
// 급여 도메인은 Finance + HR 이 함께 접근 (HR: 급여 계산/4대보험/원천세, Finance: 예산/승인)
// 관련 이슈 #565 · 스펙 docs/superpowers/specs/2026-09-29-payroll-role-guard-design.md
export const canReadPayroll = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  canReadFinance(role, foRole, deptCategories) || canReadHR(role, foRole, deptCategories)

export const canWritePayroll = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  canWriteFinance(role, foRole, deptCategories) || canWriteHR(role, foRole, deptCategories)
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/juno/work/football/apps/api && pnpm jest __test__/lib/permissions.payroll.test.ts 2>&1 | tail -10
```

Expected: 19 tests passed.

- [ ] **Step 5: 커밋**

```bash
git -C /Users/juno/work/football add \
  apps/api/src/lib/permissions.ts \
  apps/api/__test__/lib/permissions.payroll.test.ts
git -C /Users/juno/work/football commit -m "feat(permissions): canReadPayroll / canWritePayroll helper 추가 (#565)

Finance 와 HR 이 함께 접근하는 payroll 도메인용 helper.
- canReadPayroll = canReadFinance || canReadHR
- canWritePayroll = canWriteFinance || canWriteHR

한국 실무: HR 이 급여 계산·4대보험·원천세 담당, Finance 는 예산·승인.

19 unit tests (permissions.payroll.test.ts) 통과.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `config.controller.list` LEAK 파치 (TDD · CRITICAL)

**Files:**
- Create: `apps/api/__test__/payroll/config.access.test.ts`
- Modify: `apps/api/src/payroll/config/config.controller.ts` (line 3, 11-15)

- [ ] **Step 1: 회귀 테스트 — config.list guard 검증 (failing)**

```typescript
// apps/api/__test__/payroll/config.access.test.ts
import { ConfigController } from "../../src/payroll/config/config.controller";
import { AppError } from "../../src/lib/appError";

const makeService = () => ({
  list: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn(),
});

function makeReq(role: string, foRole: string | null = null): any {
  return { user: { id: 1, role, frontOfficeRole: foRole, departmentCategories: [] }, query: {}, body: {}, params: {} };
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
      expect(err.status).toBe(403);
    });
  }
});
```

- [ ] **Step 2: 테스트 실행 → guard 없어서 BLOCKED 케이스 fail 확인**

```bash
cd /Users/juno/work/football/apps/api && pnpm jest __test__/payroll/config.access.test.ts 2>&1 | tail -15
```

Expected: 7 BLOCKED 테스트 실패 (`svc.list` 호출됨), 7 ALLOWED 통과.

- [ ] **Step 3: `config.controller.ts` 에 guard 추가**

`apps/api/src/payroll/config/config.controller.ts` 를 다음으로 교체:

```typescript
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { canReadPayroll, canWritePayroll } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import type { ConfigService } from "./config.service";
import type { CreatePayrollConfigDto, UpdatePayrollConfigDto, PayrollConfigListQuery } from "./dto/config.dto";

export class ConfigController {
  constructor(private service: ConfigService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadPayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(req.query as PayrollConfigListQuery));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body as CreatePayrollConfigDto));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(Number(req.params["id"]), req.body as UpdatePayrollConfigDto));
    } catch (err) { next(err); }
  };
}
```

- [ ] **Step 4: 테스트 통과 확인 + 기존 payroll 테스트 회귀 확인**

```bash
cd /Users/juno/work/football/apps/api && pnpm jest __test__/payroll/ 2>&1 | tail -15
```

Expected: 신규 14 tests + 기존 config.service.test 등 통과.

- [ ] **Step 5: 커밋**

```bash
git -C /Users/juno/work/football add \
  apps/api/src/payroll/config/config.controller.ts \
  apps/api/__test__/payroll/config.access.test.ts
git -C /Users/juno/work/football commit -m "fix(payroll): config.list role guard 추가 (CRITICAL LEAK 파치 · #565)

config.list 가 auth 만 있고 role guard 없어 7 role 전부 200 조회 가능했던
CRITICAL LEAK 파치. canReadPayroll (Finance || HR) 로 통일.

create/update 도 canWriteFinance → canWritePayroll 로 확장
(HR 도 급여 체계 정책 반영 가능).

14 config.access unit tests 통과 (7 allowed + 7 blocked).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `salary.controller` 4 handler 를 payroll helper 로 통일 (TDD)

**Files:**
- Create: `apps/api/__test__/payroll/salary.access.test.ts`
- Modify: `apps/api/src/payroll/salary/salary.controller.ts`

- [ ] **Step 1: 회귀 테스트 — HR 도 read 통과, HR_MANAGER 도 write 통과**

```typescript
// apps/api/__test__/payroll/salary.access.test.ts
import { SalaryController } from "../../src/payroll/salary/salary.controller";
import { AppError } from "../../src/lib/appError";

const makeService = () => ({
  list: jest.fn().mockResolvedValue([]),
  get: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
});

function makeReq(role: string, foRole: string | null = null): any {
  return { user: { id: 1, role, frontOfficeRole: foRole, departmentCategories: [] }, query: {}, body: {}, params: { id: "1" } };
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
```

- [ ] **Step 2: 테스트 실행 → HR 신규 케이스 fail 확인**

```bash
cd /Users/juno/work/football/apps/api && pnpm jest __test__/payroll/salary.access.test.ts 2>&1 | tail -15
```

Expected: `HR_STAFF → 200 (신규 커버)` 등 HR 케이스 fail (current: canReadFinance 만 통과).

- [ ] **Step 3: `salary.controller.ts` 를 payroll helper 로 교체**

`apps/api/src/payroll/salary/salary.controller.ts` 를 다음으로 교체:

```typescript
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { canReadPayroll, canWritePayroll } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import type { SalaryService } from "./salary.service";
import type { CreateSalaryDto, UpdateSalaryDto, SalaryListQuery } from "./dto/salary.dto";

export class SalaryController {
  constructor(private service: SalaryService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadPayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(req.query as SalaryListQuery));
    } catch (err) { next(err); }
  };

  get = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadPayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.get(Number(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: actorId, role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(await this.service.create(req.body as CreateSalaryDto, actorId));
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id: actorId, role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.update(Number(req.params["id"]), req.body as UpdateSalaryDto, actorId));
    } catch (err) { next(err); }
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd /Users/juno/work/football/apps/api && pnpm jest __test__/payroll/salary.access.test.ts 2>&1 | tail -15
```

Expected: 10 tests 통과.

- [ ] **Step 5: 커밋**

```bash
git -C /Users/juno/work/football add \
  apps/api/src/payroll/salary/salary.controller.ts \
  apps/api/__test__/payroll/salary.access.test.ts
git -C /Users/juno/work/football commit -m "refactor(payroll): salary.controller 를 canReadPayroll/canWritePayroll 로 통일 (#565)

salary.list/get 은 canReadFinance → canReadPayroll (HR 도 조회).
salary.create/update 는 canWriteFinance → canWritePayroll (HR_MANAGER 도 작성).

HR 이 급여 계산·4대보험·원천세 실무 담당이므로 salary 접근 필요.

10 salary.access unit tests 통과 (HR 신규 커버 + PLAYER/ASSET 차단).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `allowance.controller` 4 handler 를 payroll helper 로 통일 (TDD)

**Files:**
- Create: `apps/api/__test__/payroll/allowance.access.test.ts`
- Modify: `apps/api/src/payroll/allowance/allowance.controller.ts`

- [ ] **Step 1: 회귀 테스트 — HR 신규 커버 + PLAYER 차단**

```typescript
// apps/api/__test__/payroll/allowance.access.test.ts
import { AllowanceController } from "../../src/payroll/allowance/allowance.controller";
import { AppError } from "../../src/lib/appError";

const makeService = () => ({
  list: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue(undefined),
});

function makeReq(role: string, foRole: string | null = null): any {
  return { user: { id: 1, role, frontOfficeRole: foRole, departmentCategories: [] }, query: {}, body: {}, params: { id: "1", aid: "10" } };
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
```

- [ ] **Step 2: 테스트 실행 → HR 신규 케이스 fail 확인**

```bash
cd /Users/juno/work/football/apps/api && pnpm jest __test__/payroll/allowance.access.test.ts 2>&1 | tail -15
```

Expected: HR_STAFF list, HR_MANAGER create/update/remove 케이스 fail.

- [ ] **Step 3: `allowance.controller.ts` 를 payroll helper 로 교체**

`apps/api/src/payroll/allowance/allowance.controller.ts` 를 다음으로 교체:

```typescript
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../../lib/appError";
import { canReadPayroll, canWritePayroll } from "../../lib/permissions";
import { requireUser } from "../../lib/authMiddleware";
import type { AllowanceService } from "./allowance.service";
import type { CreateAllowanceDto, UpdateAllowanceDto } from "./dto/allowance.dto";

export class AllowanceController {
  constructor(private service: AllowanceService) {}

  list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canReadPayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(await this.service.list(Number(req.params["id"])));
    } catch (err) { next(err); }
  };

  create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.status(201).json(
        await this.service.create(Number(req.params["id"]), req.body as CreateAllowanceDto),
      );
    } catch (err) { next(err); }
  };

  update = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      res.json(
        await this.service.update(
          Number(req.params["id"]),
          Number(req.params["aid"]),
          req.body as UpdateAllowanceDto,
        ),
      );
    } catch (err) { next(err); }
  };

  remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, frontOfficeRole, departmentCategories } = requireUser(req);
      if (!canWritePayroll(role, frontOfficeRole, departmentCategories)) throw new AppError(403, "FORBIDDEN");
      await this.service.remove(Number(req.params["id"]), Number(req.params["aid"]));
      res.status(204).send();
    } catch (err) { next(err); }
  };
}
```

- [ ] **Step 4: 테스트 통과 + 기존 payroll 통합 회귀 확인**

```bash
cd /Users/juno/work/football/apps/api && pnpm jest __test__/payroll/ __test__/lib/permissions.payroll.test.ts 2>&1 | tail -15
```

Expected: 신규 access-guard 테스트 전부 통과 + 기존 config.service/salary.service/allowance.service/run.service 회귀 없음.

- [ ] **Step 5: 커밋**

```bash
git -C /Users/juno/work/football add \
  apps/api/src/payroll/allowance/allowance.controller.ts \
  apps/api/__test__/payroll/allowance.access.test.ts
git -C /Users/juno/work/football commit -m "refactor(payroll): allowance.controller 를 canReadPayroll/canWritePayroll 로 통일 (#565)

allowance.list 는 canReadFinance → canReadPayroll (HR 도 조회).
allowance.create/update/remove 는 canWriteFinance → canWritePayroll.

HR 이 급여 계산 시 수당 근거 조회·반영 실무 담당.

10 allowance.access unit tests 통과.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: k6 role-boundary-probe 재실행 → LEAK 소멸 확인

**Files:**
- Modify: `loadtest/results-2026-09-29/role-boundary/probe.json` (덮어쓰기)

- [ ] **Step 1: API 서버 restart 확인**

`ts-node-dev` 로 자동 재로드 되므로 확인만.

```bash
lsof -i :3001 -sTCP:LISTEN -t | head -1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/countries -b /tmp/a.txt
```

Expected: PID 존재 + 200 (또는 로그인 필요 시 401).

- [ ] **Step 2: 수동 curl 로 config.list 차단 확인**

```bash
# PLAYER 로그인
curl -c /tmp/pcookie.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"player@club.com","password":"Password1!"}' > /dev/null

# 급여 설정 조회 → 403 예상
curl -b /tmp/pcookie.txt http://localhost:3001/api/payroll/configs -w "\nHTTP %{http_code}\n"
```

Expected: `{"code":"FORBIDDEN"}\nHTTP 403`

- [ ] **Step 3: k6 role-boundary-probe 재실행**

```bash
cd /Users/juno/work/football && \
  BASE_URL=http://localhost:3001/api SCENARIO=probe \
  k6 run loadtest/role-boundary-probe.k6.js \
  --summary-export loadtest/results-2026-09-29/role-boundary/probe.json --quiet 2>&1 | tail -15
```

Expected: `boundary_leaks .............: 0` (이전 7 → 0).

- [ ] **Step 4: probe 결과 커밋 (LEAK 소멸 근거)**

```bash
git -C /Users/juno/work/football add loadtest/results-2026-09-29/role-boundary/probe.json
git -C /Users/juno/work/football commit -m "loadtest: role-boundary-probe 재실행 결과 — boundary_leaks 0 (#565 파치 검증)

이전: 7 LEAK (/payroll/configs)
이후: 0 LEAK — canReadPayroll guard 도입 후 전 role 매트릭스 검증 통과.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: TESTTODO 갱신 + PR 오픈

**Files:**
- Modify: `loadtest/results-2026-09-27/TESTTODO.md` (Section 13 payroll 항목 ✅ FIXED)

- [ ] **Step 1: TESTTODO Section 13 갱신**

`loadtest/results-2026-09-27/TESTTODO.md` 의 payroll security 라인 (약 line 181, "🚨 **CRITICAL LEAK**") 을 편집:

```markdown
| 보안 — 재무팀장 · GM · 구단 관리자만 · 나머지 401/403 | ✅ **FIXED** (PR #<개설된-PR-번호>) — `canReadPayroll` / `canWritePayroll` helper 도입. `role-boundary-probe.k6.js` 재실행 `boundary_leaks=0` 확인. HR 도 canReadPayroll 로 포함 (실무: 급여 계산·4대보험·원천세) |
```

PR 번호는 다음 단계에서 얻은 뒤 채운다.

- [ ] **Step 2: 브랜치 push**

```bash
git -C /Users/juno/work/football push -u origin fix/fianance-payroll-access 2>&1 | tail -3
```

Expected: 신규 브랜치 origin 에 등록.

- [ ] **Step 3: PR 오픈**

```bash
gh pr create --title "fix(payroll): /payroll/configs role guard 파치 + canReadPayroll/canWritePayroll helper 도입 (#565)" --body "$(cat <<'EOF'
Closes #565 (CRITICAL LEAK).

## 문제
role-boundary-probe.k6.js 실측 → \`GET /payroll/configs\` 를 HR/ASSET/COACH/PLAYER/MEDICAL/TD/FACILITY **7 role 전부 200** 조회 가능. \`config.controller.ts:11-15\` \`list\` handler 가 auth 만 있고 role guard 없음.

## 해결
\`lib/permissions.ts\` 에 payroll 도메인 전용 helper 도입:
- \`canReadPayroll = canReadFinance || canReadHR\`
- \`canWritePayroll = canWriteFinance || canWriteHR\`

payroll 도메인 3 sub-controller (config/salary/allowance) 의 11 handler 를 helper 로 통일.
\`run\` 은 이미 \`canWriteFinance OR canWriteHR\` 패턴이라 변경 없음.

## 도메인 정책 (한국 실무)
- **HR**: 급여명세 작성, 4대보험 신고, 원천세 신고, 연말정산
- **Finance**: 급여 예산 확정, 지급 승인
- **ADMIN/GM**: 급여 체계 정책 결정

## 변경 매트릭스

| Handler | 이전 | 이후 |
|---|---|---|
| \`config.list\` | 🚨 없음 | \`canReadPayroll\` |
| \`config.create/update\` | canWriteFinance | \`canWritePayroll\` |
| \`salary.list/get\` | canReadFinance | \`canReadPayroll\` |
| \`salary.create/update\` | canWriteFinance | \`canWritePayroll\` |
| \`allowance.list\` | canReadFinance | \`canReadPayroll\` |
| \`allowance.create/update/remove\` | canWriteFinance | \`canWritePayroll\` |
| \`run.*\` | (기존 유지) | 변경 없음 |

## 검증
- Unit tests 신규 4 파일 (permissions.payroll + config/salary/allowance access-guard) — 총 43 tests 통과
- k6 role-boundary-probe 재실행: \`boundary_leaks=0\` (이전 7 → 0)
- 수동 curl: PLAYER → \`/payroll/configs\` → **403** (이전 200)

## 스펙
\`docs/superpowers/specs/2026-09-29-payroll-role-guard-design.md\`

## 후방 호환성
- DB migration 없음
- API 계약 변경 없음 (기존 통과 role 은 그대로 통과, HR 만 추가 허용)
- FE breaking change 없음

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL 반환. PR 번호를 다음 Step 4 에 채운다.

- [ ] **Step 4: TESTTODO 의 PR 번호 채우기 + push**

Step 1 에서 편집한 `loadtest/results-2026-09-27/TESTTODO.md` 의 `PR #<개설된-PR-번호>` 부분에 Step 3 에서 얻은 실제 PR 번호 삽입 후 커밋.

```bash
# <PR#> 를 실제 번호로 교체 (예: 569)
PR_NUM=<실제-PR-번호>
sed -i.bak "s/PR #<개설된-PR-번호>/PR #$PR_NUM/" /Users/juno/work/football/loadtest/results-2026-09-27/TESTTODO.md
rm /Users/juno/work/football/loadtest/results-2026-09-27/TESTTODO.md.bak

git -C /Users/juno/work/football add loadtest/results-2026-09-27/TESTTODO.md
git -C /Users/juno/work/football commit -m "docs(testtodo): Section 13 payroll LEAK ✅ FIXED — PR #$PR_NUM"
git -C /Users/juno/work/football push
```

Expected: TESTTODO Section 13 payroll 항목이 ✅ FIXED + PR 링크로 표기됨.

---

## Self-Review

### 1. Spec Coverage

| Spec 요구사항 | 매핑 태스크 |
|---|---|
| Helper 2개 (`canReadPayroll`, `canWritePayroll`) 도입 | Task 1 |
| `config.list` LEAK 파치 | Task 2 (CRITICAL) |
| `config.create/update` 확장 | Task 2 |
| `salary.list/get/create/update` 통일 | Task 3 |
| `allowance.list/create/update/remove` 통일 | Task 4 |
| 회귀 테스트 매트릭스 | Task 1~4 (각 controller 별 access-guard.test.ts) |
| k6 재실행 → boundary_leaks=0 검증 | Task 5 |
| Audit log 별도 스코프 (변경 없음) | 명시적 skip |
| `run.controller` 이미 정합 (변경 없음) | 명시적 skip |
| DB migration 없음 | 스펙과 일치 |

**모든 스펙 요구사항 → 태스크 매핑 완료.**

### 2. Placeholder Scan
- ❌ "TBD" / "TODO" / "implement later" 없음
- ⚠️ Task 6 Step 4 에 `<개설된-PR-번호>` placeholder — 의도적 (Step 3 에서 얻어야 채울 수 있음). 명시적 sed 명령 포함.
- 모든 코드 블록 완전.

### 3. Type Consistency
- Helper signature 동일: `(role, foRole?, deptCategories?): boolean`
- Controller handler 인자 destructure 동일 패턴 (`role, frontOfficeRole, departmentCategories`)
- 함수명 `canReadPayroll` / `canWritePayroll` 스펙과 일치.

**이슈 없음.**

---

## Plan Complete

`docs/superpowers/plans/2026-09-29-payroll-role-guard.md` 저장 예정.

**총 6 tasks · 각 3-5 steps · 예상 30-45분 (테스트 러닝 포함).**
