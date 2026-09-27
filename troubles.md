# 트러블 슈팅 로그

## 2026-09-27 · 스트레스 부하 시 p95 폭발 문제

**배경** 스트레스 부하(200 VU)에서 GM/FINANCE/ASSET 페르소나가 임계치(p95 < 2s) 대비 각 3.2× · 1.8× · 1.6× 초과하며 대시보드 지연 유발.

**원인** 세 도메인 공통으로 heavy read 쿼리(`filter=pending-*`, `seasonId` join)를 매 요청 DB 에서 재실행. Prisma pool 대기 큐가 쌓여 p95 폭발.

**작업** ioredis 기반 30초 TTL 캐시 유틸(`lib/cache.ts`)을 6개 서비스 list/get 에 삽입. GM p95 6,395→690ms (9.3× 개선, RPS 40→140). FINANCE/ASSET 는 각 1.4× 개선(캐시 외 병목 잔존 — 후속 과제).
