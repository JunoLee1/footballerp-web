# 트러블 슈팅 로그

## 1· 스트레스 부하 시 p95 폭발 문제

**배경** 스트레스 부하(200 VU)에서 GM/FINANCE/ASSET 페르소나가 임계치(p95 < 2s) 대비 각 3.2× · 1.8× · 1.6× 초과하며 대시보드 지연 유발.

**원인** 세 도메인 공통으로 heavy read 쿼리(`filter=pending-*`, `seasonId` join)를 매 요청 DB 에서 재실행. Prisma pool 대기 큐가 쌓여 p95 폭발.

**작업** ioredis 기반 30초 TTL 캐시 유틸(`lib/cache.ts`)을 6개 서비스 list/get 에 삽입. GM p95 6,395→690ms (9.3× 개선, RPS 40→140). FINANCE/ASSET 는 각 1.4× 개선(캐시 외 병목 잔존 — 후속 과제).

----
## 2. Cross-Role RBAC Problem 발생 

**배경** HR 버피수트 테스트를 진행중에서 51 퍼센트 RBAC 위반 사항 확인 
**원인** middle ware role 확인 미적용 

**작업**
import { requireReadHR, requireWriteHR } from '../lib/hrGuards'

router.get('/:id', auth, requireReadHR, controller.get)
추가 

**결과** 
4/6 -> 0/6으로 취약도 개선

---

## 3. authMiddleware 매-요청 DB 조회 병목

**배경** Redis 로 각 도메인 endpoint 응답을 캐시했는데도 stress p95 가 500~2500ms 대로 유지되는 문제 확인. GM 690ms · MEDICAL 946ms 등 endpoint cache hit 이 명확한데 tail latency 안 떨어짐.

**원인** `authMiddleware.ts` 가 매 인증 요청마다 `SELECT isDeleted FROM User WHERE id=?` 를 실행 (JWT 는 서명·만료 검증만 하고 활성 상태는 DB 로 확인). 200 VU 동시성에서 Prisma pool (기본 10~20 커넥션) 이 auth 단계부터 큐잉 → endpoint cache hit 여부와 무관하게 전체 요청이 대기. Redis endpoint 캐시는 응답 body 만 재사용하고 이 조회는 매번 그대로 실행 되는 문제였음.

**작업** `lib/userStatusCache.ts` 신설 · 5분 TTL Redis 캐시로 `SELECT isDeleted` 결과를 재사용. `authMiddleware` 는 `isUserActive(userId)` 한 줄로 교체 (Redis miss 시 DB fallback + 재세팅). `admin.service` 의 `deactivateUser`·`reactivateUser`·`deleteUser` 에 `invalidateUserActive(id)` 훅 추가하여 soft-delete/hard-delete 시 즉시 캐시 무효화 (반영 지연 최대 5분 → 훅으로 0초).

```ts
// before (매 요청)
const record = await getPrisma().user.findUnique({
  where: { id: user.id }, select: { isDeleted: true },
});
if (!record || record.isDeleted) return res.status(401).json({ code: "UNAUTHORIZED" });

// after (Redis 우선)
if (!(await isUserActive(user.id))) return res.status(401).json({ code: "UNAUTHORIZED" });
```

**결과** baseline 대비 총 개선:
- GM  6,395 → 40ms (**161×**)
- ADMIN 5,586 → 70ms (80×)
- ASSET 3,142 → 48ms (65×)
- HR   2,060 → 35ms (59×)
- MEDICAL 1,827 → 41ms (45×)
- FINANCE 3,563 → 439ms (8× · endpoint 자체 무거움, financial-report include 트리 후속 튜닝 대상)

-----


## 4. 자산관리 도메인 멀티 클럽 스코핑 부재

**배경** cross-role RBAC 스캔 (`loadtest/results-2026-09-27/cross-role-test.mjs`) 에서 자산 도메인 4건 LEAK 검출 (`PLAYER→/asset-requests`, `HR_MANAGER→/equipment`, `HR_MANAGER→/asset-requests`, `HR_MANAGER→/equipment/loans`). 재분석 결과 3건은 "구단원이면 자기 클럽 자산 대여 가능" 이라는 설계 의도와 test 판정 기준(`200 = LEAK`) 미스매치로 인한 오탐(본인 신청 목록 · 공용 카탈로그), 1건(`/equipment/loans` 전체 대여 목록)만 실제 홀. 근본 원인은 `EquipmentItem`·`EquipmentUnit`·`EquipmentLoan`·`AssetRequest` 4개 모델이 모두 club-agnostic 설계라 멀티클럽 도입 시 클럽 간 격리 불가.

**원인** Feature 16 (`de7b59d9` 자산관리부서) 도입 시 단일 클럽 전제로 설계. Phase 1/1.5/2 Club Data Ownership 로드맵 (PR #514/#516/#517 — Player·Prospect·TrainingSession·OperatingExpense) 에도 자산 도메인 미포함. Phase 2 문서 "범위 밖" 절이 Contract·Match·BudgetPlan 은 Phase 3 로 명시했으나 자산은 언급 없음. 추가로 seed 유저 다수가 `clubId: null` 이라 `permissions.ts:97` bypass 정책으로 크로스 클럽 접근 가능한 상태.

**작업 (Phase 2.5 예정 — `docs/superpowers/plans/2026-09-29-club-data-ownership-phase2-5-asset.md`)**
- 자산 4개 모델에 `clubId Int?` FK 추가 + Phase 2 와 동일한 `actorClubId` 전파 패턴 (controller → service → repo)
- EquipmentItem backfill 은 첫 loan 요청자 clubId → COALESCE first Club LIMIT 1 (Phase 1 Prospect precedent)
- `/equipment/loans` 를 `canWrite` 관리자 전용으로 축소 (본인 대여는 `/loans/my` 유지)
- User.clubId backfill (seed + prod 마이그레이션) 로 legacy 유저 정리
- `cross-role-test.mjs` 를 2-클럽 seed 기반 multi-club 재작성 → 전 도메인(HR·FINANCE·MEDICAL·GM·ADMIN·ASSET) cross-club RBAC 감사

**결과** (Phase 2.5 PR 후 채워야 함)

----

## 5. 데이터베이스 인덱스 키가 정수 자동 증가 되는 경우 

**배경** 구단 직원 CRUD 과정에서 인덱스를 정수로 자동 증가 속성인경우, 개인정보 탈취에 취약점 발생 

**원인** auto increasement 라는 속성 을 가진 ID 특성인 경우, 인덱스가 쉽게 유추 되어 유저 개인 정보가 탈취 경우가 발생하기 때문

**작업**
 
**결과** 
인덱스 값이 랜덤문자열으로 생성되는 UUID 특성으로 인덱스 유추 불가능 함에따라서 보안 향상.
 ---

 ## 6.직원에대한 급여 노출 

 **배경** 직원에대한 급여정보가 모두에게 노출되는 문제 발생

 **원인** 급여 정보를 작성 할수있는 부분과 급여를 조회하는 부분에 있어서 권한 확인 미들웨어가 없어서 남용되는 문제 발생

 **작업** 
 급여를 계산 하고 정산하는 HR및 재무 팀, 상위관리자만 조회 수정 삭제 가능 하도록 미들웨어 작성.

 **결과** 
 사원들에 대한 급여 정보 보호 

 ---

 ## 7. 실제  recordID 로 탐지 안하면 가드 유무 탐지 불가

 **배경** 기존 테스트(pentest)는 임의 ID 1~20순차 탐지를 함. 전부 404가 나오나 이는 가드가 정상적으로 작동 하는지, 작동을 하지 않는지 판단을 못하는 문제 발생

 **원인**
 실 레코드 ID + 다양한 공격 루트로 재 탐지 필요로 함
 (81개의 end point * 4 공격자) = block(200) + Leak(20) + 170(pass) 
 -  HR/ASSET/FACILITY/GUARDIAN 등 무관 role 전부 통과
- `/contracts/:id` 5건 — HR_MANAGER 정책상 접근 (판단 대기)

 **작업**
```ts
const canRead =
      isAdminLike(requesterRole) ||
      requesterRole === "COACHING_STAFF" ||
      (requesterRole === "PLAYER" && String(player.userId) === requesterId) ||
      (requesterRole === "GUARDIAN" && String(player.guardianId) === requesterId) ||
      (requesterRole === "AGENT" && String(player.agentId) === requesterId);
    if (!canRead) throw new AppError(403, "FORBIDDEN");
  ```
**결과** 
20건은 403 성공적으로 반환 

---

## 8. 모든 도메인에 소속 구단인지, 소속 부서 에대한 인증 코드 미설계

**배경** 타 구단의 유저가 현재 구단 정보 조회 가능 한 문제 발생

**원인** 첨에 단일 클럽으로 좁혀 작업을 하다 보니 워크 플로 작성시에 놓쳐 발생한 원인 

**작업** 모든 도메인에 인가 검증 테스트 추가 

---
## 9. uuid 나 cuid로 인덱스 값을 변경 하더라도 정수로 id 가 변환 되는 경우 발생 

**배경** ID 열거 공격 (ID Enumeration) 및 데이터 유출 가능성이 발생 

**원인** 랜덤 문자열로 파라미터를 받더라도 "1" 로 온다면 number(req.params.id)로 변환이되는 경우 발생, 열거 1, 2,3,4 와 같이 정수들을 열거 하여 브루트 포스 공격 가능성이 탐지됨.

**작업** controller 코드 내부에 정수 반환이 되면 에러 메시지를 밷도록 함

**결과** 정수들을 무작위로 대입해서 공격 하는 경우 방지 

---