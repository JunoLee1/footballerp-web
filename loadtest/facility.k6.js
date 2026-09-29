/*
 * Football ERP — 시설·자산 도메인 Load Test (facility)
 *
 * Endpoints (/api/facility):
 *   READS  : /reservations, /inspections, /maintenance, /preventive-schedules
 *   WRITES : maintenance CRUD (create → get → update → status → approve → reject → delete)
 *
 * Scenarios (SCENARIO env):
 *   smoke  — VUS=2 · 10s · 4 read endpoints
 *   stress — ramping 5→50→100→200 VUs · ~1m45s
 *   crud   — 1 VU · maintenance lifecycle (create → get → update → reject cleanup)
 *
 * Persona: facility.manager@club.com (FACILITY_MANAGER frontOfficeRole)
 *          → canWriteFacility 통과 (create/update/reject 가능)
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=smoke  k6 run loadtest/facility.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=stress k6 run loadtest/facility.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=crud   k6 run loadtest/facility.k6.js
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'smoke'

const readLatency = new Trend('facility_read_latency', true)
const writeLatency = new Trend('facility_write_latency', true)
const domainErrors = new Counter('facility_errors')

const LOGIN = { email: 'facility.manager@club.com', password: 'Password1!' }

function login() {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(LOGIN), {
    headers: { 'Content-Type': 'application/json' },
    tags: { op: 'login' },
  })
  if (res.status !== 200) {
    domainErrors.add(1)
    throw new Error(`Login failed: ${res.status}`)
  }
  const cookie = res.headers['Set-Cookie'] || ''
  const match = cookie.match(/access-token=([^;]+)/)
  if (!match) throw new Error('No access-token cookie')
  return `access-token=${match[1]}`
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
function authPost(cookie, path, body, opLabel) {
  const t0 = Date.now()
  const res = http.post(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    tags: { op: opLabel },
  })
  writeLatency.add(Date.now() - t0)
  return res
}
function authPatch(cookie, path, body, opLabel) {
  const t0 = Date.now()
  const res = http.patch(`${BASE_URL}${path}`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    tags: { op: opLabel },
  })
  writeLatency.add(Date.now() - t0)
  return res
}

// ── read golden path ──────────────────────────────────────────────
function runReadPath(cookie) {
  group('reads', () => {
    for (const [path, label] of [
      ['/facility/reservations',         'list_reservations'],
      ['/facility/inspections',          'list_inspections'],
      ['/facility/maintenance',          'list_maintenance'],
      ['/facility/preventive-schedules', 'list_preventive_schedules'],
    ]) {
      const r = authGet(cookie, path, label)
      check(r, { [`${label} status<500`]: (rr) => rr.status < 500 }) || domainErrors.add(1)
    }
  })
}

// ── maintenance CRUD lifecycle ────────────────────────────────────
function runCrudPath(cookie) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  let maintId = null

  group('crud', () => {
    // 1) create maintenance (NORMAL priority — EMERGENCY 는 알림 폭발)
    const cRes = authPost(cookie, '/facility/maintenance', {
      title: `LT_MAINT_${stamp}`,
      description: 'k6 load test — auto-generated',
      priority: 'NORMAL',
    }, 'create_maintenance')
    if (!check(cRes, { 'create 201': (r) => r.status === 201 })) {
      domainErrors.add(1)
      return
    }
    maintId = cRes.json().id
    if (!maintId) { domainErrors.add(1); return }

    // 2) GET
    const gRes = authGet(cookie, `/facility/maintenance/${maintId}`, 'get_maintenance')
    check(gRes, { 'get 200': (r) => r.status === 200 }) || domainErrors.add(1)

    // 3) PATCH (description 변경)
    const uRes = authPatch(cookie, `/facility/maintenance/${maintId}`, {
      description: `k6 updated ${stamp}`,
    }, 'update_maintenance')
    check(uRes, { 'update 200': (r) => r.status === 200 }) || domainErrors.add(1)
  })

  // cleanup: OPEN → IN_PROGRESS → PENDING_APPROVAL → REJECTED (3-step)
  // NOTE: controller VALID_TRANSITIONS 는 OPEN→REJECTED 를 허용하나
  //       service.updateStatus ALLOWED = {IN_PROGRESS, PENDING_APPROVAL} 만 통과 → 불일치.
  //       REJECTED 종결은 POST /:id/reject 로만 가능 (PENDING_APPROVAL/APPROVED 상태 요구).
  if (maintId) {
    group('cleanup', () => {
      const s1 = authPatch(cookie, `/facility/maintenance/${maintId}/status`, { status: 'IN_PROGRESS' }, 'to_in_progress')
      check(s1, { 's1 200': (r) => r.status === 200 }) || domainErrors.add(1)

      const s2 = authPatch(cookie, `/facility/maintenance/${maintId}/status`, { status: 'PENDING_APPROVAL' }, 'to_pending')
      check(s2, { 's2 200': (r) => r.status === 200 }) || domainErrors.add(1)

      const r = authPost(cookie, `/facility/maintenance/${maintId}/reject`, { reason: 'k6 cleanup' }, 'reject_maintenance')
      check(r, { 'reject 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
    })
  }
}

// ── scenarios ─────────────────────────────────────────────────────
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
const crud = { executor: 'constant-vus', vus: 1, duration: '30s', tags: { scenario: 'crud' } }

export const options = {
  scenarios:
    SCENARIO === 'smoke'  ? { smoke } :
    SCENARIO === 'stress' ? { stress } :
    SCENARIO === 'crud'   ? { crud } :
    (() => { throw new Error(`Unknown SCENARIO: ${SCENARIO}`) })(),
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.10'],
    facility_errors:   ['count<50'],
  },
}

export default function () {
  const cookie = login()
  if (SCENARIO === 'crud') runCrudPath(cookie)
  else runReadPath(cookie)
  sleep(1)
}
