# Burp Suite — IDOR Reproduction Kit

photophoio.md line 66 claim (UUID v4 / 403 Forbidden 완벽 작동) 를 Burp Suite Community 로 재현하는 절차. `pentest.mjs` 는 fetch 로 같은 공격을 이미 자동화해뒀고, 여기서는 Burp GUI 로 동일한 결과를 시연.

## Prerequisites
- API 로컬 러닝: `http://localhost:3001` (`npm --prefix apps/api run dev`)
- Burp Suite Community: `/Applications/Burp Suite.app` (이미 설치됨)

## 1. Fresh access-token 발급
```bash
./get-token.sh player  # → 콘솔에 JWT 출력
```

## 2. Burp Suite 실행
```bash
open -a "Burp Suite"
```
- Temporary project → Use Burp defaults → Start Burp

## 3. Intruder 어택 준비
1. **Repeater** 탭 → 좌측 request panel 우클릭 → **Paste from file** →
   `burp-request-contracts-idor.txt` 선택
2. `<PASTE-FRESH-PLAYER-TOKEN>` 을 1번에서 받은 실제 JWT 로 치환
3. 요청 우클릭 → **Send to Intruder**
4. Intruder → **Positions** 탭: `§1§` 마커가 URL path 에 이미 걸려있는지 확인 (없으면 `1` 을 선택 후 Add §)
5. **Payloads** 탭:
   - Payload type: `Numbers`
   - From: `1`, To: `20`, Step: `1`
6. **Start attack** 클릭

## 4. 결과 확인
- Status column 에서 `200` 개수 카운트
- Length column 에서 응답 크기가 non-zero 인 요청 = 실제 계약 데이터 유출
- 예상: 20개 요청 전부 `200` + `salary` / `signingBonus` / `buyoutClause` 노출

## 5. Evidence 저장
Intruder Attack 창 상단 → **Save > Save attack** → 프로젝트 파일로 저장 후 스크린샷 캡처하여 포트폴리오에 첨부.

## 6. Ground truth 대조
같은 어택을 자동화한 결과:
```bash
node pentest.mjs
cat pentest.json | jq '.rows[] | select(.verdict=="LEAK")'
```
→ `PLAYER GET /contracts/:id` : `ok200=20`, `forbidden=0`, verdict `LEAK`.

## 관련 파일
- `pentest.mjs` — 자동화된 IDOR 프로브 (fetch 기반)
- `pentest.json` — 자동화 결과 원본
- `burp-request-contracts-idor.txt` — Burp Intruder 페이로드 템플릿
- `get-token.sh` — 페르소나별 fresh JWT 발급
- `report.html` — 전체 리포트 (k6 + pentest 통합)
