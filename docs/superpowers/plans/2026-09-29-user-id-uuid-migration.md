# User.id UUID 마이그레이션 Implementation Plan

**Goal**: `User.id` 를 `Int autoincrement` → `String @default(uuid())` 로 전면 교체하여 auto-increment enumeration 공격 방어 (troubles.md #5).

**Architecture**: 단일-쇼트 breaking migration. 37 유저 · 165 relation · dev DB 하나 → 병행/dual-column 대신 clean cut. 기존 JWT 토큰 무효화 (강제 재로그인 수용).

**Tech Stack**: Prisma migrate raw SQL (Int → UUID string 변환), TypeScript compiler 를 마이그레이션 가이드로 활용, Jest.

---

## 사전 조건
- 현재 브랜치 `refactor/user-id-uuid` (main 파생, clean)
- PR #585 (자매 브랜치) 는 이 작업 완료 후 rebase 필요 — 별도 관리
- 로컬 DB 백업: `pg_dump football > /tmp/football-pre-uuid.dump`

## Task 1 · 백업 + prisma schema.prisma User + FK 전면 교체

**Files**:
- Backup: `/tmp/football-pre-uuid.dump` (외부)
- Modify: `apps/api/prisma/schema.prisma` (User model + **모든 30+ FK 필드**)

**Step 1** — DB dump
```bash
pg_dump -U juno football > /tmp/football-pre-uuid.dump
```

**Step 2** — schema.prisma User model
```prisma
model User {
  id  String  @id @default(uuid())   // Int → String
  ...
}
```

**Step 3** — 모든 `Int` userId FK 컬럼을 `String` 으로 교체
grep 으로 후보 탐색:
```bash
grep -B2 "references: \[id\]" apps/api/prisma/schema.prisma \
  | awk '/User\?|User@|User\)/{print prev; print} {prev=$0}' \
  | grep -oE "^  [a-zA-Z]+Id\s+Int\??"
```
30+ 필드 (userId, actorId, createdById, updatedById, approvedById, changedById, assessedById, coachSignedById, trainerSignedById, medicalSignedById, reviewedById, addedById, agentId, coachId, guardianId 등) 전부 `Int?` / `Int` → `String?` / `String`.

**Step 4** — 검증
```bash
cd apps/api && npx prisma format && npx prisma validate
```
Expected: valid.

**Step 5** — Commit
```bash
git add apps/api/prisma/schema.prisma
git commit -m "refactor(schema): User.id + 30+ FK 컬럼 Int→String UUID"
```

## Task 2 · Migration SQL (Int → UUID) — 데이터 보존

**Files**:
- Create: `apps/api/prisma/migrations/YYYYMMDDHHMMSS_user_id_uuid/migration.sql`

**Step 1** — Prisma migrate 생성 (스켈레톤만)
```bash
cd apps/api && npx prisma migrate dev --create-only --name user_id_uuid
```

**Step 2** — 생성된 migration.sql 수정. 순서:
1. `id_map` temp table 만들기: `CREATE TABLE _user_id_map (old_id INT, new_id UUID DEFAULT gen_random_uuid()); INSERT INTO _user_id_map SELECT id FROM "User";`
2. 각 FK 테이블에 `<col>_new UUID` 컬럼 추가 → `UPDATE t SET col_new = m.new_id FROM _user_id_map m WHERE t.col = m.old_id;`
3. FK constraint DROP → 원본 컬럼 DROP → `_new` rename → NOT NULL/UNIQUE 재적용 → FK 재생성
4. `User.id` 도 동일 패턴
5. `DROP TABLE _user_id_map`

주의: 30+ 테이블 대상, sequence 생성 순서 (자기참조 없어야 함).

**Step 3** — 로컬 적용
```bash
npx prisma migrate dev
```
실패 시 `pg_restore /tmp/football-pre-uuid.dump` 로 롤백.

**Step 4** — Prisma client 재생성 확인
```bash
npx prisma generate
```

**Step 5** — Commit
```bash
git add apps/api/prisma/migrations/
git commit -m "refactor(migration): User.id + 30 FK 를 UUID 로 변환 (데이터 보존)"
```

## Task 3 · JWT payload · authMiddleware · token.ts

**Files**:
- Modify: `apps/api/src/lib/token.ts` (`id: number` → `id: string`)
- Modify: `apps/api/src/lib/authMiddleware.ts` (Number 캐스팅 제거)
- Modify: `apps/api/src/lib/userStatusCache.ts` (`isUserActive(id: string)`)
- Modify: `apps/api/src/types/express.d.ts` if exists

**Step 1** — token.ts payload type
```ts
export interface AccessTokenPayload {
  id: string;   // number → string
  role: string;
  ...
}
```

**Step 2** — authMiddleware 에서 `Number(decoded.id)` 같은 캐스팅 제거

**Step 3** — TS compile
```bash
cd apps/api && npx tsc --noEmit 2>&1 | head -50
```
Expected: 남은 에러는 컨트롤러/서비스 쪽 `Number(user.id)` 캐스팅 (다음 task 에서 처리).

**Step 4** — Commit

## Task 4 · Controller · Service 계층 `Number(user.id)` 제거

**Files**: 
- `grep -rln "Number(user.id\|Number(req.user\|Number(userId\|parseInt.*user\.id" apps/api/src` 로 나오는 전부

예상 파일: auth.controller, admin.controller, notification.controller, salary/payroll 관련 controllers, 각종 service.

**Step 1** — 자동 검색 + 수정
```bash
grep -rln "Number(user\.id\|Number(req\.user" apps/api/src
```

**Step 2** — 파일별로 `Number(user.id)` → `user.id` (이미 string), `String(user.id)` → `user.id`

**Step 3** — TS compile 반복
```bash
cd apps/api && npx tsc --noEmit
```
남은 에러 zero 될 때까지 반복.

**Step 4** — Commit chunk 단위로

## Task 5 · 라우트 파라미터 `Number(req.params.userId)` 제거

**Files**: `grep -rln "Number(req.params.*[Uu]serId\|Number(req.params.*[Ii]d)" apps/api/src`

**Step 1** — 유저 관련 라우트 (`/users/:id/*`, `/notifications/*` 등) 는 `req.params.id` 를 string 그대로 사용.

**Step 2** — 다른 도메인 (예: `/injuries/:id` 는 여전히 numeric injury id) 는 남겨둠. **User 관련만** 변경.

**Step 3** — Commit

## Task 5.5 · UUID 형식 검증 미들웨어 (정수-형 ID 방어)

**배경**: UUID 로 바꿔도 라우트가 `req.params.id` 를 그대로 Prisma 에 넘기면 `"1"`, `"abc"` 같은 non-UUID 도 400/500 대신 조용히 통과할 여지. Attacker 가 legacy 습관으로 `/users/1/gdpr-export` 시도 시 명시적으로 거절해야 함 (enumeration 시도 조기 차단 + 로깅).

**Files**:
- Create: `apps/api/src/lib/uuidGuard.ts`
- Modify: 유저-ID 를 URL param 으로 받는 모든 라우트

**Step 1** — helper 작성
```ts
// apps/api/src/lib/uuidGuard.ts
import { Request, Response, NextFunction } from "express";
import { AppError } from "./appError";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && UUID_RE.test(v);

export const requireUuidParam = (key: string) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const v = req.params[key];
    if (!isUuid(v)) return next(new AppError(400, "INVALID_UUID"));
    next();
  };
```

**Step 2** — 유저-ID URL 라우트에 적용:
```ts
router.get("/users/:id/gdpr-export", auth, requireUuidParam("id"), controller.gdprExport);
router.post("/users/:id/deactivate", auth, requireUuidParam("id"), controller.deactivate);
// ... 모든 /users/:id/* 
```

**Step 3** — 정수-형 ID 요청 실측 확인
```bash
curl -b /tmp/c.jar http://localhost:3001/api/users/1/gdpr-export -w "\nHTTP %{http_code}\n"
# expected: HTTP 400 {"code":"INVALID_UUID"}
curl -b /tmp/c.jar http://localhost:3001/api/users/abc/gdpr-export -w "\nHTTP %{http_code}\n"
# expected: HTTP 400 {"code":"INVALID_UUID"}
```

**Step 4** — Body/query 필드용 유틸 (userId, actorId 등이 body 로 들어오는 케이스)
```ts
// service 진입 시
if (dto.assigneeId !== undefined && !isUuid(dto.assigneeId)) {
  throw new AppError(400, "INVALID_UUID");
}
```
DTO validator 가 Zod/Yup 이면 스키마에 `z.string().uuid()` 추가.

**Step 5** — Jest 케이스
```ts
test("숫자-형 userId → 400 INVALID_UUID", async () => {
  const res = await request(app).get("/api/users/1/gdpr-export").set(auth);
  expect(res.status).toBe(400);
  expect(res.body.code).toBe("INVALID_UUID");
});
```

**Step 6** — Commit
```bash
git commit -m "feat(security): non-UUID user-id 요청 400 차단 (enumeration 시도 조기 거절)"
```

## Task 6 · Seed 재작성

**Files**: `apps/api/prisma/seed.ts`

**Step 1** — 하드코딩된 `id: 1, 2, 3` User 참조가 있는지 확인
```bash
grep -n "userId:.*[0-9]\|id: [0-9]" apps/api/prisma/seed.ts | head -20
```

**Step 2** — 순차 생성 후 반환된 `user.id` (uuid) 를 변수로 저장하여 하위 create 에 전달.

**Step 3** — 로컬에서 `npx prisma migrate reset --force` 로 seed 검증

**Step 4** — Commit

## Task 7 · Test fixtures 업데이트 (15 파일)

**Files**: `__test__` 하위 `userId: 1|2|...` 15개 파일

**Step 1** — 각 test 파일의 fixture 를 `userId: "test-uuid-1"` 같은 임의 UUID string 으로 교체 (또는 fixed test UUIDs)

**Step 2** — `pnpm jest` 로 전체 실행
```bash
cd apps/api && npx jest 2>&1 | tail -30
```
Expected: 전 스위트 pass.

**Step 3** — Commit

## Task 8 · Frontend 타입 · API 호출

**Files**:
- `football/src/types/*.ts` (User 관련)
- `football/src/api/*.ts` if type-checked
- `football/src/pages/**/*.tsx` (예: `user.id === X` 비교)

**Step 1** — 
```bash
grep -rln "id: number\|userId: number" football/src/types 2>/dev/null
```

**Step 2** — 관련 타입 필드 `number` → `string`

**Step 3** — FE 빌드 확인
```bash
cd football && pnpm build 2>&1 | tail -20
```

**Step 4** — Commit

## Task 9 · 스모크 · 통합 검증

**Files**: 없음 (실측)

**Step 1** — API 재기동
```bash
cd apps/api && pnpm dev
```

**Step 2** — 로그인 시나리오 (admin/HR/PLAYER) 전부 200 확인
```bash
curl -c /tmp/c.jar -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" -d '{"email":"admin@club.com","password":"Password1!"}'
curl -b /tmp/c.jar http://localhost:3001/api/auth/me   # id 가 UUID string 인지 확인
```

**Step 3** — FE 로그인 → 대시보드 로드 확인 (브라우저 수동)

**Step 4** — k6 baseline 1회 (성능 회귀 없는지)
```bash
cd loadtest && k6 run --env SCENARIO=baseline --env VUS=2 baseline.k6.js
```

## Task 10 · 문서 · PR

**Files**: 
- `troubles.md#5` 작업란 채우기
- 새 PR

**Step 1** — troubles.md #5 "작업" 섹션 채우기 (요약)

**Step 2** — Commit + push
```bash
git push -u origin refactor/user-id-uuid
gh pr create --title "refactor: User.id Int → UUID (troubles.md#5)" --body "..."
```

---

## 리스크 · 롤백
- **큰 downtime**: 마이그레이션 SQL 이 30+ 테이블 ALTER 필요 → prod 는 별도 유지보수 창 필요
- **JWT 무효화**: 배포 시 모든 유저 강제 로그아웃 (예상 UX)
- **롤백**: `pg_restore /tmp/football-pre-uuid.dump` + `git revert` 커밋들
- **자매 브랜치 conflicts**: PR #585 는 이 refactor merge 후 rebase 필요

## 성공 기준
- [ ] `psql -c "\d \"User\"" | grep "^ id"` → `uuid` 
- [ ] `/api/auth/me` 응답의 `id` 가 UUID string
- [ ] `pnpm jest` 전 스위트 pass
- [ ] `pnpm build` (FE) 에러 없음
- [ ] baseline k6 회귀 없음
- [ ] troubles.md #5 작업란 채워짐
