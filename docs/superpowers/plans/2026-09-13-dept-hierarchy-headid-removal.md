# Department Hierarchy — headId 제거 및 UserDepartment 권한 재설계

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Department.headId` FK를 제거하고 `UserDepartment.role = DEPT_HEAD|LEADER`를 source of truth로 전환한다.

**Architecture:** 3단계 PR. Phase 1(데이터 채우기) → Phase 2(코드 교체) → Phase 3(컬럼 DROP). 각 Phase는 독립 커밋/PR. Phase 1 후 롤백 가능.

**Tech Stack:** Prisma, TypeScript, Express, PostgreSQL, Jest

---

## 확정된 설계 결정

- `DEPT_HEAD`: `parentId = null`인 최상위 부서에만, 부서당 1명 (app-level 강제)
- `LEADER`: `parentId != null`인 하위 팀에만, 팀당 1명 (app-level 강제)
- `setHead(deptId, newUserId|null, actor)`: DEPT_HEAD/LEADER 전용 진입점. 자동으로 역할 결정, 전임 → MEMBER 강등
- `addMember` / `updateMemberRole`: DEPT_HEAD/LEADER 변경 차단 → `USE_SET_HEAD` 에러
- `INTERN`: 어느 레벨에나 가능
- `canWriteHR` override: LEADER 관리에 HR팀 권한 유지
- 마이그레이션 충돌: `headId` 기준 강제 수정 + `RAISE NOTICE` 로그

---

## 파일 맵

| 파일 | Phase | 변경 내용 |
|------|-------|-----------|
| `api/prisma/scripts/migrate_dept_heads.ts` | 1 | 신규 — headId → UserDepartment 변환 스크립트 |
| `api/src/department/department.repo.ts` | 2 | `isHead()`, `findHead()`, `setHead()` 추가, `updateHead()` 제거 |
| `api/src/department/department.service.ts` | 2 | 전체 권한 체크 재작성, `setHead()` 추가 |
| `api/src/department/department.controller.ts` | 2 | `updateHead` → `setHead` 교체 |
| `api/src/department/department.routes.ts` | 2 | 핸들러 교체 |
| `api/src/onboarding-template/onboarding-template.controller.ts` | 2 | `headId` 직접 쿼리 → `isHead()` |
| `football/src/services/department.service.ts` | 2 | `updateHead` → `setHead`, body `newHeadId` → `newUserId` |
| `api/__test__/department/team-member-crud.test.ts` | 2 | 기존 테스트 수정 |
| `api/__test__/department/set-head.test.ts` | 2 | 신규 — setHead 전용 테스트 |
| `api/prisma/schema.prisma` | 3 | `headId`, `head` 관계 제거 |
| `api/prisma/migrations/.../migration.sql` | 3 | DROP COLUMN |

---

## Phase 1 — 데이터 마이그레이션

### Task 1: headId → UserDepartment 변환 스크립트

**Files:**
- Create: `api/prisma/scripts/migrate_dept_heads.ts`

- [ ] **Step 1: 스크립트 작성**

```typescript
// api/prisma/scripts/migrate_dept_heads.ts
import { PrismaClient } from "../src/generated/client";

const prisma = new PrismaClient();

async function main() {
  const depts = await prisma.department.findMany({
    where: { headId: { not: null } },
    select: { id: true, headId: true, parentId: true, name: true },
  });

  console.log(`Migrating ${depts.length} departments with headId...`);
  let inserted = 0, updated = 0, conflicts = 0;

  for (const dept of depts) {
    const targetRole = dept.parentId === null ? "DEPT_HEAD" : "LEADER";
    const existing = await prisma.userDepartment.findUnique({
      where: { userId_departmentId: { userId: dept.headId!, departmentId: dept.id } },
    });

    if (!existing) {
      await prisma.userDepartment.create({
        data: { userId: dept.headId!, departmentId: dept.id, role: targetRole },
      });
      inserted++;
    } else if (existing.role === targetRole) {
      // no-op
    } else {
      console.warn(
        `CONFLICT dept=${dept.id}(${dept.name}) user=${dept.headId} ` +
        `existing=${existing.role} → overwriting with ${targetRole}`
      );
      await prisma.userDepartment.update({
        where: { userId_departmentId: { userId: dept.headId!, departmentId: dept.id } },
        data: { role: targetRole },
      });
      updated++;
      conflicts++;
    }
  }

  console.log(`Done. inserted=${inserted} updated=${updated} conflicts=${conflicts}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: 스크립트 실행**

```bash
cd apps/api
npx ts-node prisma/scripts/migrate_dept_heads.ts
```

Expected output:
```
Migrating N departments with headId...
Done. inserted=X updated=Y conflicts=Z
```

CONFLICT 줄이 있으면 내용 확인 후 계속.

- [ ] **Step 3: 검증 쿼리**

```bash
npx prisma db execute --stdin <<'SQL'
SELECT d.id, d.name, d."headId", ud.role, ud."userId"
FROM "Department" d
LEFT JOIN "UserDepartment" ud ON ud."departmentId" = d.id
  AND ud."userId" = d."headId"
  AND ud.role IN ('DEPT_HEAD', 'LEADER')
WHERE d."headId" IS NOT NULL
  AND ud."userId" IS NULL;
SQL
```

Expected: 0 rows (모든 headId가 UserDepartment 레코드로 변환됨).

- [ ] **Step 4: 커밋**

```bash
git add api/prisma/scripts/migrate_dept_heads.ts
git commit -m "chore: headId → UserDepartment 데이터 마이그레이션 스크립트"
```

---

## Phase 2 — 코드 교체

### Task 2: Repo — isHead / findHead / setHead 추가

**Files:**
- Modify: `api/src/department/department.repo.ts`
- Test: `api/__test__/department/set-head.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```typescript
// api/__test__/department/set-head.test.ts
import { describe, test, jest, expect, beforeEach } from "@jest/globals";

jest.mock("../../src/lib/auditLog", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

import { DepartmentService } from "../../src/department/department.service";

const ADMIN_ID = 1;
const DEPT_HEAD_USER_ID = 10;
const MEMBER_ID = 20;
const DEPT_ID = 100;
const TEAM_ID = 200;
const PARENT_DEPT_ID = 50;

const fakeTopDept = { id: DEPT_ID, name: "자산관리", parentId: null, isActive: true, children: [], parent: null };
const fakeSubDept = { id: TEAM_ID, name: "HR팀", parentId: PARENT_DEPT_ID, isActive: true, children: [], parent: null };
const fakeParentDept = { id: PARENT_DEPT_ID, name: "자산관리", parentId: null, isActive: true, children: [], parent: null };

const fakeHeadMembership = { userId: DEPT_HEAD_USER_ID, departmentId: DEPT_ID, role: "DEPT_HEAD" as const, joinedAt: new Date() };
const fakeMemberMembership = { userId: MEMBER_ID, departmentId: DEPT_ID, role: "MEMBER" as const, joinedAt: new Date() };

const makeRepo = (overrides: Record<string, jest.Mock> = {}) => ({
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(fakeTopDept),
  findDescendantIds: jest.fn().mockResolvedValue([DEPT_ID]),
  findMembers: jest.fn().mockResolvedValue([]),
  findMember: jest.fn().mockResolvedValue(fakeMemberMembership),
  findHead: jest.fn().mockResolvedValue(fakeHeadMembership),
  isHead: jest.fn().mockResolvedValue(false),
  findUserById: jest.fn().mockResolvedValue({ id: MEMBER_ID }),
  addMember: jest.fn(),
  updateMemberRole: jest.fn(),
  removeMember: jest.fn(),
  transferMember: jest.fn(),
  countUserDepartments: jest.fn().mockResolvedValue(2),
  setHead: jest.fn().mockResolvedValue(undefined),
  ...overrides,
} as any);

describe("setHead", () => {
  beforeEach(() => jest.clearAllMocks());

  test("최상위 부서 — admin이 MEMBER를 DEPT_HEAD로 설정", async () => {
    const repo = makeRepo({ findMember: jest.fn().mockResolvedValue(fakeMemberMembership) });
    const svc = new DepartmentService(repo);
    const result = await svc.setHead(DEPT_ID, MEMBER_ID, { id: ADMIN_ID, role: "ADMIN" });
    expect(result).toEqual({ ok: true });
    expect(repo.setHead).toHaveBeenCalledWith(DEPT_ID, MEMBER_ID, "DEPT_HEAD");
  });

  test("신임이 비멤버 → 400 NOT_MEMBER", async () => {
    const repo = makeRepo({ findMember: jest.fn().mockResolvedValue(null) });
    const svc = new DepartmentService(repo);
    await expect(
      svc.setHead(DEPT_ID, MEMBER_ID, { id: ADMIN_ID, role: "ADMIN" })
    ).rejects.toMatchObject({ statusCode: 400, code: "NOT_MEMBER" });
  });

  test("자기 자신 임명 → 403 SELF_HEAD_APPOINTMENT_FORBIDDEN", async () => {
    const repo = makeRepo();
    const svc = new DepartmentService(repo);
    await expect(
      svc.setHead(DEPT_ID, ADMIN_ID, { id: ADMIN_ID, role: "ADMIN" })
    ).rejects.toMatchObject({ statusCode: 403, code: "SELF_HEAD_APPOINTMENT_FORBIDDEN" });
  });

  test("최상위 부서 — 비 admin → 403 FORBIDDEN", async () => {
    const repo = makeRepo();
    const svc = new DepartmentService(repo);
    await expect(
      svc.setHead(DEPT_ID, MEMBER_ID, { id: MEMBER_ID, role: "FRONT_OFFICE" })
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  test("하위 팀 — 상위 부서장이 LEADER 설정 가능", async () => {
    const repo = makeRepo({
      findById: jest.fn()
        .mockResolvedValueOnce(fakeSubDept)
        .mockResolvedValueOnce(fakeParentDept),
      findHead: jest.fn().mockResolvedValue({ userId: ADMIN_ID, role: "DEPT_HEAD" }),
      findMember: jest.fn().mockResolvedValue(fakeMemberMembership),
    });
    const svc = new DepartmentService(repo);
    const result = await svc.setHead(TEAM_ID, MEMBER_ID, { id: ADMIN_ID, role: "FRONT_OFFICE" });
    expect(result).toEqual({ ok: true });
    expect(repo.setHead).toHaveBeenCalledWith(TEAM_ID, MEMBER_ID, "LEADER");
  });

  test("null 전달 시 기존 head 강등만", async () => {
    const repo = makeRepo();
    const svc = new DepartmentService(repo);
    const result = await svc.setHead(DEPT_ID, null, { id: ADMIN_ID, role: "ADMIN" });
    expect(result).toEqual({ ok: true });
    expect(repo.setHead).toHaveBeenCalledWith(DEPT_ID, null, "DEPT_HEAD");
  });

  test("부서 없으면 404", async () => {
    const repo = makeRepo({ findById: jest.fn().mockResolvedValue(null) });
    const svc = new DepartmentService(repo);
    await expect(
      svc.setHead(DEPT_ID, MEMBER_ID, { id: ADMIN_ID, role: "ADMIN" })
    ).rejects.toMatchObject({ statusCode: 404, code: "DEPARTMENT_NOT_FOUND" });
  });
});

describe("addMember — DEPT_HEAD/LEADER 차단", () => {
  test("DEPT_HEAD 추가 시도 → 400 USE_SET_HEAD", async () => {
    const repo = makeRepo();
    const svc = new DepartmentService(repo);
    await expect(
      svc.addMember(DEPT_ID, MEMBER_ID, "DEPT_HEAD", { id: ADMIN_ID, role: "ADMIN" })
    ).rejects.toMatchObject({ statusCode: 400, code: "USE_SET_HEAD" });
  });

  test("LEADER 추가 시도 → 400 USE_SET_HEAD", async () => {
    const repo = makeRepo();
    const svc = new DepartmentService(repo);
    await expect(
      svc.addMember(DEPT_ID, MEMBER_ID, "LEADER", { id: ADMIN_ID, role: "ADMIN" })
    ).rejects.toMatchObject({ statusCode: 400, code: "USE_SET_HEAD" });
  });
});

describe("updateMemberRole — DEPT_HEAD/LEADER 차단", () => {
  test("DEPT_HEAD로 변경 시도 → 400 USE_SET_HEAD", async () => {
    const repo = makeRepo({ findMember: jest.fn().mockResolvedValue(fakeMemberMembership) });
    const svc = new DepartmentService(repo);
    await expect(
      svc.updateMemberRole(DEPT_ID, MEMBER_ID, "DEPT_HEAD", { id: ADMIN_ID, role: "ADMIN" })
    ).rejects.toMatchObject({ statusCode: 400, code: "USE_SET_HEAD" });
  });

  test("LEADER로 변경 시도 → 400 USE_SET_HEAD", async () => {
    const repo = makeRepo({ findMember: jest.fn().mockResolvedValue(fakeMemberMembership) });
    const svc = new DepartmentService(repo);
    await expect(
      svc.updateMemberRole(DEPT_ID, MEMBER_ID, "LEADER", { id: ADMIN_ID, role: "ADMIN" })
    ).rejects.toMatchObject({ statusCode: 400, code: "USE_SET_HEAD" });
  });

  test("DEPT_HEAD에서 MEMBER로 변경 시도 → 400 USE_SET_HEAD", async () => {
    const repo = makeRepo({
      findMember: jest.fn().mockResolvedValue({ ...fakeMemberMembership, role: "DEPT_HEAD" }),
    });
    const svc = new DepartmentService(repo);
    await expect(
      svc.updateMemberRole(DEPT_ID, MEMBER_ID, "MEMBER", { id: ADMIN_ID, role: "ADMIN" })
    ).rejects.toMatchObject({ statusCode: 400, code: "USE_SET_HEAD" });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd apps/api && npx jest __test__/department/set-head.test.ts --no-coverage 2>&1 | tail -10
```

Expected: `setHead is not a function` 등 실패.

- [ ] **Step 3: repo에 isHead / findHead / setHead 추가**

`api/src/department/department.repo.ts` 의 `updateHead` 메서드를 교체:

```typescript
  isHead(deptId: number, userId: number): Promise<boolean> {
    return this.prisma.userDepartment.findFirst({
      where: { departmentId: deptId, userId, role: { in: ['DEPT_HEAD', 'LEADER'] } },
    }).then(m => m !== null);
  }

  findHead(deptId: number) {
    return this.prisma.userDepartment.findFirst({
      where: { departmentId: deptId, role: { in: ['DEPT_HEAD', 'LEADER'] } },
    });
  }

  async setHead(deptId: number, newUserId: number | null, targetRole: DeptRole): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.userDepartment.updateMany({
        where: { departmentId: deptId, role: targetRole },
        data: { role: 'MEMBER' },
      });
      if (newUserId !== null) {
        await tx.userDepartment.update({
          where: { userId_departmentId: { userId: newUserId, departmentId: deptId } },
          data: { role: targetRole },
        });
      }
    });
  }
```

- [ ] **Step 4: service에 setHead 추가 (permission + 위임)**

`api/src/department/department.service.ts` 에 다음을 추가:

```typescript
  async setHead(deptId: number, newUserId: number | null, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');

    const targetRole: DeptRole = dept.parentId === null ? 'DEPT_HEAD' : 'LEADER';

    if (targetRole === 'DEPT_HEAD') {
      this.assertCanManageDeptHead(actor);
    } else {
      const parent = dept.parentId ? await this.repo.findById(dept.parentId) : null;
      const parentHead = parent ? await this.repo.findHead(parent.id) : null;
      this.assertCanManageTeamLeader(actor, parentHead?.userId ?? null);
    }

    if (newUserId !== null) {
      if (newUserId === actor.id) throw new AppError(403, 'SELF_HEAD_APPOINTMENT_FORBIDDEN');
      const membership = await this.repo.findMember(deptId, newUserId);
      if (!membership) throw new AppError(400, 'NOT_MEMBER');
    }

    const oldHead = await this.repo.findHead(deptId);
    await this.repo.setHead(deptId, newUserId, targetRole);
    void writeAuditLog({
      actorId: actor.id,
      action: 'DEPARTMENT_HEAD_CHANGED',
      targetId: deptId,
      detail: { oldUserId: oldHead?.userId ?? null, newUserId, targetRole },
    }).catch(console.error);
    return { ok: true };
  }
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

```bash
cd apps/api && npx jest __test__/department/set-head.test.ts --no-coverage 2>&1 | tail -10
```

Expected: 전체 통과.

- [ ] **Step 6: 커밋**

```bash
git add api/src/department/department.repo.ts \
        api/src/department/department.service.ts \
        api/__test__/department/set-head.test.ts
git commit -m "feat: isHead/findHead/setHead 추가 — DEPT_HEAD·LEADER UserDepartment 기반 관리"
```

---

### Task 3: Service — headId 참조 제거 (권한 체크 재작성)

**Files:**
- Modify: `api/src/department/department.service.ts`

headId를 직접 참조하는 모든 권한 체크를 `isHead()` / `findHead()` 로 교체한다.

- [ ] **Step 1: assertLeaderOrAdmin 재작성**

현재:
```typescript
private async assertLeaderOrAdmin(deptId: number, actor: Actor) {
  if (isAdminLike(actor.role)) return;
  const dept = await this.repo.findById(deptId);
  if (!dept) throw new AppError(404, "DEPARTMENT_NOT_FOUND");
  if (dept.headId !== actor.id) throw new AppError(403, "NOT_LEADER");
}
```

교체:
```typescript
private async assertLeaderOrAdmin(deptId: number, actor: Actor) {
  if (isAdminLike(actor.role)) return;
  if (await this.repo.isHead(deptId, actor.id)) return;
  throw new AppError(403, 'NOT_LEADER');
}
```

- [ ] **Step 2: assertCanManageTeamLeader — 호출 부분 수정**

`addMember`, `removeMember`, `updateHead`(기존)에서 `parent?.headId`를 `findHead` 결과로 교체.

`addMember` 내 LEADER 분기:
```typescript
} else if (memberRole === 'LEADER') {
  const parent = dept.parentId ? await this.repo.findById(dept.parentId) : null;
  const parentHead = parent ? await this.repo.findHead(parent.id) : null;
  this.assertCanManageTeamLeader(actor, parentHead?.userId ?? null);
}
```

`removeMember` 내 LEADER 분기:
```typescript
} else if (membership?.role === 'LEADER') {
  const parent = dept.parentId ? await this.repo.findById(dept.parentId) : null;
  const parentHead = parent ? await this.repo.findHead(parent.id) : null;
  this.assertCanManageTeamLeader(actor, parentHead?.userId ?? null);
}
```

- [ ] **Step 3: listMembers 조상 탐색 재작성**

현재 `cursor.headId === actor.id` 부분:
```typescript
// 변경 전
if (cursor.headId === actor.id) return this.repo.findMembers(deptId);

// 변경 후
if (await this.repo.isHead(cursor.id, actor.id)) return this.repo.findMembers(deptId);
```

- [ ] **Step 4: assertCanPromoteIntern 재작성**

현재:
```typescript
private assertCanPromoteIntern(actor: Actor, deptHeadId: number | null | undefined) {
  if (isAdminLike(actor.role)) return;
  if (canWriteHR(...)) return;
  if (deptHeadId != null && deptHeadId === actor.id) return;
  throw new AppError(403, "FORBIDDEN");
}
```

`updateMemberRole`에서 INTERN→MEMBER 처리를 인라인으로 변경 (isHead 비동기 사용):
```typescript
if (existing.role === 'INTERN' && newRole === 'MEMBER') {
  const isHead = await this.repo.isHead(deptId, actor.id);
  if (!isAdminLike(actor.role) &&
      !canWriteHR(actor.role, actor.frontOfficeRole ?? null, actor.deptCategories) &&
      !isHead) {
    throw new AppError(403, 'FORBIDDEN');
  }
}
```

`assertCanPromoteIntern` private 메서드 삭제.

- [ ] **Step 5: addMember에서 DEPT_HEAD/LEADER 차단 추가**

`addMember` 맨 앞에 삽입:
```typescript
if (memberRole === 'DEPT_HEAD' || memberRole === 'LEADER') {
  throw new AppError(400, 'USE_SET_HEAD');
}
```

그리고 기존 DEPT_HEAD/LEADER 분기(`if (memberRole === 'DEPT_HEAD')` 블록) 제거.

- [ ] **Step 6: updateMemberRole에서 DEPT_HEAD/LEADER 차단 추가**

`updateMemberRole` 에서 `userId === actor.id` 체크 다음에 삽입:
```typescript
if (newRole === 'DEPT_HEAD' || newRole === 'LEADER') throw new AppError(400, 'USE_SET_HEAD');
```

`existing` 조회 후 추가:
```typescript
if (existing.role === 'DEPT_HEAD' || existing.role === 'LEADER') throw new AppError(400, 'USE_SET_HEAD');
```

기존 DEPT_HEAD/LEADER 분기 제거.

- [ ] **Step 7: 기존 테스트 수정**

`team-member-crud.test.ts`의 `makeRepo`에 `isHead`, `findHead`, `setHead` mock 추가:

```typescript
const makeRepo = (overrides: Record<string, jest.Mock> = {}) =>
  ({
    // ... 기존 필드들 ...
    isHead: jest.fn().mockResolvedValue(false),
    findHead: jest.fn().mockResolvedValue(null),
    setHead: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any);
```

`listMembers` 테스트의 "팀장(headId 일치)은 통과" 케이스 → `isHead` mock이 true 반환하도록:
```typescript
test("팀장(isHead 일치)은 통과", async () => {
  const repo = makeRepo({
    isHead: jest.fn().mockResolvedValue(true),
  });
  const svc = new DepartmentService(repo);
  await expect(svc.listMembers(DEPT_ID, { id: LEADER_ID, role: "FRONT_OFFICE" })).resolves.not.toThrow();
});
```

- [ ] **Step 8: 전체 테스트 실행**

```bash
cd apps/api && npx jest __test__/department/ --no-coverage 2>&1 | tail -15
```

Expected: 전부 통과.

- [ ] **Step 9: 커밋**

```bash
git add api/src/department/department.service.ts \
        api/__test__/department/team-member-crud.test.ts
git commit -m "refactor: headId 직접 참조 제거 — isHead/findHead 기반 권한 체크"
```

---

### Task 4: Controller — updateHead → setHead 교체

**Files:**
- Modify: `api/src/department/department.controller.ts`
- Modify: `api/src/department/department.routes.ts`

- [ ] **Step 1: controller에서 updateHead → setHead 교체**

`department.controller.ts` 의 `updateHead` 메서드를 교체:

```typescript
  setHead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const deptId = Number(req.params["deptId"]);
      const { newUserId } = req.body as { newUserId?: unknown };
      if (newUserId !== null && (typeof newUserId !== "number" || !Number.isInteger(newUserId))) {
        throw new AppError(400, "INVALID_BODY");
      }
      const actor = {
        id: user.id,
        role: user.role,
        frontOfficeRole: user.frontOfficeRole,
        deptCategories: user.departmentCategories,
      };
      res.json(await this.service.setHead(deptId, newUserId as number | null, actor));
    } catch (err) {
      next(err);
    }
  };
```

- [ ] **Step 2: routes 핸들러 교체**

`department.routes.ts` 의:
```typescript
router.patch("/:deptId/head", auth, controller.updateHead);
```
→
```typescript
router.patch("/:deptId/head", auth, controller.setHead);
```

- [ ] **Step 3: frontend department.service.ts 업데이트**

`football/src/services/department.service.ts` 의 `updateHead` → `setHead`:

```typescript
  setHead: (deptId: number, newUserId: number | null): Promise<void> =>
    api.patch(`/departments/${deptId}/head`, { newUserId }),
```

`Department` 타입에서 `headId` 필드를 제거하거나 optional로 변경 (Phase 3에서 완전 제거):
```typescript
export interface Department {
  id: number;
  name: string;
  parentId: number | null;
  headId?: number | null;  // deprecated — Phase 3에서 제거
  // ...
}
```

- [ ] **Step 4: DepartmentMembersPage.tsx에서 updateHead 호출 → setHead 교체**

`football/src/pages/department/DepartmentMembersPage.tsx` 에서 `departmentMemberApi.updateHead(...)` → `departmentMemberApi.setHead(...)`, `newHeadId` → `newUserId`.

기존:
```typescript
await departmentMemberApi.updateHead(deptId, newHeadId);
```
교체:
```typescript
await departmentMemberApi.setHead(deptId, newUserId);
```

- [ ] **Step 5: 커밋**

```bash
git add api/src/department/department.controller.ts \
        api/src/department/department.routes.ts \
        football/src/services/department.service.ts \
        football/src/pages/department/DepartmentMembersPage.tsx
git commit -m "feat: updateHead → setHead 엔드포인트 교체 및 프론트엔드 연동"
```

---

### Task 5: onboarding-template headId 참조 제거

**Files:**
- Modify: `api/src/onboarding-template/onboarding-template.controller.ts`

- [ ] **Step 1: assertWritePermission 재작성**

현재 (`api/src/onboarding-template/onboarding-template.controller.ts:81-94`):
```typescript
private async assertWritePermission(
  userId: number,
  role: string,
  foRole: string | null | undefined,
  departmentId: number,
): Promise<void> {
  if (canWriteHR(role, foRole)) return;
  const dept = await getPrisma().department.findUnique({
    where: { id: departmentId },
    select: { headId: true },
  });
  if (dept?.headId === userId) return;
  throw new AppError(403, "FORBIDDEN");
}
```

교체:
```typescript
private async assertWritePermission(
  userId: number,
  role: string,
  foRole: string | null | undefined,
  departmentId: number,
): Promise<void> {
  if (canWriteHR(role, foRole)) return;
  const membership = await getPrisma().userDepartment.findFirst({
    where: {
      departmentId,
      userId,
      role: { in: ['DEPT_HEAD', 'LEADER'] },
    },
  });
  if (membership) return;
  throw new AppError(403, "FORBIDDEN");
}
```

- [ ] **Step 2: 주석 업데이트**

`assertWritePermission` 위 JSDoc 수정:
```typescript
/**
 * Write permission gate. Two independent grants (any one is enough):
 *   1. Global HR write (canWriteHR — HR_MANAGER + admin-like).
 *   2. Department head: UserDepartment.role IN (DEPT_HEAD, LEADER).
 */
```

- [ ] **Step 3: 테스트 확인**

```bash
cd apps/api && npx jest --testPathPattern="onboarding" --no-coverage 2>&1 | tail -10
```

- [ ] **Step 4: 커밋**

```bash
git add api/src/onboarding-template/onboarding-template.controller.ts
git commit -m "fix: onboarding-template headId 직접 쿼리 → UserDepartment.isHead 방식으로 교체"
```

---

## Phase 3 — 스키마 정리

### Task 6: headId 컬럼 DROP

**Files:**
- Modify: `api/prisma/schema.prisma`

- [ ] **Step 1: schema.prisma에서 headId 및 head 관계 제거**

`Department` 모델에서 다음 두 줄 삭제:
```prisma
headId            Int?
head              User?     @relation("DepartmentHead", fields: [headId], references: [id], onDelete: SetNull)
```

`User` 모델에서 다음 줄 삭제:
```prisma
headedDepartments         Department[]    @relation("DepartmentHead")
```

- [ ] **Step 2: 마이그레이션 생성**

```bash
cd apps/api && npx prisma migrate dev --name drop_department_headid
```

Expected: 마이그레이션 파일 생성 + DB 적용.

- [ ] **Step 3: 마이그레이션 SQL 확인**

생성된 migration.sql에 다음이 포함되어야 함:
```sql
ALTER TABLE "Department" DROP COLUMN "headId";
```

- [ ] **Step 4: frontend Department 타입에서 headId 완전 제거**

`football/src/services/department.service.ts`:
```typescript
export interface Department {
  id: number;
  name: string;
  parentId: number | null;
  parent: Pick<Department, 'id' | 'name'> | null;
  children: Pick<Department, 'id' | 'name' | 'isActive'>[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 5: 전체 테스트 실행**

```bash
cd apps/api && npx jest --no-coverage 2>&1 | tail -15
```

Expected: 전부 통과.

- [ ] **Step 6: TypeScript 컴파일 확인**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -20
cd /Users/juno/work/football/football && npx tsc --noEmit 2>&1 | head -20
```

Expected: 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add api/prisma/schema.prisma \
        api/prisma/migrations/ \
        football/src/services/department.service.ts
git commit -m "feat: Department.headId 컬럼 DROP — UserDepartment 기반 설계 완결"
```

---

## 전체 테스트 체크리스트

Phase 2 완료 후 수동으로 검증할 시나리오:

| 시나리오 | 기대 결과 |
|---------|---------|
| ADMIN이 `setHead(deptId, userId)` 호출 (userId는 기존 멤버) | 성공, 전임 MEMBER 강등 |
| 비멤버 userId로 `setHead` 호출 | 400 NOT_MEMBER |
| 자기 자신 `setHead` 호출 | 403 SELF_HEAD_APPOINTMENT_FORBIDDEN |
| FRONT_OFFICE가 최상위 부서 `setHead` 호출 | 403 FORBIDDEN |
| 상위 부서 DEPT_HEAD가 하위 팀 `setHead` 호출 | 성공 |
| `addMember(deptId, userId, "DEPT_HEAD")` | 400 USE_SET_HEAD |
| `updateMemberRole(deptId, userId, "LEADER")` | 400 USE_SET_HEAD |
| DEPT_HEAD 멤버를 `updateMemberRole` → MEMBER | 400 USE_SET_HEAD |
| HR_MANAGER가 팀장(`setHead`) 설정 | 성공 (canWriteHR override) |
| 온보딩 템플릿 write: DEPT_HEAD가 요청 | 성공 |
| 온보딩 템플릿 write: 일반 MEMBER가 요청 | 403 FORBIDDEN |
