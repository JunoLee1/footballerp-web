/*
 * Football ERP — TD (Technical Director) 도메인 Load Test
 *
 * TD 는 별도 endpoint 가 아니라 여러 도메인에 걸친 role (frontOfficeRole=TD).
 * 각 도메인에서 canManageTD 경로가 열려있으므로 TD 세션으로 5개 도메인 골든패스 커버.
 *
 * Endpoints (read golden path · TD 세션):
 *   /coaches                       GET (list + :id + /rounds) — canManageTD
 *   /acquisition-surveys           GET (list + :id) — HEAD_COACH OR TD
 *   /player-callups                GET (list + :id) — TD 결재 관여
 *   /hr-report/{monthly,annual}    GET — canReadHR OR TD
 *   /recruitment/job-postings      GET (list) — canWriteHR OR canManageTD
 *   /training-loads                GET (list + /weekly-summary + /anomalies) — canManageTD
 *
 * Scenarios (SCENARIO env):
 *   smoke  — VUS=2 · 10s
 *   stress — ramping 5→50→100→200 VUs · ~1m45s
 *   idor   — PLAYER 세션으로 TD-only endpoint 프로브 → 403 예상
 *
 * Persona: td@club.com (FRONT_OFFICE + TD)
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=smoke  k6 run loadtest/td-domain.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=stress k6 run loadtest/td-domain.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=idor   k6 run loadtest/td-domain.k6.js
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'smoke'

const readLatency = new Trend('td_read_latency', true)
const domainErrors = new Counter('td_errors')
const idorLeaks = new Counter('td_idor_leaks')

const LOGIN = { email: 'td@club.com', password: 'Password1!' }
const PLAYER_LOGIN = { email: 'player@club.com', password: 'Password1!' }

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

function runReadPath(cookie) {
  group('coaches', () => {
    const r = authGet(cookie, '/coaches', 'list_coaches')
    check(r, { 'coaches 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    const rounds = authGet(cookie, '/coaches/rounds', 'list_coach_rounds')
    check(rounds, { 'coach rounds<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    if (r.status === 200 && Array.isArray(r.json()) && r.json().length > 0) {
      const first = r.json()[0]
      const d = authGet(cookie, `/coaches/${first.id}`, 'get_coach')
      check(d, { 'coach detail 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    }
  })

  group('acquisition_surveys', () => {
    const r = authGet(cookie, '/acquisition-surveys', 'list_acquisition_surveys')
    check(r, { 'acq surveys<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    if (r.status === 200 && Array.isArray(r.json()) && r.json().length > 0) {
      const first = r.json()[0]
      const d = authGet(cookie, `/acquisition-surveys/${first.id}`, 'get_acquisition_survey')
      check(d, { 'acq survey detail<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    }
  })

  group('player_callups', () => {
    const r = authGet(cookie, '/player-callups', 'list_player_callups')
    check(r, { 'callups<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    if (r.status === 200 && Array.isArray(r.json()) && r.json().length > 0) {
      const first = r.json()[0]
      const d = authGet(cookie, `/player-callups/${first.id}`, 'get_player_callup')
      check(d, { 'callup detail<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    }
  })

  group('hr_report', () => {
    const m = authGet(cookie, '/hr-report/monthly', 'hr_report_monthly')
    check(m, { 'hr monthly<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    const a = authGet(cookie, '/hr-report/annual', 'hr_report_annual')
    check(a, { 'hr annual<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
  })

  group('recruitment', () => {
    const r = authGet(cookie, '/recruitment/job-postings', 'list_job_postings_td')
    check(r, { 'postings<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
  })

  group('training_loads', () => {
    const r = authGet(cookie, '/training-loads', 'list_training_loads')
    check(r, { 'training-loads<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    const wk = authGet(cookie, '/training-loads/weekly-summary', 'training_weekly_summary')
    check(wk, { 'weekly<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
    const an = authGet(cookie, '/training-loads/anomalies', 'training_anomalies')
    check(an, { 'anomalies<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
  })
}

// ── IDOR probe: PLAYER 세션으로 TD-guarded endpoint 접근 → 403 예상 ──
function runIdorProbe() {
  const playerCookie = loginAs(PLAYER_LOGIN)

  const tdOnlyEndpoints = [
    '/coaches',                                  // canManageTD 없이 list 접근 가능? 체크
    '/coaches/rounds',                           // canManageTD
    '/acquisition-surveys',                      // canCreate 는 TD/HEAD_COACH, list 는 auth 만
    '/hr-report/monthly',                        // requireHR
    '/hr-report/annual',                         // requireHR
    '/training-loads',                           // checkTrainingRead
  ]

  group('player_probe_td_endpoints', () => {
    for (const ep of tdOnlyEndpoints) {
      const r = authGet(playerCookie, ep, `probe_${ep.replace(/[/-]/g, '_')}`)
      if (r.status === 200) {
        idorLeaks.add(1)
        console.log(`LEAK: PLAYER → ${ep} → 200`)
      }
    }
  })
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
    http_req_failed:   ['rate<0.30'], // TD read 중 일부 4xx 가능 (권한 boundary)
    td_errors:         ['count<50'],
    td_idor_leaks:     ['count==0'],
  },
}

export default function () {
  if (SCENARIO === 'idor') { runIdorProbe(); return }
  const cookie = loginAs(LOGIN)
  runReadPath(cookie)
  sleep(1)
}
