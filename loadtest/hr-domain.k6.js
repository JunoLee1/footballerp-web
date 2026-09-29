/*
 * Football ERP — HR 세부 도메인 Load Test
 *
 * Endpoints (read-focus + IDOR probe):
 *   /staff-records                 GET (list + :id) — canReadHR
 *   /hiring-surveys                GET (list + :id) — requireReadHR
 *   /recruitment/job-postings      GET (list + :id) — HR
 *   /recruitment/{headcount-progress,time-to-hire,cost-per-hire}
 *   /pii-access/requests           GET (listPending + mine) — isAdminLike
 *   /pii-access/requests/mine      GET — 로그인 유저 본인
 *
 * Scenarios (SCENARIO env):
 *   smoke  — VUS=2 · 10s
 *   stress — ramping 5→50→100→200 VUs · ~1m45s
 *   idor   — HR 세션으로 staff-record 개별 조회 IDOR 프로브 (본인 vs 타인)
 *
 * Persona: hr@club.com (FRONT_OFFICE + HR_MANAGER → canReadHR + canWriteHR)
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=smoke  k6 run loadtest/hr-domain.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=stress k6 run loadtest/hr-domain.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=idor   k6 run loadtest/hr-domain.k6.js
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'smoke'

const readLatency = new Trend('hr_read_latency', true)
const domainErrors = new Counter('hr_errors')
const idorLeaks = new Counter('hr_idor_leaks')

const LOGIN = { email: 'hr@club.com', password: 'Password1!' }
const PII_ADMIN_LOGIN = { email: 'admin@club.com', password: 'Password1!' } // pii-access 는 isAdminLike 요구

function loginAs(creds) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(creds), {
    headers: { 'Content-Type': 'application/json' },
    tags: { op: 'login' },
  })
  if (res.status !== 200) { domainErrors.add(1); throw new Error(`Login ${creds.email}: ${res.status}`) }
  const cookie = res.headers['Set-Cookie'] || ''
  const m = cookie.match(/access-token=([^;]+)/)
  if (!m) throw new Error('No access-token')
  return `access-token=${m[1]}`
}

function authGet(cookie, path, opLabel) {
  const t0 = Date.now()
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Cookie: cookie },
    tags: { op: opLabel },
  })
  readLatency.add(Date.now() - t0)
  return res
}

// ── read golden path (smoke/stress) ──────────────────────────────
function runReadPath(cookieHR, cookieAdmin) {
  group('staff_records', () => {
    const r = authGet(cookieHR, '/staff-records', 'list_staff_records')
    check(r, { 'staff list 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    if (r.status === 200 && Array.isArray(r.json()) && r.json().length > 0) {
      const first = r.json()[0]
      const d = authGet(cookieHR, `/staff-records/${first.id}`, 'get_staff_record')
      check(d, { 'staff detail 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    }
  })

  group('hiring_surveys', () => {
    const r = authGet(cookieHR, '/hiring-surveys', 'list_hiring_surveys')
    check(r, { 'surveys 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    if (r.status === 200 && Array.isArray(r.json()) && r.json().length > 0) {
      const first = r.json()[0]
      const d = authGet(cookieHR, `/hiring-surveys/${first.id}`, 'get_hiring_survey')
      check(d, { 'survey detail 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    }
  })

  group('recruitment', () => {
    const list = authGet(cookieHR, '/recruitment/job-postings', 'list_job_postings')
    check(list, { 'postings 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    const hcp = authGet(cookieHR, '/recruitment/headcount-progress', 'headcount_progress')
    check(hcp, { 'headcount<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    const tth = authGet(cookieHR, '/recruitment/time-to-hire', 'time_to_hire')
    check(tth, { 'tth<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    const cph = authGet(cookieHR, '/recruitment/cost-per-hire', 'cost_per_hire')
    check(cph, { 'cph<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
  })

  group('pii_access', () => {
    // 관리자 세션으로 pending 리스트
    const pending = authGet(cookieAdmin, '/pii-access/requests', 'list_pii_pending')
    check(pending, { 'pii pending 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    // HR 본인 요청 목록 (로그인 유저 스코프 → 안전)
    const mine = authGet(cookieHR, '/pii-access/requests/mine', 'my_pii_requests')
    check(mine, { 'pii mine <500': (rr) => rr.status < 500 }) || domainErrors.add(1)
  })
}

// ── IDOR probe scenario ─────────────────────────────────────────
// HR 세션으로 staff-records/1~20 순차 조회.
// canReadHR 통과 → 전부 200 예상 (정상, LEAK 아님).
// 대신 PLAYER 세션으로 동일 프로브 → 403 예상 검증.
function runIdorProbe() {
  const hrCookie = loginAs(LOGIN)
  const playerCookie = (() => {
    try { return loginAs({ email: 'player@club.com', password: 'Password1!' }) }
    catch { return null }
  })()

  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  group('hr_can_read_staff', () => {
    for (const id of ids) {
      const r = authGet(hrCookie, `/staff-records/${id}`, 'idor_hr_staff')
      check(r, { 'HR staff<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    }
  })

  if (playerCookie) {
    group('player_blocked_staff', () => {
      for (const id of ids) {
        const r = authGet(playerCookie, `/staff-records/${id}`, 'idor_player_staff')
        // 예상: 403. 만약 200 이면 LEAK.
        if (r.status === 200) idorLeaks.add(1)
        check(r, { 'PLAYER staff blocked': (rr) => rr.status === 403 }) || domainErrors.add(1)
      }
    })
    group('player_blocked_hiring_survey', () => {
      for (const id of ids) {
        const r = authGet(playerCookie, `/hiring-surveys/${id}`, 'idor_player_survey')
        if (r.status === 200) idorLeaks.add(1)
        check(r, { 'PLAYER survey blocked': (rr) => rr.status === 403 }) || domainErrors.add(1)
      }
    })
  }
}

const smoke = { executor: 'constant-vus', vus: 2, duration: '10s', tags: { scenario: 'smoke' } }
const stress = {
  executor: 'ramping-vus',
  startVUs: 0,
  stages: [
    { duration: '15s', target: 5 },
    { duration: '20s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '10s', target: 0 },
  ],
  tags: { scenario: 'stress' },
}
const idor = { executor: 'per-vu-iterations', vus: 1, iterations: 1, maxDuration: '30s', tags: { scenario: 'idor' } }

export const options = {
  scenarios:
    SCENARIO === 'smoke'  ? { smoke } :
    SCENARIO === 'stress' ? { stress } :
    SCENARIO === 'idor'   ? { idor } :
    (() => { throw new Error(`Unknown SCENARIO: ${SCENARIO}`) })(),
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.20'], // IDOR 프로브는 fail 이 정상 (403 은 not-2xx)
    hr_errors:         ['count<50'],
    hr_idor_leaks:     ['count==0'],
  },
}

export default function () {
  if (SCENARIO === 'idor') {
    runIdorProbe()
    return
  }
  const cookieHR = loginAs(LOGIN)
  const cookieAdmin = loginAs(PII_ADMIN_LOGIN)
  runReadPath(cookieHR, cookieAdmin)
  sleep(1)
}
