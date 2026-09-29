# Club Data Ownership Phase 2.5 — Asset Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `EquipmentItem`·`EquipmentUnit`·`EquipmentLoan`·`AssetRequest` 에 `clubId Int?` FK 를 추가하고, Phase 1/1.5/2 와 동일한 패턴으로 read/write 경로에 구단 소속 필터링을 적용한다. Cross-role RBAC 스캔에서 나온 4건 LEAK 오탐을 데이터 모델 층에서 해소한다.

**Architecture:** `clubId` nullable FK → `findFirst` with optional WHERE clubId 조건 → `actorClubId?` 파라미터 전파 (controller `user.clubId` → service → repo) → SUPER_ADMIN / `user.clubId` null 계정 bypass. Phase 2 와 동일 패턴, 새 에러 코드 없음 — 기존 404 가드가 처리. **역할 화이트리스트(`canRead`/`canWrite`)는 유지** — clubId 는 row-level scoping 을 담당하고 role guard 는 orthogonal 하게 그대로 작동.

**Tech Stack:** Express + TypeScript + Prisma ORM + Jest (ts-jest)

**배경 (troubles.md §4 예정):** Cross-Role RBAC 스캔 4건 LEAK (`PLAYER→/asset-requests`, `HR_MANAGER→/equipment`, `HR_MANAGER→/asset-requests`, `HR_MANAGER→/equipment/loans`) 재분석 결과, 화이트리스트 문제가 아니라 **자산 모델이 club-agnostic** 이라 클럽 간 격리 불가. Feature 16 (`de7b59d9` 자산관리부서) 도입 시 단일 클럽 전제. Phase 2 문서 "범위 밖" 절에도 자산 도메인 언급 없음 → Phase 2.5 신설.

**그릴 결정 사항 (Q1-Q6)**:
- Q1 EquipmentItem clubId **필요** — Partner 는 clubId 없는 글로벌 엔티티라 Partner→clubId 우회 불가
- Q2 Backfill — 3개 모델은 결정적 pivot (User·EquipmentItem), EquipmentItem 은 `첫 loan 요청자.clubId → COALESCE(first Club LIMIT 1)` (Phase 1 Prospect precedent)
- Q3 `listLoans` → `canWrite` 축소 안전 — FE `isKitManager` ⊂ 서버 `canWrite`
- Q4 cross-role-test **전 도메인 multi-club 재작성** (감사 겸용) — HR/FINANCE/MEDICAL 도 cross-club 검증
- Q5 clubId null bypass **유지** + seed/prod User.clubId backfill (Task 2 신설) — bypass 유지가 legacy 계정 안전판
- Q6 SoftwareLicense **범위 밖** — 이미 `checkSystemManage` (ADMIN/SUPER_ADMIN 전용) 잠금, 도메인 판단 (그룹공유 vs 클럽별) 대기

**Prod 단일 클럽 확인**: 현재 Club 테이블 row 1개 (FC Seoul), seed 는 단일 클럽 → LIMIT 1 fallback 안전.

---

## File Map

| 파일 | 변경 내용 |
|---|---|
| `apps/api/prisma/schema.prisma` | EquipmentItem·EquipmentUnit·EquipmentLoan·AssetRequest 에 `clubId Int?` + Club backrelation 추가 |
| `apps/api/prisma/migrations/YYYYMMDDNNNNNN_add_club_id_to_asset_domain/migration.sql` | 신규 마이그레이션 (backfill SQL 수동 추가) |
| `apps/api/prisma/migrations/YYYYMMDDNNNNNN_backfill_user_clubid/migration.sql` | **신규** — User.clubId 가 null 인 legacy 유저 backfill (Q5 결정, Task 2) |
| `apps/api/prisma/seed.ts` | HR_STAFF·ASSET_STAFF·FINANCE_STAFF·FACILITY_*·hr@club.com upsert 에 `clubId: fcSeoulClub.id` 명시 (`update: { clubId }` 로 재실행 시에도 세팅) |
| `apps/api/src/equipment/equipment.repo.ts` | `findAllItems`+clubId, `findItemById` findUnique→findFirst+clubId, `findUnitById`+clubId, `createItem`+clubId, `listLoans`+clubId, `findLoanById`+clubId |
| `apps/api/src/equipment/equipment.service.ts` | 모든 메서드에 `actorClubId?` 파라미터 추가 |
| `apps/api/src/equipment/equipment.controller.ts` | 서비스 호출 시 `user.clubId` 전달 (기존 `canRead`/`canWrite` 화이트리스트는 유지) |
| `apps/api/src/asset-request/asset-request.repo.ts` | `findById` findUnique→findFirst+clubId, `findAll`+clubId, `findByRequester`+clubId, `findPendingForLeader`+clubId, `findPendingForDeptHead`+clubId, `create`+clubId |
| `apps/api/src/asset-request/asset-request.service.ts` | 모든 메서드에 `actorClubId?` 파라미터 추가 |
| `apps/api/src/asset-request/asset-request.controller.ts` | 서비스 호출 시 `user.clubId` 전달 |
| `apps/api/src/equipment/equipment.service.test.ts` | 확장 — clubId 스코핑 단위 테스트 추가 |
| `apps/api/src/asset-request/asset-request.service.test.ts` | 신규 — clubId 스코핑 단위 테스트 |
| `loadtest/results-2026-09-27/cross-role-test.mjs` | 2-클럽 seed 기반 재작성 (같은 클럽 200 정상, 타 클럽 404 검증) |

---

## Task 1: Prisma 스키마 + 마이그레이션

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/YYYYMMDDNNNNNN_add_club_id_to_asset_domain/migration.sql`

- [ ] **Step 1: schema.prisma 에 clubId 필드 추가**

`model EquipmentItem` (현재 line ~1885) 블록:

```prisma
model EquipmentItem {
  // ... 기존 필드 유지 ...
  partnerId           Int?
  clubId              Int?                          // ← 추가

  units         EquipmentUnit[]
  assignments   EquipmentAssignment[]
  partner       Partner?              @relation(fields: [partnerId], references: [id])
  club          Club?                 @relation("EquipmentItemClub", fields: [clubId], references: [id])  // ← 추가
  loans         EquipmentLoan[]
  assetRequests AssetRequest[]
}
```

`model EquipmentUnit` (현재 line ~1901) 블록 마지막 필드 뒤:

```prisma
model EquipmentUnit {
  // ... 기존 필드 유지 ...
  clubId              Int?                          // ← 추가

  equipmentItem       EquipmentItem          @relation(fields: [equipmentItemId], references: [id])
  club                Club?                  @relation("EquipmentUnitClub", fields: [clubId], references: [id])  // ← 추가
  // ... 기존 relations 유지 ...
}
```

`model EquipmentLoan` (현재 line ~1415) 블록:

```prisma
model EquipmentLoan {
  // ... 기존 필드 유지 ...
  equipmentUnitId Int?
  clubId          Int?                              // ← 추가

  requestedBy   User                        @relation("LoanRequestedBy", fields: [requestedById], references: [id])
  approvedBy    User?                       @relation("LoanApprovedBy", fields: [approvedById], references: [id])
  equipmentItem EquipmentItem               @relation(fields: [equipmentItemId], references: [id])
  equipmentUnit EquipmentUnit?              @relation(fields: [equipmentUnitId], references: [id])
  club          Club?                       @relation("EquipmentLoanClub", fields: [clubId], references: [id])  // ← 추가
  medicalLedger MedicalEquipmentLoanLedger?
}
```

`model AssetRequest` (현재 line ~4654) 블록:

```prisma
model AssetRequest {
  // ... 기존 필드 유지 ...
  departmentId Int
  clubId       Int?                                 // ← 추가

  requester    User       @relation("AssetRequestRequester", fields: [requesterId], references: [id])
  department   Department @relation(fields: [departmentId], references: [id])
  club         Club?      @relation("AssetRequestClub", fields: [clubId], references: [id])  // ← 추가
  // ... 기존 relations 유지 ...

  @@index([requesterId, status])
  @@index([departmentId, status])
  @@index([clubId, status])                        // ← 추가
  @@index([status, createdAt])
  @@index([provisionedFromDispatchId])
}
```

`model Club` 블록에 backrelation 4개 추가:

```prisma
  equipmentItems   EquipmentItem[]   @relation("EquipmentItemClub")     // ← 추가
  equipmentUnits   EquipmentUnit[]   @relation("EquipmentUnitClub")     // ← 추가
  equipmentLoans   EquipmentLoan[]   @relation("EquipmentLoanClub")     // ← 추가
  assetRequests    AssetRequest[]    @relation("AssetRequestClub")      // ← 추가
```

- [ ] **Step 2: 마이그레이션 파일 생성 (적용 X)**

```bash
cd apps/api && npx prisma migrate dev --create-only --name add_club_id_to_asset_domain
```

- [ ] **Step 3: migration.sql 에 backfill SQL 수동 추가**

생성된 migration.sql 파일 ALTER TABLE 구문 뒤에:

```sql
-- Q1 결정: Partner 는 clubId 없는 글로벌 엔티티 → Partner→clubId 우회 불가
-- Q2 결정: 결정적 pivot 있는 3개는 각자, EquipmentItem 만 Prospect precedent (LIMIT 1) fallback

-- AssetRequest: 요청자(User) 소속 클럽 (OperatingExpense.createdBy 와 동일 패턴)
UPDATE "public"."AssetRequest" ar
SET "clubId" = u."clubId"
FROM "public"."User" u
WHERE ar."requesterId" = u."id" AND u."clubId" IS NOT NULL;

-- EquipmentLoan: 요청자(User) 소속 클럽
UPDATE "public"."EquipmentLoan" el
SET "clubId" = u."clubId"
FROM "public"."User" u
WHERE el."requestedById" = u."id" AND u."clubId" IS NOT NULL;

-- EquipmentItem: 첫 loan 요청자 clubId, 없으면 first Club LIMIT 1 (Prospect precedent)
UPDATE "public"."EquipmentItem" ei
SET "clubId" = COALESCE(
  (SELECT u."clubId" FROM "public"."EquipmentLoan" el
   JOIN "public"."User" u ON el."requestedById" = u."id"
   WHERE el."equipmentItemId" = ei."id" AND u."clubId" IS NOT NULL
   ORDER BY el."requestedAt" ASC LIMIT 1),
  (SELECT "id" FROM "public"."Club" ORDER BY "id" LIMIT 1)
);

-- EquipmentUnit: parent EquipmentItem 의 clubId 로 backfill
UPDATE "public"."EquipmentUnit" eu
SET "clubId" = ei."clubId"
FROM "public"."EquipmentItem" ei
WHERE eu."equipmentItemId" = ei."id" AND ei."clubId" IS NOT NULL;
```

- [ ] **Step 4: 마이그레이션 적용 + 클라이언트 재생성**

```bash
cd apps/api && npx prisma migrate dev
```

- [ ] **Step 5: 커밋**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat: 자산 도메인 4개 모델에 clubId FK 추가 (Phase 2.5 schema)"
```

---

## Task 2: User.clubId Backfill (Q5 신설)

Q5 결정: `clubId null` bypass 정책 유지 + seed/prod User 백필. Q4-B (전 도메인 cross-club 감사) 의 전제조건.

**Files:**
- Modify: `apps/api/prisma/seed.ts`
- Create: `apps/api/prisma/migrations/YYYYMMDDNNNNNN_backfill_user_clubid/migration.sql`

- [ ] **Step 1: seed.ts 의 clubId 없는 upsert 에 명시적 세팅**

대상: `hr.staff@club.com`, `asset.staff@club.com`, `finance.staff@club.com`, `facility.manager@club.com`, `facility.staff@club.com` (line 156~234), `hr@club.com` (line 493), 그 외 line 220 이후 upsert 중 clubId 없는 것 전부.

각 `user.upsert` 를:
```ts
prisma.user.upsert({
  where: { email: '…' },
  update: { clubId: fcSeoulClub.id },   // ← 재실행 시에도 세팅
  create: { …, clubId: fcSeoulClub.id }, // ← 신규 시 세팅
})
```

- [ ] **Step 2: prod 마이그레이션 SQL 작성**

```bash
cd apps/api && npx prisma migrate dev --create-only --name backfill_user_clubid
```

생성된 파일에 backfill 만 넣기 (schema 변경 없음):
```sql
-- 현재 prod 단일 클럽 확인됨 (Q2). Legacy User (clubId null) 를 첫 Club 으로 backfill.
UPDATE "public"."User"
SET "clubId" = (SELECT "id" FROM "public"."Club" ORDER BY "id" LIMIT 1)
WHERE "clubId" IS NULL;
```

- [ ] **Step 3: 마이그레이션 적용 + seed 재실행 검증**

```bash
cd apps/api && npx prisma migrate dev && npm run seed
psql $DATABASE_URL -c 'SELECT count(*) FROM "User" WHERE "clubId" IS NULL;'
# → 0 이어야 함
```

- [ ] **Step 4: 커밋**

```bash
git commit -m "feat: User.clubId backfill — legacy 유저 + seed 세팅 (Phase 2.5 · Q5)"
```

**주의**: `permissions.ts:97` `if (!user.clubId) return;` bypass 는 **유지**. 후속 fix 로 이 라인 제거 검토 (별도 이슈).

---

## Task 3: Equipment Repo — clubId 필터링

**Files:**
- Modify: `apps/api/src/equipment/equipment.repo.ts`

- [ ] **Step 1: `findAllItems` 에 clubId 필터**

```ts
async findAllItems(clubId?: number) {
  return this.prisma.equipmentItem.findMany({
    where: clubId !== undefined ? { clubId } : undefined,
    select: ITEM_SELECT,
  });
}
```

- [ ] **Step 2: `findItemById` findUnique → findFirst + clubId**

```ts
async findItemById(id: number, clubId?: number) {
  return this.prisma.equipmentItem.findFirst({
    where: { id, ...(clubId !== undefined ? { clubId } : {}) },
    select: ITEM_SELECT,
  });
}
```

- [ ] **Step 3: `findUnitById` 도 findFirst + clubId 로 변경**

- [ ] **Step 4: `createItem`·`createUnit` 에 `clubId` 저장**

`data` 객체에 `clubId: dto.clubId ?? actorClubId ?? null` 추가.

- [ ] **Step 5: `listLoans`·`findLoanById`·`findMyLoans` 에 clubId 필터**

`findMany({ where: { ...(status ? { status } : {}), ...(clubId !== undefined ? { clubId } : {}) } })`.

- [ ] **Step 6: 커밋**

---

## Task 4: Equipment Service — actorClubId 전파

**Files:**
- Modify: `apps/api/src/equipment/equipment.service.ts`

- [ ] **Step 1: `getAllItems(actorClubId?)`**

- [ ] **Step 2: `getItemById(id, actorClubId?)` → repo 로 전달, null 이면 404 throw**

- [ ] **Step 3: `createItem(dto, actorClubId?)` → repo `createItem` 에 clubId 전달**

- [ ] **Step 4: `listLoans(status, actorClubId?)`·`listMyLoans(userId, actorClubId?)`·`requestLoan(dto, userId, actorClubId?)`·`approveLoan(loanId, actorClubId?)` 등 loan 전체 메서드**

- [ ] **Step 5: assignment / disposal / unit transition 관련 메서드도 동일 패턴**

- [ ] **Step 6: 커밋**

---

## Task 5: Equipment Controller — user.clubId 전달

**Files:**
- Modify: `apps/api/src/equipment/equipment.controller.ts`

- [ ] **Step 1: 모든 handler 에서 `const { role, frontOfficeRole, id: userId, clubId } = requireUser(req)` 로 확장**

- [ ] **Step 2: service 호출 시 마지막 인자로 `clubId ?? undefined` 전달**

- [ ] **Step 3: `canRead`/`canWrite` 화이트리스트는 **그대로 유지** — role guard 는 orthogonal**

- [ ] **Step 4: `listLoans` 는 `canRead` → `canWrite` 로 좁혀서 관리자 전용화** (본인 대여는 `/loans/my` 로 분리되어 있음)

- [ ] **Step 5: 커밋**

---

## Task 6: AssetRequest Repo — clubId 필터링

**Files:**
- Modify: `apps/api/src/asset-request/asset-request.repo.ts`

- [ ] **Step 1: `findById(id, clubId?)` findUnique → findFirst + clubId**

- [ ] **Step 2: `findAll(status?, clubId?)`·`findByRequester(userId, status?, clubId?)`·`findPendingForLeader(userId, clubId?)`·`findPendingForDeptHead(userId, clubId?)` 전체에 clubId 필터**

- [ ] **Step 3: `create` 에 `clubId` 저장 (`data.clubId = actorClubId ?? null`)**

- [ ] **Step 4: 커밋**

---

## Task 7: AssetRequest Service — actorClubId 전파

**Files:**
- Modify: `apps/api/src/asset-request/asset-request.service.ts`

- [ ] **Step 1: `list(userId, role, filter, status, actorClubId?)`**

- [ ] **Step 2: `getById(id, actorClubId?)`·`create(dto, requesterId, actorClubId?)`·`submit/leaderApprove/leaderReject/approve/reject/cancel/fulfill(id, ..., actorClubId?)`**

- [ ] **Step 3: 캐시 키에 clubId 포함 (`cacheKey = ...:${actorClubId ?? "all"}`)**

- [ ] **Step 4: 커밋**

---

## Task 8: AssetRequest Controller — user.clubId 전달

**Files:**
- Modify: `apps/api/src/asset-request/asset-request.controller.ts`

- [ ] **Step 1: 모든 handler 에서 `clubId` 추출 후 service 호출에 전달**

- [ ] **Step 2: 커밋**

---

## Task 9: 테스트 작성

**Files:**
- Modify: `apps/api/src/equipment/equipment.service.test.ts`
- Create: `apps/api/src/asset-request/asset-request.service.test.ts`

- [ ] **Step 1: equipment.service.test — clubId 스코핑 케이스**
  - `getAllItems(clubId=1)` 은 clubId=1 아이템만 반환
  - `getItemById(id, clubId=2)` 는 clubId=1 아이템 조회 시 null → 404
  - `getItemById(id, undefined)` 는 SUPER_ADMIN 시나리오 — 전체 접근
  - `listLoans(status, clubId=1)` 는 clubId=1 loan 만 반환

- [ ] **Step 2: asset-request.service.test — 신규 파일**
  - `list(userId, role, "me", ..., clubId=1)` 는 clubId=1 요청만 반환
  - `getById(id, clubId=2)` 는 클럽 불일치 시 404
  - `create(dto, requesterId, clubId=1)` 는 저장된 row 의 clubId=1 확인

- [ ] **Step 3: 커밋**

---

## Task 10: Cross-Role Test 전 도메인 Multi-Club 재작성 (Q4-B)

Q4-B 결정: ASSET-only 가 아니라 **전 도메인 (HR·FINANCE·MEDICAL·GM·ADMIN·ASSET) multi-club 감사**. HR/FINANCE 등이 dept-category 화이트리스트로 cross-club 을 실제로 막는지 검증.

**Files:**
- Modify: `apps/api/prisma/seed.ts` (Club B + 페르소나 6종 추가)
- Modify: `loadtest/results-2026-09-27/cross-role-test.mjs`

- [ ] **Step 1: seed.ts 에 Club B + 페르소나 추가**

```ts
const clubB = await prisma.club.upsert({ where: { id: 2 }, update: {}, create: { name: "Club B", isActive: true, isLite: false } })
// 각 도메인 페르소나 B 버전 — hr.b@club.com, asset.b@club.com, finance.b@club.com, medical.b@club.com, gm.b@club.com, player.b@club.com
// 각 유저는 clubId: clubB.id 로 생성
```

- [ ] **Step 2: cross-role-test.mjs PERSONAS 확장**

기존 페르소나 + `_CLUB_B` suffix 6개 추가. `sessions` 는 `{ 'HR_MANAGER': jar, 'HR_MANAGER_CLUB_B': jar, ... }`.

- [ ] **Step 3: 판정 로직 3-way 분기**

```js
const attackerClub = getClubOf(attackerLabel)  // 'A' or 'B'
const ownerClub    = getClubOf(t.owner)         // 'A' or 'B'
const sameClub = attackerClub === ownerClub

// same-club cross-role: 기존 판정 (owner-role 만 200, 나머지 403)
// cross-club cross-role: 반드시 404 or 403 (200 = LEAK)
// cross-club same-role: 반드시 404 (다른 클럽 데이터 노출 금지)
```

- [ ] **Step 4: 전 도메인 재실행**

```bash
node loadtest/results-2026-09-27/cross-role-test.mjs
```

- [ ] **Step 5: 결과 분석**
  - ASSET 4건 오탐 해소 확인
  - HR/FINANCE/MEDICAL/GM 도메인 cross-club LEAK 신규 검출 시 후속 이슈로 파일링 (dept-category 가 clubId 를 실제로 스코핑하는지 검증)
  - 후속 fix 가 필요하면 별도 커밋으로 `permissions.ts` 의 `canReadHR`/`canReadFinance` 등에 clubId 조건 추가

- [ ] **Step 6: 커밋**

---

## Task 11: 문서 업데이트

**Files:**
- Modify: `troubles.md`
- Modify: `loadtest/results-2026-09-27/TESTTODO.md`

- [ ] **Step 1: troubles.md §4 자산 도메인 Club Data Ownership 미적용 추가** (배경/원인/작업/결과)

- [ ] **Step 2: TESTTODO.md §5 ASSET_MANAGER 항목**
  - "Cross-role 접근 차단" 을 "구단 스코핑 통과 (multi-club test)" 로 정정
  - 잔여 우선순위 1번 "ASSET RBAC fix 4건" → "완료 (Phase 2.5)"

- [ ] **Step 3: 커밋**

---

## Task 12: PR

- [ ] **Step 1: 전체 jest 실행 — regression 0**

```bash
cd apps/api && pnpm test
```

- [ ] **Step 2: docker db 로 마이그레이션 dry-run 확인**

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base main --title "feat: Club Data Ownership Phase 2.5 — 자산 도메인 clubId 스코핑" --body "$(cat <<'EOF'
## Summary
- EquipmentItem·EquipmentUnit·EquipmentLoan·AssetRequest 4개 모델에 clubId Int? FK 추가
- Phase 2 와 동일한 actorClubId 전파 패턴 (controller → service → repo)
- cross-role-test 를 multi-club seed 기반으로 재작성 → 4건 오탐 leak 해소
- listLoans 는 canWrite (관리자 전용) 로 좁힘, 본인 대여는 /loans/my 유지

## Test plan
- [ ] equipment.service.test — clubId 스코핑 케이스 통과
- [ ] asset-request.service.test — 신규 스코핑 케이스 통과
- [ ] cross-role-test.mjs — multi-club seed 로 재실행 LEAK 0
- [ ] 전체 jest suite regression 없음
- [ ] docker db 마이그레이션 backfill 검증

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary
- EquipmentItem·EquipmentUnit·EquipmentLoan·AssetRequest 에 clubId Int? FK 추가 (Prisma migration + backfill)
- equipment/asset-request repo: findUnique→findFirst+clubId, 전체 list 쿼리 clubId 필터
- equipment/asset-request service: 전 메서드에 actorClubId? 파라미터 추가
- equipment/asset-request controller: 서비스 호출 시 user.clubId 전달, 기존 role 화이트리스트는 유지
- listLoans 관리자 전용화 (`/loans/my` 는 본인 대여 유지)
- cross-role-test multi-club 재작성으로 오탐 해소
- SUPER_ADMIN / clubId 없는 계정은 기존 동작 그대로 (bypass)

## Test Plan
- [ ] equipment.service.test.ts: getAllItems/getItemById/listLoans clubId 스코핑 통과
- [ ] asset-request.service.test.ts: list/getById/create clubId 스코핑 통과
- [ ] cross-role-test.mjs: multi-club seed 로 LEAK 0 확인
- [ ] 전체 jest suite regression 없음

---

## 범위 밖

- **SoftwareLicense** (Q6 결정) — 이미 `checkSystemManage` (ADMIN/SUPER_ADMIN 전용) 로 강하게 잠김, cross-role leak 위험 낮음. clubId 스코핑 여부는 **도메인 판단 대기** (그룹 공유 라이센스 vs 클럽별 계약). 후속 이슈로 파일링, 결정 후 별도 PR
- EquipmentAssignment, AssetRequestApproval 등 하위 모델 — parent(EquipmentItem/AssetRequest) clubId 스코핑이 커버
- Contract·Match·BudgetPlan 등 자산 외 도메인 — Phase 3
- Front-end (`useAssetRequests` 등) — user.clubId 를 자동으로 서버에서 스코핑하므로 UI 변경 불필요
- `permissions.ts:97` `if (!user.clubId) return;` bypass **제거** — Task 2 로 User backfill 완료 후 후속 PR 에서 검토
