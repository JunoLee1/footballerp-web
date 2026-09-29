# 트러블 슈팅 로그

## 1· 스트레스 부하 시 p95 폭발 문제

**배경** 스트레스 부하(200 VU)에서 GM/FINANCE/ASSET 페르소나가 임계치(p95 < 2s) 대비 각 3.2× · 1.8× · 1.6× 초과하며 대시보드 지연 유발.

**원인** 세 도메인 공통으로 heavy read 쿼리(`filter=pending-*`, `seasonId` join)를 매 요청 DB 에서 재실행. Prisma pool 대기 큐가 쌓여 p95 폭발.

**작업** ioredis 기반 30초 TTL 캐시 유틸(`lib/cache.ts`)을 6개 서비스 list/get 에 삽입. GM p95 6,395→690ms (9.3× 개선, RPS 40→140). FINANCE/ASSET 는 각 1.4× 개선(캐시 외 병목 잔존 — 후속 과제).


## 2. Cross-Role RBAC Problem 발생 

**배경** HR 버피수트 테스트를 진행중에서 51 퍼센트 RBAC 위반 사항 확인 
**원인** middle ware role 확인 미적용 

**작업**
import { requireReadHR, requireWriteHR } from '../lib/hrGuards'

router.get('/:id', auth, requireReadHR, controller.get)
추가 

**결과** 
4/6 -> 0/6으로 취약도 개선


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



## 4. 자산관리 도메인 멀티 클럽 스코핑 부재

**배경** 