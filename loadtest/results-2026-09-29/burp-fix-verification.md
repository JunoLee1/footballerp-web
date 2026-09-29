# Burp Suite — Contracts IDOR FIXED 시연 (PR #562 · issue #560)

**날짜**: 2026-09-29
**PR**: [#562](https://github.com/JunoLee1/footballerp-web/pull/562)
**이슈**: [#560](https://github.com/JunoLee1/footballerp-web/issues/560)
**Before/After** 재현으로 fix 검증.

## Before (2026-09-27 pentest.json)
- PLAYER 세션 `GET /contracts/1~20` → **20건 전부 200**
- verdict: **LEAK** (`salary`, `signingBonus`, `buyoutClause` 노출)

## After (2026-09-29 실측)
- PLAYER 세션 `GET /contracts/1~20` → **20건 전부 403** `FORBIDDEN`
- verdict: **BLOCKED**
- 파치: `contract.service.getContractById(id, actor)` 에 privileged/owner 검사 추가

## Burp Suite 재현 절차

### 1. Fresh PLAYER 토큰 발급 (아래는 지금 발급된 토큰)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTcsInJvbGUiOiJQTEFZRVIiLCJjb2FjaGluZ1JvbGUiOm51bGwsImZyb250T2ZmaWNlUm9sZSI6bnVsbCwiZGVwYXJ0bWVudENhdGVnb3JpZXMiOltdLCJ0ZWFtSWQiOm51bGwsImNsdWJJZCI6MSwiaXNEZW1vIjpmYWxzZSwiaWF0IjoxNzkwNjg0MTMxLCJleHAiOjE3OTA2ODc3MzF9.XAb9SWjg6KJC7XxXv7lRUz0HSZf8n48HB42nt_eLf18
```

토큰 만료 시 재발급:
```bash
./get-token.sh player
```

### 2. Burp Suite 실행 (별도 터미널)
```bash
open -a "Burp Suite"
```

### 3. Repeater / Intruder 시나리오
1. Repeater 좌측 request panel 우클릭 → Paste from file → `burp-request-contracts-idor.txt`
2. `<PASTE-FRESH-PLAYER-TOKEN>` 을 위 토큰으로 치환
3. Send → **응답 확인**: HTTP/1.1 **403** + body `{"code":"FORBIDDEN"}`
4. Intruder 로 확장: `§1§` 마커 → payload 1~20 → **20건 전부 403**

### 4. cURL 대조 (Burp 없이도 확인 가능)
```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ..."  # (실제 토큰 사용)
for i in {1..5}; do
  curl -s -o /dev/null -w "/contracts/$i → %{http_code}\n" \
    http://localhost:3001/api/contracts/$i \
    -H "Cookie: access-token=$TOKEN"
done
# 실측 결과 (2026-09-29):
#   /contracts/1 → 403
#   /contracts/2 → 403
#   /contracts/3 → 403
#   /contracts/4 → 403
#   /contracts/5 → 403
```

## 관련 파일
- `burp-request-contracts-idor.txt` — Burp Repeater/Intruder 페이로드 템플릿 (그대로 재사용)
- `get-token.sh` — 페르소나별 fresh JWT 발급
- `pentest.json` — pre-fix baseline (LEAK 20건)
- `__test__/contract/contract.access.test.ts` — 16 회귀 테스트 통과

## Follow-up 이슈 (동일 세션)
- Sub-actions `/contracts/:id/{clauses,extensions,bonuses,buyout,status}` 프로브 → 미커버 (이슈 #567)
- AGENT role owner-scope (본인 담당 선수 계약) → 스코프 외 (별도 이슈 필요)
