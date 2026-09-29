/*
 * Football ERP — 나머지 도메인 배치 sweep
 *
 * 7 도메인 카테고리를 각 페르소나 세션으로 rapid smoke.
 * 목표: 미테스트 endpoint 를 하루에 커버하고 4xx/5xx 발생 지점 식별.
 *
 * Personas:
 *   admin      = admin@club.com          (isAdminLike)
 *   finance    = finance@club.com        (FRONT_OFFICE + FINANCE_MANAGER)
 *   coach      = coach@club.com          (COACHING_STAFF + HEAD_COACH)
 *   guardian   = guardian@club.com       (GUARDIAN — 없으면 skip)
 *   fo         = fo@club.com             (FRONT_OFFICE + SCOUT)
 *
 * Scenarios (SCENARIO env):
 *   smoke  — VUS=2 · 20s · 전 도메인 골든 패스
 *   stress — ramping 5→100 VUs · ~1m · 전 도메인 stress
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=smoke  k6 run loadtest/domain-sweep.k6.js
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'smoke'

const readLatency = new Trend('sweep_read_latency', true)
const domainErrors = new Counter('sweep_errors')

const CREDS = {
  admin:    { email: 'admin@club.com',    password: 'Password1!' },
  finance:  { email: 'finance@club.com',  password: 'Password1!' },
  coach:    { email: 'coach@club.com',    password: 'Password1!' },
  fo:       { email: 'fo@club.com',       password: 'Password1!' },
}

function loginOptional(creds) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(creds), {
    headers: { 'Content-Type': 'application/json' },
    tags: { op: 'login' },
  })
  if (res.status !== 200) return null
  const cookie = res.headers['Set-Cookie'] || ''
  const m = cookie.match(/access-token=([^;]+)/)
  if (!m) return null
  return `access-token=${m[1]}`
}

function get(cookie, path, opLabel) {
  const t0 = Date.now()
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Cookie: cookie },
    tags: { op: opLabel },
  })
  readLatency.add(Date.now() - t0)
  return res
}

// 도메인 카테고리별 endpoint 커버.
// Persona 는 각 도메인의 자연스러운 접근자 선택.
const DOMAIN_MAP = [
  // 💼 트랜스퍼·에이전시
  { persona: 'admin',   paths: ['/transfers/recalls', '/transfers/player/player-001'] },
  // 💰 재무·예산 세부
  { persona: 'finance', paths: [
      '/sponsorships', '/sponsorships/roi', '/sponsorships/expiring',
      '/budget-control',
      '/sales/summary?seasonId=1', '/sales/ticket-summary?seasonId=1', '/sales/ticket-season-total?seasonId=1',
      '/monthly-settlement',
      '/account-codes',
      '/operating-expenses?seasonId=1',
  ] },
  // 🏃 코치·훈련 세부
  { persona: 'coach', paths: [
      '/training',
      '/tactical',
      '/development-plans',
      '/coach-availabilities',
      '/training-references',
  ] },
  // 📊 리포트·리뷰·분석
  { persona: 'admin', paths: [
      '/plan-reports',
      '/reports',
      '/hiring-dispatches',
      '/financial-reports/1',
  ] },
  // 🛡️ 보호자·유스·안전
  { persona: 'admin', paths: [
      '/youth-registrations',
      '/incident-reports',
      '/safeguard-reports',
  ] },
  // ⚙️ 워크플로우·설정
  { persona: 'admin', paths: [
      '/departments',
      '/department-review-configs',
      '/review-rule-sets',
  ] },
  // 🌐 인프라·유틸
  { persona: 'admin', paths: [
      '/notifications/my',
      '/audit-logs',
      '/countries',
      '/clubs',
  ] },
]

const smoke = { executor: 'constant-vus', vus: 2, duration: '20s', tags: { scenario: 'smoke' } }
const stress = {
  executor: 'ramping-vus',
  startVUs: 0,
  stages: [
    { duration: '15s', target: 5 },
    { duration: '20s', target: 50 },
    { duration: '20s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  tags: { scenario: 'stress' },
}

export const options = {
  scenarios: SCENARIO === 'smoke' ? { smoke } : SCENARIO === 'stress' ? { stress } :
    (() => { throw new Error(`Unknown SCENARIO: ${SCENARIO}`) })(),
  thresholds: {
    http_req_duration: ['p(95)<2500'],
    http_req_failed:   ['rate<0.40'], // sweep 은 여러 도메인이라 일부 4xx 가능
    sweep_errors:      ['count<200'],
  },
}

export default function () {
  const cookies = {
    admin:   loginOptional(CREDS.admin),
    finance: loginOptional(CREDS.finance),
    coach:   loginOptional(CREDS.coach),
    fo:      loginOptional(CREDS.fo),
  }

  for (const { persona, paths } of DOMAIN_MAP) {
    const c = cookies[persona]
    if (!c) { domainErrors.add(1); continue }
    for (const p of paths) {
      const r = get(c, p, `${persona}:${p}`)
      if (!check(r, { [`${persona}${p}<500`]: (rr) => rr.status < 500 })) domainErrors.add(1)
    }
  }
  sleep(1)
}
