/*
 * Football ERP — 팀·시즌·경기 도메인 Load Test
 *
 * Endpoints (read-only path):
 *   /teams                         GET (all + :id)
 *   /seasons                       GET (all + /active + :id)
 *   /matches                       GET (all + :id + /remaining-capacity)
 *
 * Scenarios (SCENARIO env):
 *   smoke  — VUS=2 · 10s
 *   stress — ramping 5→50→100→200 VUs · ~1m45s
 *
 * Persona: admin@club.com (canRead everything · GM 도 동일)
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=smoke  k6 run loadtest/teams-seasons-matches.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=stress k6 run loadtest/teams-seasons-matches.k6.js
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'smoke'

const readLatency = new Trend('tsm_read_latency', true)
const domainErrors = new Counter('tsm_errors')

const LOGIN = { email: 'admin@club.com', password: 'Password1!' }

function login() {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(LOGIN), {
    headers: { 'Content-Type': 'application/json' },
    tags: { op: 'login' },
  })
  if (res.status !== 200) { domainErrors.add(1); throw new Error(`Login: ${res.status}`) }
  const cookie = res.headers['Set-Cookie'] || ''
  const m = cookie.match(/access-token=([^;]+)/)
  if (!m) throw new Error('No access-token cookie')
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
  group('teams', () => {
    const r = authGet(cookie, '/teams', 'list_teams')
    check(r, { 'teams 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    if (r.status === 200 && Array.isArray(r.json()) && r.json().length > 0) {
      const first = r.json()[0]
      const d = authGet(cookie, `/teams/${first.id}`, 'get_team')
      check(d, { 'team detail 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    }
  })

  group('seasons', () => {
    const r = authGet(cookie, '/seasons', 'list_seasons')
    check(r, { 'seasons 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    const active = authGet(cookie, '/seasons/active', 'get_active_season')
    check(active, { 'active 200/404': (rr) => rr.status === 200 || rr.status === 404 }) || domainErrors.add(1)
    if (r.status === 200 && Array.isArray(r.json()) && r.json().length > 0) {
      const first = r.json()[0]
      const d = authGet(cookie, `/seasons/${first.id}`, 'get_season')
      check(d, { 'season detail 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    }
  })

  group('matches', () => {
    const r = authGet(cookie, '/matches', 'list_matches')
    check(r, { 'matches 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    if (r.status === 200 && Array.isArray(r.json()) && r.json().length > 0) {
      const first = r.json()[0]
      const d = authGet(cookie, `/matches/${first.id}`, 'get_match')
      check(d, { 'match detail 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
      const rc = authGet(cookie, `/matches/${first.id}/remaining-capacity`, 'match_remaining_capacity')
      check(rc, { 'remaining-capacity <500': (rr) => rr.status < 500 }) || domainErrors.add(1)
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

export const options = {
  scenarios:
    SCENARIO === 'smoke'  ? { smoke } :
    SCENARIO === 'stress' ? { stress } :
    (() => { throw new Error(`Unknown SCENARIO: ${SCENARIO}`) })(),
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.10'],
    tsm_errors:        ['count<50'],
  },
}

export default function () {
  const cookie = login()
  runReadPath(cookie)
  sleep(1)
}
