# Dept Job Title + MePage Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부서별 직급(DeptJobTitle) 기능 추가 및 MePage 팀 필드 null 처리 수정.

**Architecture:** `DeptJobTitle`은 `Department`에 종속된 soft-delete 모델. `UserDepartment`가 FK(`jobTitleId`)로 참조. 직급 편집은 `DepartmentMembersPage` 인라인 + 추가 다이얼로그. MePage는 `user.team === null`일 때 LEADER/DEPT_HEAD 부서명으로 대체.

**Tech Stack:** Prisma (PostgreSQL), Express, React, i18next, shadcn/ui

---

## File Map

| 파일 | 변경 내용 |
|------|----------|
| `apps/api/prisma/schema.prisma` | `DeptJobTitle` 모델 추가, `UserDepartment.jobTitleId` FK 추가 |
| `apps/api/src/department/department.repo.ts` | DeptJobTitle CRUD + member jobTitle update 메서드 추가 |
| `apps/api/src/department/department.service.ts` | DeptJobTitle 서비스 메서드 추가 |
| `apps/api/src/department/department.controller.ts` | DeptJobTitle 엔드포인트 + member jobTitle 엔드포인트 추가 |
| `apps/api/src/department/department.routes.ts` | 신규 라우트 추가 |
| `apps/api/src/auth/auth.repo.ts` | `findById` select에 `jobTitle` 포함 |
| `apps/api/__test__/department/department.service.test.ts` | DeptJobTitle 서비스 테스트 추가 |
| `apps/api/__test__/department/department.controller.test.ts` | DeptJobTitle 컨트롤러 테스트 추가 |
| `football/src/types/auth.ts` | `UserDto.departmentMemberships`에 `jobTitle` 추가 |
| `football/src/services/department.service.ts` | `DeptJobTitle` 타입 + API 추가, `Member` 타입에 `jobTitle` 추가 |
| `football/src/locales/en/common.json` | 직급 관련 i18n 키 추가 |
| `football/src/locales/ko/common.json` | 직급 관련 i18n 키 추가 |
| `football/src/pages/me/MePage.tsx` | 팀 필드 null 처리 + 부서 역할 번역 + jobTitle 표시 |
| `football/src/pages/department/DepartmentMembersPage.tsx` | 직급 인라인 편집 + 직급 관리 섹션 + 추가 다이얼로그 직급 필드 |

---

### Task 1: Prisma 스키마 — DeptJobTitle 모델 + UserDepartment.jobTitleId

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: DeptJobTitle 모델 추가 + UserDepartment 수정**

`model UserDepartment { ... }` 블록 바로 뒤에 추가, `UserDepartment`에 두 줄 추가:

```prisma
// apps/api/prisma/schema.prisma

// UserDepartment 모델에 추가 (@@id([userId, departmentId]) 위)
  jobTitleId   Int?
  jobTitle     DeptJobTitle? @relation(fields: [jobTitleId], references: [id])

// UserDepartment 모델 뒤에 새 모델 추가
model DeptJobTitle {
  id           Int              @id @default(autoincrement())
  departmentId Int
  label        String
  sortOrder    Int              @default(0)
  isActive     Boolean          @default(true)
  createdAt    DateTime         @default(now())
  department   Department       @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  members      UserDepartment[]
}
```

`Department` 모델에도 relation 추가:
```prisma
  jobTitles         DeptJobTitle[]
```

- [ ] **Step 2: 마이그레이션 실행**

```bash
cd apps/api
npx prisma migrate dev --name add-dept-job-title
npx prisma generate
```

예상 출력:
```
✔ Generated Prisma Client
```

- [ ] **Step 3: 커밋**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "chore: DeptJobTitle 모델 추가 및 UserDepartment.jobTitleId FK 추가"
```

---

### Task 2: Department Repo — DeptJobTitle CRUD + member jobTitle update

**Files:**
- Modify: `apps/api/src/department/department.repo.ts`

- [ ] **Step 1: DeptJobTitle CRUD 메서드 추가**

파일 끝(`}` 직전)에 추가:

```typescript
  // ── DeptJobTitle CRUD ──────────────────────────────────────

  findJobTitles(departmentId: number) {
    return this.prisma.deptJobTitle.findMany({
      where: { departmentId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createJobTitle(departmentId: number, label: string, sortOrder?: number) {
    return this.prisma.deptJobTitle.create({
      data: { departmentId, label, ...(sortOrder !== undefined && { sortOrder }) },
    });
  }

  findJobTitleById(id: number) {
    return this.prisma.deptJobTitle.findUnique({ where: { id } });
  }

  updateJobTitle(id: number, data: { label?: string; sortOrder?: number }) {
    return this.prisma.deptJobTitle.update({ where: { id }, data });
  }

  deactivateJobTitle(id: number) {
    return this.prisma.deptJobTitle.update({ where: { id }, data: { isActive: false } });
  }

  updateMemberJobTitle(deptId: number, userId: number, jobTitleId: number | null) {
    return this.prisma.userDepartment.update({
      where: { userId_departmentId: { userId, departmentId: deptId } },
      data: { jobTitleId },
    });
  }
```

또한 `findMembers` 쿼리에 `jobTitle` 포함:
```typescript
  async findMembers(deptId: number) {
    const ids = await this.findDescendantIds(deptId);
    return this.prisma.userDepartment.findMany({
      where: { departmentId: { in: ids } },
      select: {
        userId: true,
        departmentId: true,
        role: true,
        jobTitleId: true,
        joinedAt: true,
        user: { select: { id: true, username: true, nickname: true, email: true, role: true } },
        department: { select: { id: true, name: true } },
        jobTitle: { select: { id: true, label: true } },
      },
      orderBy: [{ departmentId: 'asc' }, { joinedAt: 'asc' }],
    });
  }
```

`addMember`에 `jobTitleId` 파라미터 추가:
```typescript
  addMember(deptId: number, userId: number, role: DeptRole, jobTitleId?: number | null, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.userDepartment.create({
      data: { departmentId: deptId, userId, role, ...(jobTitleId !== undefined && jobTitleId !== null && { jobTitleId }) },
    });
  }
```

- [ ] **Step 2: 컴파일 확인**

```bash
cd apps/api && npx tsc --noEmit
```

예상: 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add apps/api/src/department/department.repo.ts
git commit -m "feat: DepartmentRepository에 DeptJobTitle CRUD 및 member jobTitle update 추가"
```

---

### Task 3: Department Service — DeptJobTitle 서비스 메서드

**Files:**
- Modify: `apps/api/src/department/department.service.ts`

- [ ] **Step 1: DeptJobTitle 서비스 메서드 추가**

`updateHead` 메서드 뒤에 추가:

```typescript
  // ── DeptJobTitle ────────────────────────────────────────────

  async listJobTitles(deptId: number) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    return this.repo.findJobTitles(deptId);
  }

  async createJobTitle(deptId: number, label: string, sortOrder: number | undefined, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    if (typeof label !== 'string' || !label.trim()) throw new AppError(400, 'LABEL_REQUIRED');
    if (!isAdminLike(actor.role) && dept.headId !== actor.id) throw new AppError(403, 'FORBIDDEN');
    return this.repo.createJobTitle(deptId, label.trim(), sortOrder);
  }

  async updateJobTitle(deptId: number, titleId: number, data: { label?: string; sortOrder?: number }, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    if (!isAdminLike(actor.role) && dept.headId !== actor.id) throw new AppError(403, 'FORBIDDEN');
    const title = await this.repo.findJobTitleById(titleId);
    if (!title || title.departmentId !== deptId) throw new AppError(404, 'JOB_TITLE_NOT_FOUND');
    if (data.label !== undefined && (typeof data.label !== 'string' || !data.label.trim())) {
      throw new AppError(400, 'LABEL_REQUIRED');
    }
    return this.repo.updateJobTitle(titleId, {
      ...(data.label !== undefined && { label: data.label.trim() }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
    });
  }

  async deleteJobTitle(deptId: number, titleId: number, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    if (!isAdminLike(actor.role) && dept.headId !== actor.id) throw new AppError(403, 'FORBIDDEN');
    const title = await this.repo.findJobTitleById(titleId);
    if (!title || title.departmentId !== deptId) throw new AppError(404, 'JOB_TITLE_NOT_FOUND');
    await this.repo.deactivateJobTitle(titleId);
    return { ok: true };
  }

  async updateMemberJobTitle(deptId: number, userId: number, jobTitleId: number | null, actor: Actor) {
    const dept = await this.repo.findById(deptId);
    if (!dept) throw new AppError(404, 'DEPARTMENT_NOT_FOUND');
    if (!isAdminLike(actor.role) && dept.headId !== actor.id) throw new AppError(403, 'FORBIDDEN');
    const member = await this.repo.findMember(deptId, userId);
    if (!member) throw new AppError(404, 'NOT_MEMBER');
    if (jobTitleId !== null) {
      const title = await this.repo.findJobTitleById(jobTitleId);
      if (!title || title.departmentId !== deptId || !title.isActive) throw new AppError(400, 'JOB_TITLE_NOT_FOUND');
    }
    await this.repo.updateMemberJobTitle(deptId, userId, jobTitleId);
    return { ok: true };
  }
```

`addMember`에 `jobTitleId` 파라미터 전달:
```typescript
  async addMember(deptId: number, userId: number, memberRole: DeptRole, actor: Actor, jobTitleId?: number | null) {
    // ... 기존 코드 유지 ...
    await this.repo.addMember(deptId, userId, memberRole, jobTitleId ?? null);
    // ...
  }
```

- [ ] **Step 2: 컴파일 확인**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 3: 커밋**

```bash
git add apps/api/src/department/department.service.ts
git commit -m "feat: DepartmentService에 DeptJobTitle 및 updateMemberJobTitle 메서드 추가"
```

---

### Task 4: Department Controller + Routes — DeptJobTitle 엔드포인트

**Files:**
- Modify: `apps/api/src/department/department.controller.ts`
- Modify: `apps/api/src/department/department.routes.ts`

- [ ] **Step 1: 컨트롤러 메서드 추가**

`updateHead` 메서드 뒤에 추가:

```typescript
  // ── DeptJobTitle ────────────────────────────────────────────

  listJobTitles = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireUser(req);
      res.json(await this.service.listJobTitles(Number(req.params['deptId'])));
    } catch (err) { next(err); }
  };

  createJobTitle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { label, sortOrder } = req.body as { label?: unknown; sortOrder?: unknown };
      if (typeof label !== 'string') throw new AppError(400, 'LABEL_REQUIRED');
      const actor = { id: user.id, role: user.role, frontOfficeRole: user.frontOfficeRole, deptCategories: user.departmentCategories };
      res.status(201).json(
        await this.service.createJobTitle(
          Number(req.params['deptId']),
          label,
          typeof sortOrder === 'number' ? sortOrder : undefined,
          actor,
        )
      );
    } catch (err) { next(err); }
  };

  updateJobTitle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const data = req.body as { label?: string; sortOrder?: number };
      const actor = { id: user.id, role: user.role, frontOfficeRole: user.frontOfficeRole, deptCategories: user.departmentCategories };
      res.json(
        await this.service.updateJobTitle(Number(req.params['deptId']), Number(req.params['titleId']), data, actor)
      );
    } catch (err) { next(err); }
  };

  deleteJobTitle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const actor = { id: user.id, role: user.role, frontOfficeRole: user.frontOfficeRole, deptCategories: user.departmentCategories };
      await this.service.deleteJobTitle(Number(req.params['deptId']), Number(req.params['titleId']), actor);
      res.status(204).send();
    } catch (err) { next(err); }
  };

  updateMemberJobTitle = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const { jobTitleId } = req.body as { jobTitleId?: unknown };
      const resolved = jobTitleId === null ? null : (typeof jobTitleId === 'number' ? jobTitleId : null);
      const actor = { id: user.id, role: user.role, frontOfficeRole: user.frontOfficeRole, deptCategories: user.departmentCategories };
      res.json(
        await this.service.updateMemberJobTitle(Number(req.params['deptId']), Number(req.params['userId']), resolved, actor)
      );
    } catch (err) { next(err); }
  };
```

`addMember` 컨트롤러에 `jobTitleId` 파싱 추가:
```typescript
  addMember = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const deptId = Number(req.params['deptId']);
      const { userId, role: memberRole, jobTitleId } = req.body as { userId?: unknown; role?: unknown; jobTitleId?: unknown };
      if (typeof userId !== 'number' || !Number.isInteger(userId)) throw new AppError(400, 'INVALID_BODY');
      const resolvedRole: DeptRole = (typeof memberRole === 'string' && memberRole in DeptRole)
        ? (memberRole as DeptRole)
        : DeptRole.MEMBER;
      const resolvedJobTitleId = typeof jobTitleId === 'number' ? jobTitleId : null;
      const actor = { id: user.id, role: user.role, frontOfficeRole: user.frontOfficeRole, deptCategories: user.departmentCategories };
      res.status(201).json(await this.service.addMember(deptId, userId, resolvedRole, actor, resolvedJobTitleId));
    } catch (err) { next(err); }
  };
```

- [ ] **Step 2: 라우트 추가**

`apps/api/src/department/department.routes.ts`에 추가:
```typescript
router.get('/:deptId/job-titles', auth, controller.listJobTitles);
router.post('/:deptId/job-titles', auth, controller.createJobTitle);
router.patch('/:deptId/job-titles/:titleId', auth, controller.updateJobTitle);
router.delete('/:deptId/job-titles/:titleId', auth, controller.deleteJobTitle);
router.patch('/:deptId/members/:userId/job-title', auth, controller.updateMemberJobTitle);
```

- [ ] **Step 3: 컴파일 확인**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 4: 커밋**

```bash
git add apps/api/src/department/department.controller.ts apps/api/src/department/department.routes.ts
git commit -m "feat: DeptJobTitle 및 member jobTitle PATCH 엔드포인트 추가"
```

---

### Task 5: Auth Repo — departmentMemberships에 jobTitle 포함

**Files:**
- Modify: `apps/api/src/auth/auth.repo.ts`

- [ ] **Step 1: findById select 수정**

`auth.repo.ts:96-100` 영역 수정:

```typescript
        departmentMemberships: {
          select: {
            role: true,
            department: { select: { id: true, name: true } },
            jobTitle: { select: { id: true, label: true } },
          },
        },
```

- [ ] **Step 2: 컴파일 + 테스트**

```bash
cd apps/api && npx tsc --noEmit && npx jest --testPathPattern="department"
```

- [ ] **Step 3: 커밋**

```bash
git add apps/api/src/auth/auth.repo.ts
git commit -m "feat: /me 응답 departmentMemberships에 jobTitle 포함"
```

---

### Task 6: 테스트 — DeptJobTitle 서비스 + 컨트롤러

**Files:**
- Modify: `apps/api/__test__/department/department.service.test.ts`
- Modify: `apps/api/__test__/department/department.controller.test.ts`

- [ ] **Step 1: 서비스 테스트 추가**

`department.service.test.ts`의 `mockRepo`에 메서드 추가:
```typescript
const mockRepo = {
  // ... 기존 ...
  findJobTitles: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
  createJobTitle: jest.fn(),
  findJobTitleById: jest.fn().mockResolvedValue(null),
  updateJobTitle: jest.fn(),
  deactivateJobTitle: jest.fn().mockResolvedValue(undefined),
  updateMemberJobTitle: jest.fn().mockResolvedValue(undefined),
} as any;
```

테스트 케이스 추가:
```typescript
describe("DeptJobTitle", () => {
  const adminActor = { id: 1, role: 'ADMIN' };
  const leaderActor = { id: 99, role: 'FRONT_OFFICE' };

  test("listJobTitles: 부서 없으면 404", async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(service.listJobTitles(99)).rejects.toMatchObject({ statusCode: 404 });
  });

  test("listJobTitles: 정상 반환", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: 99 });
    mockRepo.findJobTitles.mockResolvedValue([{ id: 1, label: "과장" }]);
    const result = await service.listJobTitles(1);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("과장");
  });

  test("createJobTitle: headId가 아닌 actor면 403", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: 10 });
    await expect(service.createJobTitle(1, "과장", undefined, leaderActor))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  test("createJobTitle: admin이면 정상 생성", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: 10 });
    mockRepo.createJobTitle.mockResolvedValue({ id: 1, label: "과장" });
    const result = await service.createJobTitle(1, "과장", undefined, adminActor);
    expect(mockRepo.createJobTitle).toHaveBeenCalledWith(1, "과장", undefined);
    expect(result.label).toBe("과장");
  });

  test("deleteJobTitle: soft delete 실행", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: 1 });
    mockRepo.findJobTitleById.mockResolvedValue({ id: 5, departmentId: 1, isActive: true });
    await service.deleteJobTitle(1, 5, adminActor);
    expect(mockRepo.deactivateJobTitle).toHaveBeenCalledWith(5);
  });

  test("updateMemberJobTitle: 부재 직급이면 400", async () => {
    mockRepo.findById.mockResolvedValue({ id: 1, name: "기획팀", headId: 1 });
    mockRepo.findMember.mockResolvedValue({ userId: 2, departmentId: 1, role: 'MEMBER' });
    mockRepo.findJobTitleById.mockResolvedValue(null);
    await expect(service.updateMemberJobTitle(1, 2, 999, adminActor))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
cd apps/api && npx jest --testPathPattern="department.service"
```

예상: 모든 테스트 PASS

- [ ] **Step 3: 컨트롤러 테스트 추가**

`department.controller.test.ts` 파일의 기존 mock 패턴을 확인하고 DeptJobTitle 관련 케이스 추가:

```typescript
// 기존 mockService에 추가
mockService.listJobTitles = jest.fn().mockResolvedValue([]);
mockService.createJobTitle = jest.fn().mockResolvedValue({ id: 1, label: '과장' });
mockService.deleteJobTitle = jest.fn().mockResolvedValue({ ok: true });
mockService.updateMemberJobTitle = jest.fn().mockResolvedValue({ ok: true });

// 테스트 케이스
test("GET /:deptId/job-titles → 200", async () => {
  const res = await request(app)
    .get('/departments/1/job-titles')
    .set('Authorization', 'Bearer <adminToken>');
  expect(res.status).toBe(200);
});

test("POST /:deptId/job-titles → 201", async () => {
  const res = await request(app)
    .post('/departments/1/job-titles')
    .set('Authorization', 'Bearer <adminToken>')
    .send({ label: '과장' });
  expect(res.status).toBe(201);
  expect(res.body.label).toBe('과장');
});

test("DELETE /:deptId/job-titles/:titleId → 204", async () => {
  const res = await request(app)
    .delete('/departments/1/job-titles/5')
    .set('Authorization', 'Bearer <adminToken>');
  expect(res.status).toBe(204);
});

test("PATCH /:deptId/members/:userId/job-title → 200", async () => {
  const res = await request(app)
    .patch('/departments/1/members/2/job-title')
    .set('Authorization', 'Bearer <adminToken>')
    .send({ jobTitleId: 1 });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});
```

- [ ] **Step 4: 전체 테스트 실행**

```bash
cd apps/api && npx jest --testPathPattern="department"
```

- [ ] **Step 5: 커밋**

```bash
git add apps/api/__test__/department/
git commit -m "test: DeptJobTitle 서비스·컨트롤러 테스트 추가"
```

---

### Task 7: FE 타입 + 서비스 — DeptJobTitle 타입 및 API

**Files:**
- Modify: `football/src/types/auth.ts`
- Modify: `football/src/services/department.service.ts`

- [ ] **Step 1: auth.ts UserDto 수정**

`football/src/types/auth.ts:86` 수정:
```typescript
  departmentMemberships: Array<{
    role: string;
    jobTitle: { id: number; label: string } | null;
    department: { id: number; name: string };
  }>
```

- [ ] **Step 2: department.service.ts 수정**

기존 `Member` 인터페이스에 `jobTitle` 추가:
```typescript
export interface Member {
  userId: number;
  departmentId: number;
  role: DeptRole;
  jobTitleId: number | null;
  jobTitle: { id: number; label: string } | null;
  joinedAt: string;
  user: { id: number; username: string; nickname: string; email: string; role: string };
  department: { id: number; name: string };
}
```

`DeptJobTitle` 타입 + API 추가:
```typescript
export interface DeptJobTitle {
  id: number;
  departmentId: number;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export const deptJobTitleApi = {
  list: (deptId: number): Promise<DeptJobTitle[]> =>
    api.get(`/departments/${deptId}/job-titles`),
  create: (deptId: number, data: { label: string; sortOrder?: number }): Promise<DeptJobTitle> =>
    api.post(`/departments/${deptId}/job-titles`, data),
  update: (deptId: number, titleId: number, data: { label?: string; sortOrder?: number }): Promise<DeptJobTitle> =>
    api.patch(`/departments/${deptId}/job-titles/${titleId}`, data),
  delete: (deptId: number, titleId: number): Promise<void> =>
    api.delete(`/departments/${deptId}/job-titles/${titleId}`),
};

// 기존 departmentMemberApi에 메서드 추가
// updateJobTitle: (deptId: number, userId: number, jobTitleId: number | null): Promise<void> =>
//   api.patch(`/departments/${deptId}/members/${userId}/job-title`, { jobTitleId })
```

`departmentMemberApi` 객체에:
```typescript
  updateJobTitle: (deptId: number, userId: number, jobTitleId: number | null): Promise<void> =>
    api.patch(`/departments/${deptId}/members/${userId}/job-title`, { jobTitleId }),
  add: (deptId: number, userId: number, role?: DeptRole, jobTitleId?: number | null): Promise<void> =>
    api.post(`/departments/${deptId}/members`, { userId, ...(role && { role }), ...(jobTitleId != null && { jobTitleId }) }),
```

- [ ] **Step 3: TypeScript 확인**

```bash
cd football && npx tsc --noEmit
```

- [ ] **Step 4: 커밋**

```bash
git add football/src/types/auth.ts football/src/services/department.service.ts
git commit -m "feat: DeptJobTitle 타입·API 추가 및 Member 타입에 jobTitle 포함"
```

---

### Task 8: i18n — 직급 관련 키 추가

**Files:**
- Modify: `football/src/locales/en/common.json`
- Modify: `football/src/locales/ko/common.json`

- [ ] **Step 1: 영문 키 추가**

`"deptMember"` 객체에 추가:
```json
"jobTitle": {
  "label": "Job Title",
  "placeholder": "Select job title",
  "none": "No title",
  "add": "Add Job Title",
  "edit": "Edit",
  "delete": "Delete",
  "deleteConfirm": "Deactivate this job title? Existing members will keep their current title.",
  "empty": "No job titles defined.",
  "manage": "Manage Job Titles",
  "labelPlaceholder": "e.g. Manager, Senior Staff"
}
```

- [ ] **Step 2: 한국어 키 추가**

```json
"jobTitle": {
  "label": "직급",
  "placeholder": "직급 선택",
  "none": "직급 없음",
  "add": "직급 추가",
  "edit": "수정",
  "delete": "삭제",
  "deleteConfirm": "이 직급을 비활성화할까요? 기존 팀원의 직급은 유지됩니다.",
  "empty": "등록된 직급이 없습니다.",
  "manage": "직급 관리",
  "labelPlaceholder": "예: 과장, 선임, 수석"
}
```

- [ ] **Step 3: 커밋**

```bash
git add football/src/locales/
git commit -m "feat: 직급 관련 i18n 키 추가"
```

---

### Task 9: MePage — 팀 필드 수정 + 부서 역할 번역 + jobTitle 표시

**Files:**
- Modify: `football/src/pages/me/MePage.tsx`

- [ ] **Step 1: 팀 필드 수정 (L207)**

`user.team?.type` 렌더링 교체:

```tsx
// 기존 L207
<dd className="mt-1 font-medium">{user.team?.type ?? t('mePage.notSet')}</dd>

// 수정 후
<dd className="mt-1 font-medium">
  {user.team?.type ?? (() => {
    const leaderMembership = user.departmentMemberships.find(
      d => d.role === 'LEADER' || d.role === 'DEPT_HEAD'
    ) ?? user.departmentMemberships[0]
    return leaderMembership?.department.name ?? t('mePage.notSet')
  })()}
</dd>
```

- [ ] **Step 2: 부서 역할 번역 + jobTitle 표시 (L213-216)**

`departmentMemberships` 렌더링 수정:

```tsx
{user.departmentMemberships.length > 0 ? user.departmentMemberships.map(d => (
  <span key={d.department.id} className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium bg-muted">
    {d.department.name}
    <span className="text-muted-foreground">· {t(`deptMember.role.${d.role}`)}</span>
    {d.jobTitle && (
      <span className="text-muted-foreground">· {d.jobTitle.label}</span>
    )}
  </span>
)) : <span className="text-muted-foreground text-xs">{t('mePage.notSet')}</span>}
```

- [ ] **Step 3: 브라우저에서 확인**

팀장 계정으로 로그인 → 내 정보 페이지에서:
- "팀" 필드: `user.team === null`이면 소속 부서명(LEADER/DEPT_HEAD) 표시
- 부서 섹션: "LEADER" 대신 "팀장" 표시
- 직급이 있으면 "기획팀 · 팀장 · 과장" 형태로 표시

- [ ] **Step 4: 커밋**

```bash
git add football/src/pages/me/MePage.tsx
git commit -m "fix: MePage 팀 null 시 부서명 표시 + 부서 역할 i18n + jobTitle 표시"
```

---

### Task 10: DepartmentMembersPage — 직급 관리 섹션 + 인라인 편집 + 추가 다이얼로그

**Files:**
- Modify: `football/src/pages/department/DepartmentMembersPage.tsx`

- [ ] **Step 1: import 및 state 추가**

파일 상단 import에 추가:
```typescript
import { deptJobTitleApi, type DeptJobTitle } from '@/services/department.service'
```

컴포넌트 state 추가:
```typescript
const [jobTitles, setJobTitles] = useState<DeptJobTitle[]>([])
const [jobTitleManageOpen, setJobTitleManageOpen] = useState(false)
const [newTitleLabel, setNewTitleLabel] = useState('')
const [titleSaving, setTitleSaving] = useState(false)
```

- [ ] **Step 2: fetchMembers에 직급 목록 포함**

```typescript
const fetchMembers = async () => {
  try {
    const [d, ms, ds, jts] = await Promise.all([
      departmentApi.get(deptId),
      departmentMemberApi.list(deptId),
      departmentApi.list(),
      deptJobTitleApi.list(deptId),
    ])
    setDept(d)
    setMembers(ms)
    setAllDepts(ds)
    setJobTitles(jts)
  } catch {
    toast.error(t('deptMember.loadFailed'))
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 3: 직급 변경 핸들러 추가**

```typescript
const handleJobTitleChange = async (m: Member, jobTitleId: number | null) => {
  try {
    await departmentMemberApi.updateJobTitle(deptId, m.userId, jobTitleId)
    void fetchMembers()
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    toast.error(messageForCode(code, t))
  }
}

const handleCreateJobTitle = async () => {
  if (!newTitleLabel.trim()) return
  setTitleSaving(true)
  try {
    await deptJobTitleApi.create(deptId, { label: newTitleLabel.trim() })
    setNewTitleLabel('')
    void fetchMembers()
  } catch (err) {
    const code = err instanceof Error ? err.message : ''
    toast.error(messageForCode(code, t))
  } finally {
    setTitleSaving(false)
  }
}

const handleDeleteJobTitle = async (titleId: number) => {
  if (!confirm(t('deptMember.jobTitle.deleteConfirm'))) return
  try {
    await deptJobTitleApi.delete(deptId, titleId)
    void fetchMembers()
  } catch {
    toast.error(t('deptMember.jobTitle.deleteConfirm'))
  }
}
```

- [ ] **Step 4: 테이블에 직급 컬럼 추가**

`<TableHead>` 행에 추가:
```tsx
<TableHead>{t('deptMember.jobTitle.label')}</TableHead>
```

`<TableCell>` 행(역할 셀 뒤)에 추가:
```tsx
<TableCell>
  {canManage ? (
    <Select
      value={m.jobTitleId != null ? String(m.jobTitleId) : ''}
      onValueChange={(v) => void handleJobTitleChange(m, v === '' ? null : Number(v))}
    >
      <SelectTrigger size="sm" className="w-28">
        <SelectValue placeholder={t('deptMember.jobTitle.none')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="" label={t('deptMember.jobTitle.none')}>
          {t('deptMember.jobTitle.none')}
        </SelectItem>
        {jobTitles.map(jt => (
          <SelectItem key={jt.id} value={String(jt.id)} label={jt.label}>
            {jt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <span className="text-sm text-muted-foreground">
      {m.jobTitle?.label ?? '—'}
    </span>
  )}
</TableCell>
```

`colSpan` 값도 4→5, 5→6으로 업데이트.

- [ ] **Step 5: 직급 관리 버튼 + 다이얼로그 추가**

헤더 버튼 영역에 추가 (canManage 가드 안):
```tsx
<Button variant="outline" size="sm" onClick={() => setJobTitleManageOpen(true)}>
  {t('deptMember.jobTitle.manage')}
</Button>
```

페이지 하단 (Transfer 다이얼로그 뒤)에 직급 관리 다이얼로그 추가:
```tsx
<Dialog open={jobTitleManageOpen} onOpenChange={setJobTitleManageOpen}>
  <DialogContent className="max-w-sm">
    <DialogHeader>
      <DialogTitle>{t('deptMember.jobTitle.manage')}</DialogTitle>
    </DialogHeader>
    <div className="space-y-3">
      <div className="space-y-1">
        {jobTitles.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('deptMember.jobTitle.empty')}</p>
        )}
        {jobTitles.map(jt => (
          <div key={jt.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
            <span>{jt.label}</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => void handleDeleteJobTitle(jt.id)}
            >
              {t('deptMember.jobTitle.delete')}
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newTitleLabel}
          onChange={(e) => setNewTitleLabel(e.target.value)}
          placeholder={t('deptMember.jobTitle.labelPlaceholder')}
        />
        <Button onClick={() => void handleCreateJobTitle()} disabled={titleSaving || !newTitleLabel.trim()}>
          {t('deptMember.jobTitle.add')}
        </Button>
      </div>
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setJobTitleManageOpen(false)}>{t('action.close')}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

추가 다이얼로그에도 직급 Select 추가:
```tsx
// addRole Select 뒤에
<div className="space-y-1.5">
  <Label>{t('deptMember.jobTitle.label')}</Label>
  <Select
    value={addJobTitleId != null ? String(addJobTitleId) : ''}
    onValueChange={(v) => setAddJobTitleId(v === '' ? null : Number(v))}
  >
    <SelectTrigger>
      <SelectValue placeholder={t('deptMember.jobTitle.none')} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="" label={t('deptMember.jobTitle.none')}>
        {t('deptMember.jobTitle.none')}
      </SelectItem>
      {jobTitles.map(jt => (
        <SelectItem key={jt.id} value={String(jt.id)} label={jt.label}>
          {jt.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

state 추가:
```typescript
const [addJobTitleId, setAddJobTitleId] = useState<number | null>(null)
```

`handleAdd`에서:
```typescript
await departmentMemberApi.add(deptId, uid, addRole, addJobTitleId)
// reset
setAddJobTitleId(null)
```

- [ ] **Step 6: 브라우저에서 전체 확인**

1. DepartmentMembersPage 접속 → "직급 관리" 버튼 표시 확인
2. 직급 관리 다이얼로그 → 직급 추가/삭제 동작 확인
3. 테이블 직급 인라인 Select 동작 확인
4. 팀원 추가 다이얼로그 → 직급 선택 필드 확인

- [ ] **Step 7: 커밋**

```bash
git add football/src/pages/department/DepartmentMembersPage.tsx
git commit -m "feat: DepartmentMembersPage 직급 관리 섹션 + 인라인 편집 + 추가 다이얼로그 직급 필드"
```

---

## 완료 체크리스트

- [ ] `npx prisma migrate dev` 성공
- [ ] `npx tsc --noEmit` (api + football) 오류 없음
- [ ] `npx jest` (api) 전체 통과
- [ ] MePage: 팀장 로그인 시 "팀" 필드에 소속 부서명 표시
- [ ] MePage: 부서 역할 "LEADER" → "팀장" 번역 표시
- [ ] MePage: jobTitle 있으면 "기획팀 · 팀장 · 과장" 형태 표시
- [ ] DepartmentMembersPage: 직급 관리 다이얼로그 동작
- [ ] DepartmentMembersPage: 직급 인라인 Select 동작
- [ ] DepartmentMembersPage: 팀원 추가 시 직급 선택 가능
