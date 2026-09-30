# CUID Tracer PR C 시리즈 진행 현황 (#593)

**As of 2026-09-30**
**Branch:** `refactor/remaining-cuid-593`
**Last commit:** `664be534` (PR C3)

---

## 완료한 PR

| PR | 대상 엔티티 | 커밋 |
| --- | --- | --- |
| C1 | EquipmentUnit + EquipmentLoan + EquipmentAssignment | `4538a9c2` |
| C2 | Partner cluster (PartnerContract, PartnerContactLog, MedicalEquipmentLoanLedger, Sponsorship + attachedContractId) | `b372233c` |
| C3 | AssetRequest + AssetRequestApproval.assetRequestId + OperatingExpense (+ Notification.entityIdStr, seed 정합) | `664be534` |

## 진행 중 (미착수, 큐 순서대로)

| PR | 대상 | 예상 규모 | 비고 |
| --- | --- | --- | --- |
| **C4** | `Club.id` + 12개 이상 FK 컬럼 `clubId Int → String?` | 코드 참조 562+, 62 파일 | 최대 규모. 세션 재개 후 착수 |
| C5 | `TacticalAnalysis.id`, `Match.id` | 중간 |  |
| C6 | Software/Vendor/Hardware 인덱스 (`SoftwareLicense`, `Partner`, `EquipmentItem`) CUID 검증 | 검증 위주 | C2/C1 에서 이미 대부분 처리됨 → 잔여 확인 |
| C7 | `Team.id` (ownerId 참조), `Department.id` (departmentId 광범위 참조) | 매우 큼 |  |
| C8 | `PlayerMatchStats.id` | 소 |  |
| C9 | `BudgetLine.id` + budgetLineId 참조 (AssetRequest, OperatingExpense, Ledger 등) | 큼 |  |

## PR C4 착수 시 즉시 필요한 액션

1. **schema.prisma**
   - `model Club { id String @id @default(cuid()) }` (line 850)
   - 아래 12+ 모델의 `clubId Int? → String?`:
     - Team (885), User (939 근처), 그리고 `grep -n "clubId.*Int" prisma/schema.prisma` 결과 전체 12줄
2. **DB 리셋**: `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="force reset 진행" npx prisma db push --force-reset --accept-data-loss`
3. **prisma generate**
4. **tsc 스윕**: `NODE_OPTIONS='--max-old-space-size=8192' npx tsc --noEmit` — 수백 개 예상
5. **일괄 sed**:
   - `clubId: number` → `clubId: string`
   - `clubId?: number` → `clubId?: string`
   - `actorClubId?: number` → `actorClubId?: string`
   - `Map<number, X>` (clubId 키인 경우) → `Map<string, X>`
   - `Number(req.*.clubId)` / `parseInt(clubId)` 제거
6. **seed 수정**: `prisma.club.upsert({ where: { id: 1 }, ... })` 모두 `where: { ownerEmail: ... }` 등 unique 필드 조회로 전환
7. **테스트 파일**: 하드코딩 `clubId: 1`, `clubId: 5` 등을 cuid 문자열로 (`cmxtestclub00000000000001` 패턴)
8. **커밋 후 tsc 재확인**: pre-existing 12개 에러 (auth · department controller) 는 그대로 두기

## 확립된 패턴

### 컨트롤러 param 가드
```ts
import { assertCuid } from "../lib/cuidGuard";
const id = assertCuid(req.params["id"]);   // enum-hardened: 정수 · 빈 문자열 · non-cuid 차단
```

### 라우터 팩토리
```ts
import { cuidRouter, assertCuid } from "../lib/cuidGuard";
const router = cuidRouter();  // :id 자동 검증. `cuidRouter("assetId")` 로 다른 param 명 지정 가능
```

### 알림 entityId union
`Notification.entityId Int?` + `entityIdStr String?` 병존. cuid 엔티티 알림은 `entityIdStr` 로 저장. 예: `sponsorshipExpiryAlert.ts:33` 는 `where: { entityIdStr: s.id }`.

### Ledger relatedId
`Ledger.relatedId Int` 는 유지. cuid 엔티티는 `description` 문자열에 append: `description: '...' + ` [sponsorshipId=${id}]``.

### 테스트 fixture
- `cmxtestspons0000000000001` 스폰서십
- `cmxtestequip0000000000001` 장비
- `cmxtestpartner00000000010` 파트너
- `cmxtestassreq0000000000001` 자산요청
- `cmxtestopexp0000000000001` 운영지출
- **주의**: sed 대량 치환 시 뒤에 붙는 문자 (예: `"..."0` trailing zero) 검증 필수

### seed 패턴
- `.upsert({ where: { id: N }, ... })` → `.create({ data: {...} })` 로 변환 (id 자동 생성)
- 여러 번 재실행 방지가 필요하면 `findFirst({...}) ?? .create(...)` 패턴

## 알려진 pre-existing tsc 에러 (PR C 시리즈 무관)

이 12개는 main 브랜치부터 존재. PR C 시리즈에서 손대지 말 것:
- `src/auth/auth.controller.ts(142,59)`
- `src/auth/auth.service.ts(131,44)`
- `src/department/department.controller.ts(9 places)` — `exactOptionalPropertyTypes` Actor.frontOfficeRole `undefined` vs `null` 불일치

## 유저 시드에서 손댄 파일

- `prisma/seed.ts`:
  - `injury.upsert(id:1)` → `injury.create({data:...})` (line 2284)
  - `contract.upsert(id:"injury-001")` → `contract.create` (line 397)
  - Contract.update `where: { id: "injury-001" }` → `updateMany({ where: { playerId: 'player-002' } })` (line 394)
  - `equipmentItem.upsert(id:1)` → `findFirst({name}) ?? create()` (line 515)
  - `equipmentUnit.upsert(id:1)` → 동일 패턴 (line 527)
  - `EquipmentLoan.dueDate` 필드 필수 → 5개 loanCase 에 `dueDate: defaultDue` 추가
  - ExpenseCategory 12개 (`MEDICAL`, `HOME_MATCH_SUPPORT`, `MEAL`, `TRAVEL`, `SPORTS_EQUIPMENT`, `SCOUTING`, `YOUTH`, `IT_SECURITY`, `FACILITY_EQUIPMENT`, `STAFF_RECRUITMENT`, `AWAY_TRAVEL_TEAM`, `TEAM_TRAINING_GEAR`) 를 `seedBudgetPlanWorkflow` 안 `newCategorySeeds` 배열에 추가 → fresh DB 시드 실패 방지

## 시드 검증 완료

경영지원 (재무관리·HR·마케팅), 운영/인프라 (시설·장비·의료기기·IT), 선수단 및 기술 부문 (코칭·의무·재활·유소년·스카우팅) 모두 시드됨. 유저 계정 `coach@club.com`(코칭스태프 DEPT_HEAD), `meddir@club.com`(의무팀 DEPT_HEAD), `finance@club.com`(FINANCE_MANAGER) 등 존재.

## 재개 명령

```bash
cd /Users/juno/work/football/apps/api
git checkout refactor/remaining-cuid-593
git status  # 664be534 이후 클린한지 확인
# PR C4 시작 예정
```
