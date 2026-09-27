# 도메인별 테스트 TODO

## 범례
- ✅ 완료
- 🔲 미완료
- ➖ 해당 없음

---

## 1. Auth `/auth`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ 로그인 sweep 33 계정 · 10건 200 확인 (rate-limit 이후 429) |
| Stress | 🔲 login 전용 stress 미러닝 — rate-limiter 로 인해 별도 시나리오 필요 |
| 보안 — 브루트포스 / Rate Limiting | ✅ 10건 연속 시도 후 429 반환 · 60s+3s 딜레이 재시도로도 지속 차단 (5분+ sliding window 추정) |
| 보안 — 인증 우회 (토큰 없음/변조) | 🔲 미확인 |
| 보안 — Refresh 토큰 재사용 | 🔲 미확인 |
| 보안 — Rate-limit window 및 threshold 상수 문서화 | 🔲 `apps/api/src/lib/rateLimit.ts` ADR/주석 추가 필요 |

---

## 2. HR_MANAGER 도메인 `/hiring-surveys`, `/plan-reports`, `/recruitment/job-postings`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-HR_MANAGER.json` 49/49 PASS, p(95) 278ms |
| Stress | 🔲 `stress-HR_MANAGER.json` p(95) 2,060ms · threshold 1,000ms 대비 2배 · RPS 78 |
| 보안 — Cross-role 접근 차단 | 🔲 pentest 미커버 |

---

## 3. HEAD_COACH 도메인 `/training`, `/players`, `/tactical`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-HEAD_COACH.json` 55/55 PASS, p(95) 199ms |
| Stress | ✅ `stress-HEAD_COACH.json` p(95) 1,059ms · threshold 통과 · RPS 128 (최고 처리량) |
| 보안 — Cross-role 접근 차단 | 🔲 pentest 미커버 |

---

## 4. FINANCE_MANAGER 도메인 `/operating-expenses`, `/budget-control`, `/financial-reports`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-FINANCE_MANAGER.json` 65/65 PASS, p(95) 243ms |
| Stress | 🔲 `stress-FINANCE_MANAGER.json` p(95) 3,563ms · threshold 1.8배 초과 · RPS 65 |
| 성능 — `OperatingExpense.seasonId` 인덱스 확인 | 🔲 schema.prisma index 유무 EXPLAIN 미검증 |
| 성능 — `/financial-reports/:id/plan-requests` include depth | 🔲 relation 트리 폭발 여부 미확인 |
| 보안 — Cross-role 접근 차단 | 🔲 pentest 미커버 |

---

## 5. ASSET_MANAGER 도메인 `/equipment`, `/asset-requests`, `/equipment/loans`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-ASSET_MANAGER.json` 55/55 PASS, p(95) 207ms |
| Stress | 🔲 `stress-ASSET_MANAGER.json` p(95) 3,142ms · threshold 1.6배 초과 · RPS 63 |
| 성능 — `EquipmentLoan.returnedAt IS NULL` 인덱스 | 🔲 EXPLAIN 미검증 |
| 성능 — `AssetRequest` 상태별 필터 쿼리 최적화 | 🔲 미검증 |
| 보안 — Cross-role 접근 차단 | 🔲 pentest 미커버 |

---

## 6. GM 도메인 `/plan-reports?filter=pending-final`, `/reports?filter=pending-final`, `/hiring-dispatches?filter=pending-dispatch`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-GM.json` 49/49 PASS, p(95) 296ms |
| Stress (baseline · no cache) | 🔲 `stress-GM.json` p(95) 6,395ms · threshold 3배 초과 · RPS 40 |
| Stress (Redis cache 적용) | ✅ `stress-GM-redis.json` p(95) **690ms** · threshold 통과 · RPS **139.7** · reqs 14,878 — **9.3× p95 개선 · 3.4× 처리량** |
| 성능 — 3개 endpoint 개별 분해 러닝 | ➖ Redis 캐시로 병목 해소, 개별 분해 불필요 |
| 보안 — Cross-role 접근 차단 | 🔲 pentest 미커버 |

---

## 7. PLAYER 도메인 `/players`, `/training`, `/notifications/my`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-PLAYER.json` 55/55 PASS, p(95) 144ms (최저 지연) |
| Stress | 🔲 `stress-PLAYER.json` p(95) 2,035ms · threshold 근접 초과 · RPS 83 |
| 보안 — Cross-player IDOR | 🔲 개별 선수 계정 상호 세션 테스트 미러닝 (rate-limit blocker) |

---

## 8. MEDICAL_DIRECTOR 도메인 `/injuries/active`, `/medical-equipment-loan`, `/medical-expenses`

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ✅ `smoke-MEDICAL_DIRECTOR.json` 49/49 PASS, p(95) 195ms |
| Stress | 🔲 `stress-MEDICAL_DIRECTOR.json` p(95) 1,827ms · threshold 근접 · RPS 98 |
| 보안 — Cross-role 접근 차단 | 🔲 pentest 미커버 |
| 보안 — GDPR 개인정보 스코프 검증 | 🔲 guardian 계정 접근 범위 미검증 |

---

## 9. Contracts `/contracts/:id`, `/contracts/:id/*` (5 sub-actions)

> 계약금 · 서명 보너스 · 에이전시 커미션 · 바이아웃 조항 포함 · sensitive

| 항목 | 상태 | 비고 |
|---|---|---|
| Smoke | ➖ (persona endpoint set 에 미포함) |
| Stress | ➖ |
| 보안 — IDOR (Player → 타 선수 계약 조회) | 🔲 **LEAK** — PLAYER 세션 임의 ID 1~20 전부 200 응답 (`pentest.json` verdict LEAK) |
| 보안 — IDOR (HR → 타 계약 조회) | 🔲 **LEAK** — HR_MANAGER 세션도 20/20 건 200 |
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
| 보안 — PATCH `/read` IDOR | 🔲 **LEAK** — HR_MANAGER 세션이 임의 ID 2건 read 마킹 성공 |
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

## 16. 다중 역할 확장 커버리지 (Multi-Role Extended Personas · 확장 완료 · stress 미러닝)

| 항목 | 상태 | 비고 |
|---|---|---|
| ADMIN `admin@club.com` smoke/stress | 🔲 personas.k6.js 편입 완료, 미러닝 |
| SUPERADMIN `superadmin@platform.com` smoke/stress | 🔲 편입 완료, 미러닝 |
| HR_STAFF `hr.staff@club.com` | 🔲 편입 완료 · staff delegation IDOR 확인 필요 |
| FINANCE_STAFF `finance.staff@club.com` | 🔲 편입 완료 |
| ASSET_STAFF `asset.staff@club.com` | 🔲 편입 완료 |
| FACILITY_MANAGER `facility.manager@club.com` | 🔲 편입 완료 |
| FACILITY_STAFF `facility.staff@club.com` | 🔲 편입 완료 |
| ASSISTANT_COACH `assistant@club.com` | 🔲 편입 완료 |
| ATTACKING_COACH `attacking@club.com` | 🔲 편입 완료 |
| DEFENSIVE_COACH `defensive@club.com` | 🔲 편입 완료 |
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
