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
| 보안 — 브루트포스 / Progressive Rate Limiting | ✅ **도입 완료** (`lib/loginRateLimit.ts` · Redis 백엔드). 5회→5분·10회→30분·15회→1시간·20회→24시간 progressive tier. 실측: 5회 401 → 6회 429·tier=`5m`·TTL 300s. **20회 tier 도달 시 ADMIN 에게 `LOGIN_LOCKOUT_24H` 알림 발송** (`notification.repo.createForAdmin`) |
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

---

## 14. Operating Expenses `/operating-expenses/:id`, Medical Expenses `/medical-expenses/:id`, Employee Contracts `/employee-contracts/:id`, Players `/players/:id`

| 항목 | 상태 | 비고 |
|---|---|---|
| 보안 — IDOR (양 세션 임의 ID 프로브) | ✅ 전부 404 반환 (verdict PASS) — record 미존재 · guard 여부는 별도 확인 필요 |
| 보안 — 실제 존재하는 ID (record hydration 후) 재프로브 | 🔲 미커버 · 404 는 guard 미장착 여부 판정 불가 |
| Sub-actions 프로브 (총 30+ 건) | 🔲 미커버 (`id-routes-classified.json` 참조) |

---

## 15. Definite-Sensitive 미커버 도메인 (`id-routes-classified.json` definite bucket · 153건 · 31 prefix)

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
| `/staff-records/:id/*` (2) IDOR 프로브 | 🔲 |
| `/pii-access/:id/*` (2) IDOR 프로브 | 🔲 |
| `/medical-equipment-loan/:id/*` (3) IDOR 프로브 | 🔲 |
| `/safeguard-reports/:id/*` (2) IDOR 프로브 | 🔲 |
| `/player-callups/:id/*` (6) IDOR 프로브 | 🔲 |
| `/youth-registrations/:id/*` (4) IDOR 프로브 | 🔲 |
| `pentest.mjs` `TARGETS` 데이터 드라이브화 | 🔲 `id-routes-classified.json` 에서 로드 |

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
| Smoke | ✅ `results-2026-09-29/facility/smoke.json` — 100 req · p95 12ms · 0% fail · 4 endpoint (reservations/inspections/maintenance/preventive-schedules) |
| Stress | ✅ `results-2026-09-29/facility/stress.json` — 25,130 req · p95 1,240ms (threshold pass) · RPS 237 · VU peak 199 · 0% fail |
| CRUD (maintenance lifecycle) | ✅ `results-2026-09-29/facility/crud.json` — 27 lifecycle · 189 req · 0% fail · p95 86ms |
| 발견 — controller/service status 전환 불일치 | ⚠️ `maintenance.controller.VALID_TRANSITIONS.OPEN=[IN_PROGRESS, REJECTED]` vs `service.updateStatus.ALLOWED=[IN_PROGRESS, PENDING_APPROVAL]` → OPEN→REJECTED 는 controller 통과 후 service 에서 400. 이슈 파일 필요 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | ⚠️ list/get 은 guard 없음 (모든 로그인 유저 조회 가능) — 의도된 설계인지 별도 검토 필요 |

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
| Smoke | 🔲 미러닝 |
| Stress | 🔲 미러닝 |
| 보안 — 인증 없는 접근 차단 (401) | 🔲 미확인 |
| 보안 — Cross-role IDOR 프로브 | 🔲 미커버 |
| 보안 — Write endpoint (POST/PATCH/DELETE) 권한 경계 | 🔲 미확인 |

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
| 오버사이즈 문자열 / SQL injection 퍼징 | 🔲 미러닝 |
| 에러 메시지 스택트레이스 노출 여부 | 🔲 미러닝 |
| XSS 저장 후 프론트 sanitize | 🔲 미러닝 |
| 탈취 계정 남용 (mass-write rate limit) | 🔲 미러닝 · admin/create endpoint 별 rate-limit 유무 확인 필요 |
| 비밀번호 해싱 |🔲|
| 개인정보 마스킹처리 |🔲 |
| 보안 문제 발생시 보안 관리자에게 알림이나 메시지가 가는 가? |🔲 |

---

*근거 파일: `report.html` · `pentest.json` · `smoke-*.json` · `stress-*.json` · `login-sweep.json` · `id-routes-classified.json` · `BURP-README.md`*
*원본 포맷: `/Users/juno/asset-erp-backend/docs/TODO_TEST.md` (2026-09-24)*
