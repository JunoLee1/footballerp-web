# Payroll 도메인 Role Guard 통일 설계

**작성일**: 2026-09-29
**관련 이슈**: #565 (CRITICAL LEAK — `/payroll/configs`)
**관련 브랜치**: `fix/fianance-payroll-access`

## 배경

`role-boundary-probe.k6.js` 실측 결과 (2026-09-29) `GET /payroll/configs` 가 7개 role 전부 200 반환하는 CRITICAL LEAK 발견 (이슈 #565):

- 로그인만 되면 HR/ASSET/COACH/PLAYER/MEDICAL/TD/FACILITY 전부 급여 체계 조회 가능
- `config.controller.ts:11-15` `list` handler 에 role guard 미장착 (`auth` 만 있음)

동시에 payroll 도메인 4개 sub-controller (`config`, `salary`, `allowance`, `run`) 간 role guard 패턴이 **불일치**:

| Endpoint | 현재 guard | 문제 |
|---|---|---|
| `config.list` | 없음 | 🚨 LEAK |
| `config.create/update` | canWriteFinance | HR 도 설정 반영 니즈 |
| `salary.list/get` | canReadFinance | HR 은 급여 계산 실무 담당인데 제외 |
| `salary.create/update` | canWriteFinance | HR 도 급여 명세 작성 |
| `allowance.list/get` | canReadFinance | HR 계산 근거 조회 필요 |
| `allowance.create/update/remove` | canWriteFinance | HR 도 수당 반영 |
| `run.list` | canWriteFinance OR canWriteHR | ✅ 정합 |
| `run.create` | canWriteHR | ✅ HR 지급 실행 |
| `run.confirm` | canWriteFinance | ✅ Finance 승인 |
| `run.secondApprove` | isAdminLike | ✅ 최종 승인 |

## 도메인 정책

한국 실무 급여 업무 분담:
- **HR**: 급여명세 작성, 4대보험 (건강/국민/고용/산재) 신고, 원천세 신고, 연말정산
- **Finance**: 급여 예산 확정, 지급 승인
- **ADMIN/GM/SUPER_ADMIN**: 급여 체계 정책 결정

즉 payroll read/write 양쪽 모두 **HR + Finance 공동 접근** 필요. 이미 `run` 컨트롤러는 이 패턴을 반영하고 있음 (`canWriteFinance OR canWriteHR`).

## 설계

### 1. Helper 도입 — `lib/permissions.ts`

```typescript
export const canReadPayroll = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  canReadFinance(role, foRole, deptCategories) || canReadHR(role, foRole, deptCategories)

export const canWritePayroll = (role: string, foRole?: string | null, deptCategories?: string[]): boolean =>
  canWriteFinance(role, foRole, deptCategories) || canWriteHR(role, foRole, deptCategories)
```

**근거**: payroll 은 finance 와 HR 두 도메인의 교집합 관심사. 정책 변경 시 한 곳만 수정하도록 캡슐화.

### 2. 4개 sub-controller 갱신

| 파일 | Handler | 변경 |
|---|---|---|
| `config.controller.ts` | `list` | **없음 → `canReadPayroll`** (LEAK 파치) |
| `config.controller.ts` | `create` | `canWriteFinance` → `canWritePayroll` |
| `config.controller.ts` | `update` | `canWriteFinance` → `canWritePayroll` |
| `salary.controller.ts` | `list` | `canReadFinance` → `canReadPayroll` |
| `salary.controller.ts` | `get` | `canReadFinance` → `canReadPayroll` |
| `salary.controller.ts` | `create` | `canWriteFinance` → `canWritePayroll` |
| `salary.controller.ts` | `update` | `canWriteFinance` → `canWritePayroll` |
| `allowance.controller.ts` | `list` | `canReadFinance` → `canReadPayroll` |
| `allowance.controller.ts` | `create` | `canWriteFinance` → `canWritePayroll` |
| `allowance.controller.ts` | `update` | `canWriteFinance` → `canWritePayroll` |
| `allowance.controller.ts` | `remove` | `canWriteFinance` → `canWritePayroll` |
| `run.controller.ts` | (전부) | **변경 없음** (이미 정합) |

총 변경 line: 11개 handler × 1 line = 약 11 line + helper 2개 함수 (약 6 line).

### 3. 회귀 테스트

`apps/api/__test__/payroll/access-guard.test.ts` 신규:
- ADMIN/SUPER_ADMIN/GM → 전 endpoint 통과
- FINANCE_MANAGER → 전 endpoint 통과
- HR_MANAGER → 전 endpoint 통과 (신규 커버)
- HR_STAFF → read 통과, write 부분 제한 (canWriteHR 은 HR_MANAGER 만)
- FINANCE_STAFF → read 통과, write 부분 제한 (canWriteFinance 는 FINANCE_MANAGER 만)
- ASSET_MANAGER/COACH/PLAYER/MEDICAL/TD/FACILITY → 전 endpoint 403
- deptCategories 로만 접근 시 → HR/FINANCE 카테고리만 통과

각 role × 각 endpoint 매트릭스 verification.

### 4. Audit log

기존:
- `salary.service.create` → `SALARY_CREATED` ✅
- `salary.service.update` → `SALARY_UPDATED` ✅

이번 PR 스코프에는 신규 audit log 추가 없음 (기존 write handler 감사는 유지). `config.create/update` 에도 audit 추가는 별도 이슈로 (사용자가 이번 스코프에서 넘어감).

## 커버되지 않는 것 (Out of Scope)

- `run.controller` 는 이미 정합 상태 → 변경 없음
- Individual salary IDOR (본인 급여만 조회 가능? Player 세션은 어떻게?) → 별도 이슈 필요
- Payroll config 감사 로그 (create/update 이벤트 audit) → 별도 이슈
- FE 페이지의 role 별 노출 조정 (nav 필터) → 백엔드 변경 후 FE 팀 협의

## 릴리즈 순서

1. `permissions.ts` helper 2개 추가
2. 4 controller 갱신 (11 line)
3. 회귀 테스트 추가 → `pnpm jest __test__/payroll/access-guard`
4. k6 role-boundary-probe 재실행 → `boundary_leaks == 0` 확인
5. PR 오픈 → 이슈 #565 close

## 마이그레이션 영향

- Database migration: **없음**
- FE breaking change: **없음** (FE 는 이미 canReadFinance 로 페이지 렌더 판정 중, 백엔드는 더 넓게 허용)
- API 계약 변경: **없음** (더 넓은 접근 허용, 기존 통과하던 role 은 그대로)

**후방 호환성 100%.**
