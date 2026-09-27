# Test Coverage TODO — 2026-09-27

k6 도메인별 부하 + Burp-style IDOR 프로브 러닝 후 도출된 후속 작업 리스트. `report.html` 과 함께 봐.

## 📊 오늘 실측 결과 요약

| 축 | 커버리지 | 결과 |
|---|---|---|
| k6 smoke | 7/7 persona | 전부 PASS (p95 144~296ms, err 0%) |
| k6 stress | 7/7 persona | 4/7 threshold 초과 (p95 2s 넘김) |
| IDOR 프로브 | 10 /:id endpoint × 2 attacker | **3건 LEAK** (`/contracts/:id` 등) |
| Route coverage | **10 / 370** (2.7%) | 미커버 360건 |

---

## 🔴 즉시 조치 (Critical)

### 1. `/contracts/:id` IDOR — 두 페르소나 전부 유출
- 재현: `node loadtest/results-2026-09-27/pentest.mjs`
- Ground truth: `pentest.json` `verdict=LEAK`, ok200=20/20
- 유출 필드: `salary`, `signingBonus`, `buyoutClause.amount`, `agencyCommission`, `managedById`
- 원인 추정: `contract.routes.ts` 의 `GET /:id` 에 owner-scope guard 미장착
- 조치:
  - [ ] `apps/api/src/contract/contract.routes.ts` `GET /:id` 앞단에 접근권한 미들웨어 추가
  - [ ] 소유자(playerId ⇢ 요청자) 또는 role∈[GM, FINANCE_MANAGER, HR_MANAGER] 만 허용
  - [ ] regression test: `apps/api/__test__/contract/contract.access.test.ts`

### 2. `/notifications/:id/read` PATCH — HR 로 남의 알림 read 마킹 가능 (2건)
- 조치: `notification.routes.ts` PATCH `/:id/read` 에 `recipientUserId === req.user.id` 체크 강제
- 참고: GET `/notifications/:id` 는 정상 (404 반환)

### 3. photophoio.md line 66 문구 수정
- 현재 문구: "UUID v4 도입 · 임의 주소 변조 시 403 Forbidden 완벽 작동"
- 실제: 숫자형 PK 사용 중, `/contracts/:id` 는 owner guard 자체가 없음
- 조치: 문구 수정 or 실제 UUID 마이그레이션 & guard 추가 후 pentest.json 재취득

---

## 🟠 성능 회귀 (Stress threshold 초과)

`p(95)<2000ms` threshold 초과 페르소나 (single-instance):

| Persona | p95 | RPS | 원인 후보 |
|---|---|---|---|
| GM | **6395ms** | 40 | `/plan-reports?filter=pending-final`, `/reports?filter=pending-final`, `/hiring-dispatches?filter=pending-dispatch` — 세 개 다 pending-filter join 부담 |
| FINANCE_MANAGER | 3563ms | 65 | `/financial-reports/1/plan-requests` (workflow 조회) or `/operating-expenses?seasonId=1` full scan |
| ASSET_MANAGER | 3142ms | 63 | `/equipment/loans`, `/asset-requests` |
| HR_MANAGER | 2060ms | 78 | 임계값 근접 — 관찰만 |
| PLAYER | 2035ms | 83 | 임계값 근접 |

- [ ] GM 페르소나 3개 endpoint 를 개별 k6 로 분리, 어느게 병목인지 지목
- [ ] FINANCE `/financial-reports/1/plan-requests` EXPLAIN 확인 (Prisma include 트리 폭발 여부)
- [ ] `/operating-expenses` `seasonId` index 여부 확인
- [ ] `/plan-reports` `filter=pending-final` 쿼리 index 여부 확인

---

## 🟡 미커버 도메인 IDOR 우선순위 (Definite Sensitive · 153건 / 31 prefix)

돈·계약·개인정보 관련. 다음 순서로 pentest.mjs `TARGETS` 에 추가:

**Round 2 (financial / salary — 가장 급함):**
- [ ] `/payroll/:id` 의 sub-actions 11개 (approve/cancel/salaries/allowances 포함)
- [ ] `/sponsorships/:id/*` 12개 (계약금 정보)
- [ ] `/budget-control/:id/*` 11개
- [ ] `/monthly-settlement/:id/*` 7개
- [ ] `/operating-expenses/:id/*` sub 6개 (root GET 은 이미 tested)
- [ ] `/sales/:id/*` 5개
- [ ] `/ledger/:id/*` 2개

**Round 3 (HR / hiring — 개인정보):**
- [ ] `/hiring-surveys/:id/*` 11개
- [ ] `/hiring-dispatches/:id/*` 8개
- [ ] `/academy-fees/:id/*` 9개
- [ ] `/acquisition-surveys/:id/*` 4개
- [ ] `/staff-records/:id/*` 2개
- [ ] `/employee-contracts/:id/*` sub 3개 (root GET 이미 tested)
- [ ] `/player-callups/:id/*` 6개
- [ ] `/youth-registrations/:id/*` 4개
- [ ] `/pii-access/:id/*` 2개

**Round 4 (medical / safeguard):**
- [ ] `/injuries/:id/*` sub 9개 (root GET 이미 tested)
- [ ] `/medical-expenses/:id/*` sub 6개 (root GET 이미 tested)
- [ ] `/medical-equipment-loan/:id/*` 3개
- [ ] `/safeguard-reports/:id/*` 2개

**Round 5 (contracts / player-body — 유출 확인된 도메인):**
- [ ] `/contracts/:id/*` sub 5개 (clauses, extensions, bonuses)
- [ ] `/prospects/:id/*` 2개
- [ ] `/partners/:id/*` 2개
- [ ] `/plan-reports/:id/*` 5개

## 🟢 미커버 possible sensitive (51건 / 17 prefix)

리뷰/승인/보고 계열 — owner-scope 확인 필요:

- `/asset-requests`, `/attendance-appeals`, `/certification`, `/development-plans`, `/formation-snapshots`, `/growth-reports`, `/incident-reports`, `/plan-reports`, `/prospects`, `/recruitment`, `/reports`, `/facility`, `/coaches`, `/training`, `/transfer-requests`, `/department-review-configs`

## ⚪ 미커버 publicish (112건 / 23 prefix)

`/countries`, `/leagues`, `/matches`, `/tactical`, `/teams`, `/training-references` 등. 401 만 나오면 OK. 낮은 우선순위.

## 🔵 Unclassified (49건)

`/agencies`, `/players` sub-actions (15!), `/recruitment` (17!), `/software-licenses`, `/staff-records`, `/asset-requests` — 케이스별로 sensitivity 재분류 필요.

---

## 🛠️ 인프라 개선

- [ ] `pentest.mjs` 를 이 카탈로그(`id-routes-classified.json`)로 데이터 드라이브 — TARGETS 배열 하드코딩 제거
- [ ] Burp Suite Community 실행 flow 자동화 힘드니 **Intruder 프로젝트 파일** 을 미리 export 해서 리포트에 첨부
- [ ] k6 stress LB 모드(`docker-compose.loadtest.yml` 2 replica + nginx) 재구동 후 threshold 재측정
- [ ] CI/CD nightly (`.github/workflows/loadtest.yml`) 에 per-persona 매트릭스 추가

---

## 📎 근거 파일

- `report.html` — 전체 대시보드
- `pentest.json` — 자동화된 IDOR 결과 (verdict per row)
- `smoke-*.json` / `stress-*.json` — k6 도메인별 raw summary
- `id-routes-classified.json` — 370개 :id 라우트 sensitivity 분류
- `BURP-README.md` — Burp Suite 재현 절차
- `personas.k6.js` — PERSONA 필터 추가된 부하 스크립트
- `photophoio.md` line 64-66 — 원본 QA 주장 (line 66 은 falsified)
