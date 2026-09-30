# 도메인별 테스트 TODO

## 범례
- ✅ 완료
- 🔲 미완료
- ➖ 해당 없음

## 시나리오 정의
- **Smoke** — VUS=2 constant · DURATION=10s · endpoint 골든 패스 확인
- **Stress** — ramping VUs 5→50→100→200 (peak) → 0 · 약 1분 45초 · threshold `p(95) < 2000ms`
- **Pentest** — 페르소나 세션으로 임의 ID 1~20 순차 프로브

---

## 1. Auth `/auth`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ 로그인 sweep 33 계정 · 10건 200 확인 (rate-limit 이후 429) |
| Stress (인증된 read `/auth/me` · `/auth/login-history`) | ✅ `stress-AUTH.json` p(95) 3,329ms · avg 959ms · RPS 60 · **fail 49.99%** (`/auth/login-history` 접근 불가 role 존재 추정) · VU peak 200 |
| Stress (login 전용) | ➖ rate-limiter (progressive lockout) 로 스트레스 불가 — 5회 실패 만에 잠금 시작 |
| 보안 — 브루트포스 / Progressive Rate Limiting | ✅ **도입 완료** (`lib/loginRateLimit.ts` · Redis 백엔드). 5회→5분·10회→30분·15회→1시간·20회→24시간 progressive tier. 실측: 5회 401 → 6회 429·tier=`5m`·TTL 300s. **20회 tier 도달 시 ADMIN + SECURITY_LEAD 에게 `LOGIN_LOCKOUT_24H` 알림 발송** (#574 FIXED · migration `20260930000000_add_security_lead_and_login_lockout_types` 로 enum + FrontOfficeRole 추가) |
| 보안 — 인증 우회 (토큰 없음/변조) | ✅ 토큰 없음·잘못된 토큰 모두 `401 UNAUTHORIZED` (`auth-test.json` T4·T5) |
| 보안 — Refresh 토큰 재사용 (sequential) | 🔲 rate-limit cooldown 후 재테스트 필요 · `auth-test.mjs` T9 |
| 보안 — Refresh 토큰 재사용 (concurrent race) | ⚠️ `auth.controller.ts:65` blacklist 가 `void ...fire-and-forget` → 병렬 2회 요청 시 둘 다 통과 가능. **동시성 취약 코드** — Redis SETNX 또는 DB 트랜잭션 필요 · 실측은 rate-limit cooldown 후 재검증 |
| 보안 — Soft Delete 된 유저나 블랙리스트에 추가된 유저가 로그인시 에러가 나오는가? | ⚠️ `auth.service.ts:14-27` login() 은 `isDeleted` 미체크 → 토큰 발급됨, 하지만 `authMiddleware.ts:46` 이 후속 요청 401 차단. **login 단계에서 즉시 차단하는 게 안전** (코드 리뷰 결과) |
| 보안 — 개인정보 수정시 본인이 아닌 경우 401 에러가 나오는가? | ✅ `PATCH /auth/me/profile` 는 `req.user.id` 기반 self-scope 강제, 무인증 시 401 (`auth-test.json` T4). 타인 수정 시도 자체가 불가능한 라우트 설계 |
| 보안 — Rate-limit window 및 threshold 상수 문서화 | 🔲 `apps/api/src/lib/rateLimit.ts` ADR/주석 추가 필요 |
| 보안 — 개인 정보 수정시 마스킹 처리 잘되는 가? | ✅ `maskPii.ts` 에 `maskEmail`·`maskUsername`·`maskPhone`·`maskAddress` 구현. `AdminService.listUsers` 에서 `isDemo` 계정 마스킹 적용. 본인 `/me` 는 원본 노출 (의도된 설계) |
| 보안 — 비밀번호 수정시 6개월동안 사용 혹은 타입이 맞지 않는 경우 에러나오는가 | ✅ 타입 검증 `INVALID_PASSWORD_FORMAT` (8+ 대소문자·숫자·특수) · 현재 비번 재사용 `SAME_AS_CURRENT_PASSWORD` 409 · **6개월 재사용 방지 `PASSWORD_RECENTLY_USED` 409 도입 완료** (`PasswordHistory` 모델 · 변경 시 이전 hash 저장 · 6개월 이내 이력과 bcrypt.compare) · E2E 실측은 shared dev DB player 뮤테이션 이슈로 격리 DB 재검증 필요 |
| 보안 — 비밀번호 해싱처리 잘되는 가 | ✅ `lib/hash.ts` bcrypt cost 10 (`bcrypt.hash(password, 10)`) · `createUser`·`updatePassword`·`acceptInvite` 세 곳에서 사용 확인 |
| 보안 — 로그인 실패 시 이메일 존재 여부 노출 없음 | ✅ 미존재 이메일·잘못된 비번 모두 401 균일 (`auth-test.json` T7) |
---

## 2. HR_MANAGER 도메인 `/hiring-surveys`, `/plan-reports`, `/recruitment/job-postings`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-HR_MANAGER.json` 49/49 PASS, p(95) 278ms  · VU 2|
| Stress (baseline · no cache) | ✅ `stress-HR_MANAGER.json` p(95) 2,060ms · threshold 초과 · RPS 78 · VU peak 200 |
| Stress (Redis cache 적용) | ✅ `stress-HR_MANAGER-redis.json` p(95) **544ms** · RPS **155** · threshold 통과 — **3.78× p95 · 2× 처리량** · VU peak 200 |
| Stress (Redis endpoint + userStatusCache) | ✅ `stress-HR_MANAGER-userstatus.json` p(95) **35ms** · RPS **228** — baseline 대비 **59×** (auth 미들웨어 isDeleted 캐시 도입 효과) · VU peak 200 |
| 보안 — Cross-role 접근 차단 | ✅ **FIXED** — `fix/hr-cross-role` (lib/hrGuards.ts) 로 `/hiring-surveys`·`/plan-reports`·`/approved-hr` 전부 requireReadHR 적용 → PLAYER·ASSET_MANAGER 403 확인 (`cross-role-test.json` 재프로브) |

---

## 3. HEAD_COACH 도메인 `/training`, `/players`, `/tactical`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-HEAD_COACH.json` 55/55 PASS, p(95) 199ms  · VU 2|
| Stress | ✅ `stress-HEAD_COACH.json` p(95) 1,059ms · threshold 통과 · RPS 128 (최고 처리량)  · VU peak 200|
| 보안 — Cross-role 접근 차단 | 🔲 pentest 미커버 (`/training`·`/players`·`/tactical` 별도 프로브 필요) |

---

## 4. FINANCE_MANAGER 도메인 `/operating-expenses`, `/budget-control`, `/financial-reports`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-FINANCE_MANAGER.json` 65/65 PASS, p(95) 243ms  · VU 2|
| Stress (baseline · no cache) | ✅ `stress-FINANCE_MANAGER.json` p(95) 3,563ms · threshold 1.8배 초과 · RPS 65 · VU peak 200 |
| Stress (Redis cache 적용) | ✅ `stress-FINANCE_MANAGER-redis.json` p(95) **2,517ms** · RPS 69.9 — **1.4× p95 개선** (여전히 threshold 초과) · VU peak 200 |
| Stress (Redis endpoint + userStatusCache) | ✅ `stress-FINANCE_MANAGER-userstatus.json` p(95) **439ms** · RPS **223** — baseline 대비 **8.1×** (auth 미들웨어 isDeleted 캐시 도입 효과) · VU peak 200 |
| 단발 요청 캐시 개선 | ✅ /operating-expenses 149→12ms · /budget-control 76→10ms · /plan-requests 65→19ms |
| 성능 — 잔여 p95 병목 조사 | 🔲 Prisma pool · JSON 직렬화 · ramp-up 초기 miss 등 후속 분석 |
| 보안 — Cross-role 접근 차단 | ✅ **BLOCKED** — 3 endpoint 전부 PLAYER · HR · ASSET 세션에 403 반환 (guard 정상) |

---

## 5. ASSET_MANAGER 도메인 `/equipment`, `/asset-requests`, `/equipment/loans`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-ASSET_MANAGER.json` 55/55 PASS, p(95) 207ms  · VU 2|
| Stress (baseline · no cache) | ✅ `stress-ASSET_MANAGER.json` p(95) 3,142ms · threshold 1.6배 초과 · RPS 63 · VU peak 200 |
| Stress (Redis cache 적용) | ✅ `stress-ASSET_MANAGER-redis.json` p(95) **2,281ms** · RPS **86.6** — **1.4× p95 · 1.4× 처리량** (여전히 threshold 근접 초과) |
| Stress (Redis endpoint + userStatusCache) | ✅ `stress-ASSET_MANAGER-userstatus.json` p(95) **48ms** · RPS **239** — baseline 대비 **65×** (auth 미들웨어 isDeleted 캐시 도입 효과) · VU peak 200 |
| Stress (post-#551 dueDate 도입 후) | ✅ `results-2026-09-29/stress-ASSET_MANAGER-post551.json` p(95) **19.48ms** · RPS **254** — 이전 최저 대비 **2.5× 추가 개선** · VU peak 198 · dueDate NOT NULL/overdue index 추가로 인한 회귀 없음 |
| 단발 요청 캐시 개선 | ✅ /asset-requests 105→13ms · /equipment/loans · /equipment 캐시 hit 확인 |
| 성능 — 잔여 p95 병목 조사 | 🔲 GM 만큼 극적 개선 없음, DB pool/JSON 처리 후속 |
| 보안 — Cross-role 접근 차단 | ✅ **LEAK** — `/equipment`·`/asset-requests`·`/equipment/loans` 를 HR_MANAGER 세션이 200 반환. PLAYER 는 `/asset-requests` 만 200 (나머지 403) |

---

## 6. GM 도메인 `/plan-reports?filter=pending-final`, `/reports?filter=pending-final`, `/hiring-dispatches?filter=pending-dispatch`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-GM.json` 49/49 PASS, p(95) 296ms  · VU 2|
| Stress (baseline · no cache) | ✅ `stress-GM.json` p(95) 6,395ms · threshold 3배 초과 · RPS 40 · VU peak 200 |
| Stress (Redis cache 적용) | ✅ `stress-GM-redis.json` p(95) **690ms** · threshold 통과 · RPS **139.7**  · VU peak 200· reqs 14,878 — **9.3× p95 개선 · 3.4× 처리량** |
| Stress (Redis endpoint + userStatusCache) | ✅ `stress-GM-userstatus.json` p(95) **40ms** · RPS **221** — baseline 대비 **161×** (auth 미들웨어 isDeleted 캐시 도입 효과) · VU peak 200 |
| 성능 — 3개 endpoint 개별 분해 러닝 | ✅ `gm-breakdown/stress-GM_{PLAN,REPORTS,DISPATCHES}.json` — Redis 활성 상태에서 각 335·217·266ms · 전부 threshold 통과 · 단일 병목 없음 |
| 보안 — Cross-role 접근 차단 | ✅ **FIXED** — `fix/gm-perf-rbac` 로 3 controller (plan-report·report·hiring-dispatch) 에 `filter === 'pending-*' && !isAdminLike(role) → 403` 삽입 · PLAYER·HR·ASSET 재프로브 9/9 BLOCKED |
| 보안 — GM authorized-access smoke | ✅ `gm-access-smoke.json` 17/17 AUTHORIZED (isAdminLike → 전 도메인 정상 접근 확인) |

---

## 7. PLAYER 도메인 `/players`, `/training`, `/notifications/my`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-PLAYER.json` 55/55 PASS, p(95) 144ms (최저 지연)  · VU 2|
| Stress | ✅ `stress-PLAYER.json` p(95) 2,035ms · threshold 근접 초과 · RPS 83 · VU peak 200 |
| 보안 — Cross-player IDOR | 🔲 개별 선수 계정 상호 세션 테스트 미러닝 (rate-limit blocker) |
| 보안 - 타선수의 계약을 볼순없다|🔲|

---

## 8. MEDICAL_DIRECTOR 도메인 `/injuries/active`, `/medical-equipment-loan`, `/medical-expenses`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-MEDICAL_DIRECTOR.json` 49/49 PASS, p(95) 195ms  · VU 2|
| Stress | ✅ `stress-MEDICAL_DIRECTOR.json` p(95) 1,827ms · threshold 근접 · RPS 98 · VU peak 200 |
| 보안 — Cross-role 접근 차단 | ✅ **부분 LEAK** — `/injuries/active` 는 403 정상, `/medical-equipment-loan`·`/medical-expenses` 는 PLAYER · HR · ASSET 모두 200. **의료 개인정보 노출** (GDPR 관점 심각) |
| 보안 — GDPR 개인정보 스코프 검증 | 🔲 guardian 계정 접근 범위 미검증 |

---

## 9. Contracts `/contracts/:id`, `/contracts/:id/*` (5 sub-actions)

> 계약금 · 서명 보너스 · 에이전시 커미션 · 바이아웃 조항 포함 · sensitive

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ➖ (persona endpoint set 에 미포함) |
| Stress | ➖ |
| 보안 — IDOR (Player → 타 선수 계약 조회) | ✅ **LEAK** — PLAYER 세션 임의 ID 1~20 전부 200 응답 (`pentest.json` verdict LEAK) |
| 보안 — IDOR (HR → 타 계약 조회) | ✅ **LEAK** — HR_MANAGER 세션도 20/20 건 200 |
| 보안 — owner-scope guard 추가 | 🔲 `contract.routes.ts` `GET /:id` 미들웨어 삽입 필요 (`playerId === req.user.id` OR role∈[GM,FINANCE_MANAGER,HR_MANAGER]) |
| Regression — `apps/api/__test__/contract/contract.access.test.ts` | 🔲 |
| Sub-actions `/contracts/:id/clauses`·`/extensions`·`/bonuses` 프로브 | 🔲 미커버 |

---

## 10. Notifications `/notifications/:id`, `/notifications/:id/read`

> 인증만 필요 · recipient 본인만 접근·마킹 가능해야 함

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `PLAYER` 페르소나 `/notifications/my` 포함 |
| Stress | ➖ (`writeWorkflow` 시나리오는 별도) |
| 보안 — GET IDOR (타 유저 알림 조회) | ✅ 404 반환 (PLAYER · HR 두 세션 전부 20/20 건 404) |
| 보안 — PATCH `/read` IDOR | ✅ **LEAK** — HR_MANAGER 세션이 임의 ID 2건 read 마킹 성공 |
| 보안 — recipient guard 추가 | 🔲 PATCH `/:id/read` 앞단 `recipientUserId === req.user.id` 검증 필요 |

---

## 11. Financial Reports `/financial-reports/:id`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ FINANCE_MANAGER `/financial-reports/1` 포함 |
| Stress | 🔲 FINANCE 페르소나 stress 병목에 포함 (섹션 4 참조) |
| 보안 — IDOR (PLAYER · HR → 타 시즌 조회) | ✅ 두 세션 모두 20/20 건 401/403 반환 (`pentest.json` verdict PASS) |

---

## 12. Injuries `/injuries/:id`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ MEDICAL_DIRECTOR `/injuries/active` 포함 |
| Stress | 🔲 MEDICAL 페르소나 stress 근접 초과 |
| 보안 — IDOR (PLAYER · HR → 부상 상세 조회) | ✅ 두 세션 모두 20/20 건 401/403 반환 (verdict PASS) |
| 보안 — Player 본인 부상 조회 허용 여부 | 🔲 미검증 |

---

## 13. Payroll `/payroll/:id`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ➖ (persona endpoint set 에 미포함) |
| Stress | ➖ |
| 보안 — IDOR (PLAYER · HR → 급여 명세 조회) | ✅ 두 세션 모두 20/20 건 404 (verdict PASS) |
| 보안 — Sub-actions `/payroll/:id/approve`·`/cancel`·`/salaries` 등 11건 프로브 | 🔲 미커버 |
| 보안 — 재무팀장 · GM · 관리자 + HR · 나머지 401/403 | ✅ **FIXED** (PR #570 · closes #565) — `canReadPayroll` / `canWritePayroll` helper 도입. `role-boundary-probe.k6.js` 재실행 `boundary_leaks=0` 검증. Payroll 은 Finance + HR (급여 계산·4대보험·원천세) 공동 접근 정책. 43 unit tests 통과 |
| 보안 — enumerable IDOR (StaffSalary + PayrollRun) | ✅ **CUID 전환 완료** (#598 tracer 7 · `refactor/payroll-cuid-598`) — `StaffSalary.id`·`PayrollRun.id Int → String @default(cuid())` + `StaffAllowance.staffSalaryId Int → String` + `PayrollRun.staffSalaryId Int → String`. PayrollConfig 는 int 유지 (rate 테이블). LedgerEntry.relatedId 는 Int 유지, cuid runId 는 description 에 포함. 85/85 payroll 테스트 통과, 25 fail = main pre-existing. **#598 옵션 A 완료 (6/6)** |

---

## 14. Operating Expenses `/operating-expenses/:id`, Medical Expenses `/medical-expenses/:id`, Employee Contracts `/employee-contracts/:id`, Players `/players/:id`

| 항목 | 상태 | 비고 |
|---|---|---|
| 보안 — IDOR (양 세션 임의 ID 프로브) | ✅ 전부 404 반환 (verdict PASS) — record 미존재 · guard 여부는 별도 확인 필요 |
| 보안 — 실제 존재하는 ID (record hydration 후) 재프로브 | ✅ **FIXED** `loadtest/pentest-real-ids.mjs` (#566/PR #591) — DB 실 ID + 5 attacker role 매트릭스 프로브 405 req · 25 LEAK 발견 (`results-2026-09-30/pentest-real-ids-566/`) |
| Sub-actions 프로브 (총 30+ 건) | ✅ 부분 커버 — OperatingExpense 6 sub-action × 5 attacker = 150 프로브 통과. Contract·Player·Injury·PayrollRun·FinancialReport·Notification 각 sub-action 커버. MedicalExpense·EmployeeContract 는 seed 부재로 skip |
| 보안 — /players/:id/training-results LEAK 파치 | ✅ **FIXED** PLAYER 만 self-scope, HR/ASSET/FACILITY/GUARDIAN 무제한 통과 → allow-list 재설계 (#590/PR #592). 회귀 테스트 13/13 pass |
| 보안 — /contracts/:id HR_MANAGER 접근 | ✅ 정책상 정상 (HR 이 급여 실무 담당) — 오탐 확정 |
| 후속 — MedicalExpense·EmployeeContract seed 추가 후 재프로브 | 🔲 record 부재로 이번 매트릭스 커버 못 함 |
| 보안 — enumerable IDOR (MedicalExpense) | ✅ **CUID 전환 완료** (#598 tracer 3 · `refactor/medical-expense-cuid-598`) — `MedicalExpense.id Int → String @default(cuid())`. `notification.repo` 전체 method 를 `entityId?: number | string` 유니온으로 리팩터 (`entityIdField` 헬퍼 도입, 남은 `as any` 제거). curl 검증: cuid 200 · int 400 · ABC 400 · list 200 |

---

## 15. Definite-Sensitive 미커버 도메인 (`id-routes-classified.json` definite bucket · 153건 · 31 prefix)

> ℹ️ **재사용 가능**: `loadtest/pentest-real-ids.mjs` (PR #591) 에 각 도메인 sub-action 을 `targets()` 에 추가하면 동일 패턴으로 즉시 확장 가능.
> DB 실 ID 자동 수집 + 5 attacker role 매트릭스 프로브 로직 검증 완료.

| 항목 | 상태 | 비고 |
|---|---|---|
| `/sponsorships/:id/*` (12) IDOR 프로브 | 🔲 |
| `/budget-control/:id/*` (11) IDOR 프로브 | 🔲 |
| `/hiring-surveys/:id/*` (11) IDOR 프로브 | 🔲 |
| `/monthly-settlement/:id/*` (7) IDOR 프로브 | 🔲 |
| `/hiring-dispatches/:id/*` (8) IDOR 프로브 | 🔲 |
| `/academy-fees/:id/*` (9) IDOR 프로브 | 🔲 |
| `/sales/:id/*` (5) IDOR 프로브 | 🔲 |
| `/ledger/:id/*` (2) IDOR 프로브 | 🔲 |
| `/acquisition-surveys/:id/*` (4) IDOR 프로브 | 🔲 |
| `/staff-records/:id/*` (2) IDOR 프로브 | 🔲 · #580 파치로 probation-review 만 확인 (2 route 중 1) |
| `/pii-access/:id/*` (2) IDOR 프로브 | 🔲 |
| `/medical-equipment-loan/:id/*` (3) IDOR 프로브 | 🔲 |
| `/safeguard-reports/:id/*` (2) IDOR 프로브 | ✅ **CUID 전환 완료** (#598 tracer · `refactor/safeguard-report-cuid-598`) — `SafeguardReport.id Int → String @default(cuid())`. `apps/api/src/lib/cuidGuard.ts` 신설 (`cuidRouter()` 팩토리). enumerable IDOR 방어 (`/safeguard-reports/1` → 400 INVALID_ID). ripple: `ExternalReport.safeguardReportId Int? → String?`, `Notification.entityIdStr String?` 추가. curl 검증: create 201 cuid 발급 · GET cuid 200 · GET ABC/1 400 · list 200 |
| `/player-callups/:id/*` (6) IDOR 프로브 | 🔲 |
| `/youth-registrations/:id/*` (4) IDOR 프로브 | 🔲 |
| `pentest.mjs` `TARGETS` 데이터 드라이브화 | 🔲 `id-routes-classified.json` 에서 로드 |

---

## 15.5 소속 스코프 (Multi-tenant Isolation) 검증 — 전 도메인 (#595)

> ⚠️ 현 pentest 매트릭스 (`pentest-real-ids.mjs` · `cross-role-test.k6.js`) 는 **단일 구단 `@club.com` seed 만 커버**.
> 다른 구단 · 다른 부서 · 다른 팀 소속 유저가 우리 record 에 접근 가능한지는 **미검증**.
> 이 섹션은 seed 확장 후 순차 프로브 대상.

### 15.5.0 Seed / Fixture 확장

| 항목 | 상태 | 비고 |
|---|---|---|
| 2번째 구단 (Club B) seed — 전 role 최소 1명씩 (ADMIN·GM·HR·FINANCE·ASSET·MEDICAL·PLAYER·COACH) | 🔲 | multi-tenant 격리 프로브 전제조건 |
| 2번째 부서 (Dept B) seed — 부서장 (DEPT_HEAD) + 부서원 (LEADER · MEMBER) | 🔲 | dept scope 프로브 전제조건 |
| 2번째 팀 (Team B) seed — 헤드코치 + 어시스턴트 + 선수 3명 | 🔲 | team scope 프로브 전제조건 |
| `pentest-real-ids.mjs` attacker 매트릭스에 cross-tenant persona 추가 (`clubB_GM`, `clubB_ADMIN`, `otherDept_HEAD`, `otherTeam_COACH`) | 🔲 | 프로브 스크립트 확장 |
| `personas.k6.js` 에 Club B / Dept B / Team B persona 추가 | 🔲 | k6 스트레스 매트릭스에서도 재사용 |

### 15.5.1 소속 구단 (`clubId`) 스코프 — Club B 유저가 Club A record 접근 시 403/404 여야 함

| 도메인 | 예상 스코프 필드 | 상태 | 비고 |
|---|---|---|---|
| `GET /contracts/:id` | `player.clubId` | 🔲 | 계약금 · 서명 보너스 노출 |
| `GET /transfers/:id` | `player.clubId` | 🔲 | 이적 조건 노출 |
| `GET /transfer-requests/:id` | `player.clubId` | 🔲 | 협상 데이터 |
| `GET /payroll/:id` | `employee.clubId` | 🔲 | 급여 명세 |
| `GET /medical-expenses/:id` | `clubId` | 🔲 | 의료비 개인정보 |
| `GET /operating-expenses/:id` | `clubId` | 🔲 | 재무 |
| `GET /financial-reports/:id` | `clubId` | 🔲 | 재무 |
| `GET /matches/:id` | `homeTeam.clubId` OR `awayTeam.clubId` | 🔲 | 경기 데이터 |
| `GET /players/:id` | `player.clubId` | 🔲 | 선수 상세 · 시장가치 |
| `GET /injuries/:id` | `player.clubId` | 🔲 | 의료 GDPR |
| `GET /prospects/:id` | `clubId` (이미 스코프됨) | ✅ 코드 확인 | 참고 예시 |
| `GET /partners/:id` | `clubId` | 🔲 | 파트너 계약 |
| `GET /sponsorships/:id` | `clubId` | 🔲 | 스폰서 계약금 |
| `GET /equipment/:id` | `clubId` | 🔲 | 자산 명세 |
| `GET /academy-fees/:id` | `clubId` | 🔲 | 유소년 수업료 |
| `GET /training/:id` (세션) | `team.clubId` | 🔲 | 훈련 데이터 |
| `GET /formation-snapshots/:id` | `team.clubId` | 🔲 | 전술 데이터 |

### 15.5.2 소속 부서 (`deptId`) 스코프 — 다른 부서 소속 유저가 우리 부서 record 접근 시 403 여야 함

| 도메인 | 예상 스코프 필드 | 상태 | 비고 |
|---|---|---|---|
| `GET /departments/:id` | `dept.id === user.deptId` (또는 상위 부서장) | 🔲 | 부서 정보 |
| `GET /departments/:id/headcount` | 위와 동일 | 🔲 | 인원 수 |
| `GET /staff-records/:id` | `staff.deptId` | 🔲 | 인사 기록 |
| `GET /probation-reviews/:id` | `subject.deptId` | 🔲 | 수습 평가 |
| `GET /employee-contracts/:id` | `employee.deptId` | 🔲 | 근로 계약 |
| `GET /development-plans/:id` | `subject.deptId` | 🔲 | 개인 개발 계획 |
| `GET /department-review-configs/:id` | `deptId` | 🔲 | 부서별 리뷰 설정 |
| `GET /department-asset-kits/:id` | `deptId` | 🔲 | 부서별 자산 키트 |
| `GET /onboarding-tasks/:id` | `assignee.deptId` OR `task.deptId` | 🔲 | 온보딩 태스크 |
| `GET /hiring-dispatches/:id` | `posting.deptId` | 🔲 | 채용 파견 |
| `GET /hiring-surveys/:id` | `posting.deptId` | 🔲 | 채용 서베이 |
| `GET /plan-reports/:id` | `report.deptId` | 🔲 | 부서 보고서 |
| `GET /plan-reviews/:id` | `subject.deptId` | 🔲 | 부서 리뷰 |

### 15.5.3 소속 팀 (`teamId`) 스코프 — 다른 팀 코치가 우리 팀 데이터 접근 시 403 여야 함

| 도메인 | 예상 스코프 필드 | 상태 | 비고 |
|---|---|---|---|
| `GET /teams/:id` | `team.id === user.teamId` (또는 상위 코치) | 🔲 | 팀 정보 |
| `GET /formation-snapshots/:id` | `snapshot.teamId` | 🔲 | 전술 |
| `GET /tactical/:id` | `analysis.teamId` | 🔲 | 전술 분석 · 미디어 |
| `GET /training-loads/:id` | `session.teamId` | 🔲 | 훈련 부하 |
| `GET /training/:id` | `session.teamId` | 🔲 | 훈련 세션 상세 |
| `GET /training/:id/results` | 위와 동일 | 🔲 | 훈련 결과 |
| `GET /player-callups/:id` | `callup.teamId` | 🔲 | 소집 명단 |
| `GET /squad-plan/:id` | `plan.teamId` | 🔲 | 스쿼드 플랜 |
| `GET /matches/:id/squad` | `match.homeTeamId` OR `match.awayTeamId` | 🔲 | 스쿼드 |
| `GET /matches/:id/lineup` | 위와 동일 | 🔲 | 라인업 |
| `GET /coach-availabilities/:id` | `coach.teamId` | 🔲 | 코치 가용성 |
| `GET /coaching-staff/:id` | `staff.teamId` | 🔲 | 코칭 스태프 |
| `GET /growth-reports/:id` | `subject.teamId` (선수 소속) | 🔲 | 성장 리포트 |

### 15.5.4 서비스 레이어 코드 감사 (구현 gap)

| 도메인 | `req.user.clubId/deptId/teamId` 전달 여부 | 상태 |
|---|---|---|
| ContractService | 🔲 미확인 (grep 결과 clubId 인자 없음) | 🔲 감사 필요 |
| TransferService | 🔲 미확인 | 🔲 |
| PayrollService | 🔲 미확인 | 🔲 |
| MedicalExpenseService | 🔲 미확인 | 🔲 |
| MatchService | 🔲 미확인 | 🔲 |
| DepartmentService | 🔲 미확인 | 🔲 |
| StaffRecordService | 🔲 미확인 | 🔲 |
| TacticalService | 🔲 미확인 | 🔲 |
| TrainingService | 🔲 미확인 | 🔲 |
| ProspectService | ✅ 이미 `clubId` 스코프 (참고 구현) | ✅ |
| ClubService | ✅ 이미 `clubId` 스코프 | ✅ |

> 감사 후 gap 있는 서비스는 개별 이슈로 분해 (#595 서브이슈).

---

## 16. 다중 역할 확장 커버리지 (Multi-Role Extended Personas · stress 러닝 완료)

| 항목 | 상태 | 비고 |
|---|---|---|
| ADMIN `admin@club.com` (baseline) | ✅ `stress-ADMIN.json` p(95) **5,586ms** · RPS 50 · threshold 2.8× 초과 · VU peak 200 |
| ADMIN `admin@club.com` (Redis cache 적용) | ✅ `stress-ADMIN-redis.json` p(95) **686ms** · RPS **148** · threshold 통과 — **8.1× p95 개선 · 2.9× 처리량** · VU peak 200 |
| SUPERADMIN `superadmin@platform.com` | ✅ `stress-SUPERADMIN.json` p(95) 2,515ms · RPS 77 · threshold 살짝 초과 · VU peak 200 |
| HR_STAFF `hr.staff@club.com` | ✅ `stress-HR_STAFF.json` p(95) 1,554ms · RPS 123 · **fail 66.66%** (2/3 endpoint 4xx — `/onboarding-tasks`·`/recruitment/job-postings` 미접근 or 없음) · VU peak 200 |
| FINANCE_STAFF `finance.staff@club.com` | ✅ `stress-FINANCE_STAFF.json` p(95) 1,449ms · RPS 116 · threshold 통과 · Redis 캐시 재사용 효과 · VU peak 200 |
| ASSET_STAFF `asset.staff@club.com` | ✅ `stress-ASSET_STAFF.json` p(95) 1,120ms · RPS 129 · threshold 통과 · VU peak 200 |
| FACILITY_MANAGER `facility.manager@club.com` | ✅ `stress-FACILITY_MANAGER.json` p(95) 1,043ms · RPS 152 · **fail 33.33%** (1/3 endpoint) · VU peak 200 |
| FACILITY_STAFF `facility.staff@club.com` | ✅ `stress-FACILITY_STAFF.json` p(95) 1,211ms · RPS 145 · **fail 33.33%** · VU peak 200 |
| ASSISTANT_COACH `assistant@club.com` | ✅ `stress-ASSISTANT_COACH.json` p(95) 1,111ms · RPS 114 · threshold 통과 · VU peak 200 |
| ATTACKING_COACH `attacking@club.com` | ✅ `stress-ATTACKING_COACH.json` p(95) 941ms · RPS 147 · **fail 33.33%** (`/formation-snapshots` 추정) · VU peak 200 |
| DEFENSIVE_COACH `defensive@club.com` | ✅ `stress-DEFENSIVE_COACH.json` p(95) 1,050ms · RPS 135 · **fail 33.33%** · VU peak 200 |
| 성능 — ADMIN `/admin/audit-logs` 단독 도메인별 stress | 🔲 5.6s 병목 정확히 지목 필요 (Redis 미적용) |
| 성능 — HR_STAFF 4xx endpoint 지목 | 🔲 3개 endpoint 개별 status 확인 (persona 정의 재검토) |
| 성능 — coaching variant 4xx endpoint 지목 | 🔲 `/formation-snapshots` 존재 여부 확인 |
| GK/PHYSICAL/SETPIECE/YOUTH/MEDICAL/FO/TD 등 나머지 role login-sweep | 🔲 rate-limit 5분+ 쿨다운 후 재시도 |
| Guardian 세션 8건 login-sweep + GDPR 스코프 검증 | 🔲 rate-limit blocker |
| 개별 선수 계정 7건 cross-IDOR | 🔲 rate-limit blocker |

---

## 17. Load Balancer 모드 재측정 (`docker-compose.loadtest.yml` · 2 replica + nginx)

| 항목 | 상태 | 비고 |
|---|---|---|
| Compose 스택 부트 | 🔲 Burp Suite 가 3002 포트 점유 중 (proxy listener) → free 후 재시도 |
| 도메인별 stress 재러닝 (BASE_URL=3002) | 🔲 single-instance 대비 처리량 증가율 정량화 |
| `X-Upstream` 헤더 기반 round-robin 분배 균등성 확인 | 🔲 `lb_upstream_hits` metric |

---

## 18. Documentation 정정

| 항목 | 상태 | 비고 |
|---|---|---|
| `photophoio.md` line 66 UUID v4·403 주장 개정 | 🔲 pentest.json 이 falsify — 실측 반영 or UUID 마이그레이션 후 재테스트 |
| `personas.k6.js` PERSONA 필터 사용법 README 추가 | 🔲 |
| CI matrix (`.github/workflows/loadtest.yml`) 에 PERSONA 축 추가 | 🔲 nightly 도메인별 회귀 자동 감지 |

---

---

# 🆕 미커버 도메인 스켈레톤 (2026-09-27 추가)

## 🏟️ 시설·자산

### 19. `facility` `/facility`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 20. `department-asset-kit` `/department-asset-kits`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 21. `inventory` `/inventory`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 22. `video` `/videos`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 23. `medical-equipment-loan` `/medical-equipment-loan`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 💼 트랜스퍼·에이전시

### 24. `transfer` `/transfers`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |
| 🐛 `GET /transfers/recalls` → 500 | ✅ **FIXED** (#564) — `/:id` 가 `/recalls` 앞에 정의돼 admin 세션이 `Number("recalls")=NaN` 으로 Prisma 500. 라우트 순서 재배치 + `getRecalls` ADMIN/GM rbac + `?status` enum 검증 (400) + `:id` NaN 방어 (400 INVALID_ID). Burp Repeater 재프로브: admin/GM 200, HR/PLAYER 403, status=BOGUS 400, /transfers/abc 400 |

---

### 25. `transfer-request` `/transfer-requests`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 26. `agency` `/agencies`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## ⚽ 팀·시즌·경기

### 27. `team` `/teams`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 28. `season` `/seasons`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 29. `league` `/leagues`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 30. `match` `/matches`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 31. `club` `/clubs`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 32. `club-settings` `/club-settings`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 🏃 코치·훈련 세부

### 33. `coach` `/coaches`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 34. `coach-availability` `/coach-availabilities`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 35. `coaching-staff` `/coaching-staff`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 36. `training-load` `/training-loads`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 37. `training-reference` `/training-references`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 💰 재무·예산 세부

### 38. `budget` `/budget`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 39. `budget-automation` `/budget-automation`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 40. `budget-plan` `/ (plan-request)`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 41. `expense-category` `/expense-categories`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 42. `revenue-adjustment` `/revenue-adjustment`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 43. `account-code` `/account-codes`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 👥 HR 세부

### 44. `hiring-automation` `/hiring-automation`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 45. `hr` `/hr`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 46. `hr-report` `/hr-report`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 47. `staff-record` `/staff-records`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 48. `onboarding-task` `/onboarding-tasks`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 49. `onboarding-template` `/onboarding-templates`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 50. `mandatory-minimum` `/mandatory-minimum`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 51. `jobs` `/jobs`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 52. `probation-review` `/probation-reviews`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 📊 리포트·리뷰·분석

### 53. `ops-report` `/ops-reports`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 54. `plan-review` `/plan-reviews`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 55. `incident-report` `/incident-reports`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ ADMIN/HR/COACH/MEDICAL/GM 세션 200 (2026-09-30 curl 실측) |
| Stress | ✅ p(95) 102ms · VU peak 200 (별도 스크립트 discarded 후 curl 실측 유지) |
| 보안 — 인증 없는 접근 차단 (401) | ✅ 무인증 → 401 UNAUTHORIZED |
| 보안 — Cross-role IDOR 프로브 | ⚠️ **LEAK · 이슈 #589 등록** — ASSET_MANAGER · FACILITY_MANAGER · FINANCE_MANAGER 200 (사고 보고서 열람) |
| 보안 — Write endpoint 권한 경계 | ⚠️ 위와 동일 원인 (`ALLOWED_ROLES` 에 FRONT_OFFICE 전체 통과) — #589 파치 대상 |
| 보안 — Fix `incident-report.controller.ts` ALLOWED_ROLES 축소 | 🔲 #589 파치 대기 (#580 probation-review 와 동일 패턴) |
| 보안 — enumerable IDOR (int id 열거) | ✅ **CUID 전환 완료** (#598 tracer 2 · `refactor/incident-report-cuid-598`) — `IncidentReport.id Int → String @default(cuid())`. `ExternalReport.incidentReportId Int? → String?`. `notification.repo.createForGuardian` 시그니처 `number | string` 확장. curl 검증: cuid 200 · int 400 · ABC 400 · list 200 |

---

### 56. `growth-report` `/growth-reports`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 57. `development-plan` `/development-plans`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 58. `dashboard` `/dashboard`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 59. `analysis` `/analysis`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 🛡️ 보호자·유스·안전

### 60. `guardian` `/guardians`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## ⚙️ 워크플로우·설정

### 61. `attendance-appeal` `/attendance-appeals`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 62. `department-review-config` `/department-review-configs`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 63. `formation-snapshot` `/formation-snapshots`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 64. `squad-plan` `/squad-plan`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 65. `tactical` `/tactical`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 66. `certification` `/certification`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 🌐 인프라·유틸

### 67. `country` `/countries`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 68. `i18n` `(no router)`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 69. `middleWare` `(shared middleware)`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

### 70. `webhook` `/webhook`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 📦 기타

### 71. `software-license` `/software-licenses`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

---

## 🚨 Cross-Role RBAC 프로브 결과 요약 (`cross-role-test.json`)

45 프로브 (3 attacker × 15 endpoint) → **10 LEAK / 35 BLOCKED (22% 취약).**  
(baseline: 23 LEAK / 22 BLOCKED · `fix/hr-cross-role` 로 6건 · `fix/gm-perf-rbac` 로 7건 추가 해소)

### 📊 Owner 도메인별 취약도 (HR + GM fix 후)

| Owner 도메인 | 총 프로브 | LEAK | BLOCKED | 취약도 | 비고 |
|---|---|---|---|---|---|
| MEDICAL_DIRECTOR | 9 | 6 | 3 | 67% ❌ | 미해결 · GDPR 개인정보 |
| ASSET_MANAGER | 6 | 4 | 2 | 67% ❌ | 미해결 |
| **GM** | 9 | **0** | 9 | **0%** ✅ | `fix/gm-perf-rbac` 로 완료 (controller 내부 filter check) |
| **HR_MANAGER** | 6 | **0** | 6 | **0%** ✅ | `fix/hr-cross-role` 로 완료 |
| FINANCE_MANAGER | 9 | 0 | 9 | **0%** ✅ | 원래부터 정상 |
| ADMIN | 6 | 0 | 6 | **0%** ✅ | 원래부터 정상 |

### 📋 Endpoint 별 상세 — 어느 role 이 뚫었는지

| Owner | Endpoint | 뚫은 role | 판정 |
|---|---|---|---|
| **GM** | `/plan-reports?filter=pending-final` | PLAYER · HR · ASSET | 🚨 전 role LEAK |
| **GM** | `/reports?filter=pending-final` | PLAYER · HR · ASSET | 🚨 전 role LEAK |
| **GM** | `/hiring-dispatches?filter=pending-dispatch` | PLAYER · HR · ASSET | 🚨 전 role LEAK |
| **MEDICAL** | `/medical-equipment-loan` | PLAYER · HR · ASSET | 🚨 전 role LEAK · GDPR |
| **MEDICAL** | `/medical-expenses` | PLAYER · HR · ASSET | 🚨 전 role LEAK · GDPR |
| MEDICAL | `/injuries/active` | — | ✓ BLOCKED |
| HR | `/hiring-surveys` | PLAYER · ASSET | 🚨 LEAK (2 role) |
| HR | `/plan-reports` | PLAYER · ASSET | 🚨 LEAK (2 role) |
| HR | `/recruitment/job-postings` | — | ✓ BLOCKED |
| ASSET | `/asset-requests` | PLAYER · HR | 🚨 LEAK (2 role) |
| ASSET | `/equipment` | HR | 🚨 LEAK (HR only) |
| ASSET | `/equipment/loans` | HR | 🚨 LEAK (HR only) |
| FINANCE | `/operating-expenses?seasonId=1` | — | ✓ BLOCKED |
| FINANCE | `/budget-control` | — | ✓ BLOCKED |
| FINANCE | `/financial-reports/1` | — | ✓ BLOCKED |
| ADMIN | `/admin/audit-logs` | — | ✓ BLOCKED |
| ADMIN | `/admin/users` | — | ✓ BLOCKED |

**패턴 관찰:**
- ✅ **FINANCE · ADMIN 도메인** — role guard 완벽 (전 endpoint 403)
- ❌ **GM 도메인** — filter query 만 있고 role 검증 미들웨어 부재 (pending-* 리스트 전 role 노출)
- ❌ **MEDICAL 도메인** — `/injuries/active` 는 정상, `/medical-equipment-loan`·`/medical-expenses` 는 open. 의료 개인정보 GDPR 위반 소지
- ⚠️ **HR / ASSET 도메인** — endpoint 별 편차 (일부만 guard). 미들웨어 일괄 적용 안 됨

**후속 조치 필요:**
- `apps/api/src/hiring-survey/hiring-survey.routes.ts` · `apps/api/src/plan-report/plan-report.routes.ts` — `authorize(['HR_MANAGER', 'ADMIN'])` 유형 role guard 추가
- `equipment.routes.ts`·`asset-request.routes.ts`·`equipment/loans` — ASSET_MANAGER · ADMIN 만 허용
- `plan-report.routes.ts`·`report.routes.ts`·`hiring-dispatch.routes.ts` — filter=pending-* 는 GM · ADMIN 만
- `medical-equipment-loan.routes.ts`·`medical-expense.routes.ts` — MEDICAL_DIRECTOR · ADMIN 만

---

## 공통 보안 테스트 (전 도메인)

| 항목 | 상태 | 비고 |
|---|---|---|
| Rate Limiting (`/auth/login` 브루트포스) | ✅ 10건 이후 429 · 5분+ sliding window 로 재시도 지속 차단 |
| IDOR (숫자 ID 열거 접근) | 🔲 10 endpoint 프로브 결과 3건 LEAK (`/contracts/:id`, `/notifications/:id/read`) — 나머지 360 endpoint 미커버 |
| 인증 없는 접근 차단 (401) | 🔲 미러닝 |
| 인증 우회 (토큰 없음/변조/alg:none) | 🔲 미러닝 |
| 오버사이즈 문자열 / SQL injection 퍼징 | ✅ **부분 FIXED** (#571 · PR: `fix/id-input-validation-571`) — `common-security-probe.k6.js sql_fuzz` 에서 `/departments/:id`·`/matches/:id`·`/contracts/:id` 500 확인. 원인: Prisma parameterized query 라 실 SQL injection 위험 없으나 `Number(req.params.id) = NaN` 이 Prisma 검증 500 유발. `apps/api/src/lib/idParamGuard.ts` + `intIdRouter()` 팩토리로 79 sub-router 자동 변환, 컨트롤러 도달 전 400 INVALID_ID. UUID :id (player·auth·admin) 는 기존 `requireUuidParam` 유지 (skip). curl 재프로브: 6개 SQL/특수문자 페이로드 모두 400 |
| 에러 메시지 스택트레이스 노출 여부 | 🔲 미러닝 |
| XSS 저장 후 프론트 sanitize | 🔲 미러닝 |
| 탈취 계정 남용 (mass-write rate limit) | 🔲 미러닝 · admin/create endpoint 별 rate-limit 유무 확인 필요 |
| 비밀번호 해싱 |🔲|
| 개인정보 마스킹처리 |🔲 |
| 보안 문제 발생시 보안 관리자에게 알림이나 메시지가 가는 가? |🔲 |

---

*근거 파일: `report.html` · `pentest.json` · `smoke-*.json` · `stress-*.json` · `login-sweep.json` · `id-routes-classified.json` · `BURP-README.md`*
*원본 포맷: `/Users/juno/asset-erp-backend/docs/TODO_TEST.md` (2026-09-24)*
