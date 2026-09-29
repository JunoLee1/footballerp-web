/*
 * Football ERP — Department CRUD Load Test (부서 · 부서내 팀)
 *
 * Scenarios (SCENARIO env var):
 *   smoke    — VUS=2 · 10s · 읽기 골든패스 (list · get · members · job-titles)
 *   stress   — ramping 5→50→100→200 VUs · ~1m45s · 읽기 stress
 *   crud     — 단일 VU · CRUD 라이프사이클 왕복 (create → get → update → create sub → delete sub → delete parent)
 *              → 모든 리소스 cleanup 후 종료, DB 상태 무변경
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=smoke  k6 run loadtest/department.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=stress k6 run loadtest/department.k6.js
 *   BASE_URL=http://localhost:3001/api SCENARIO=crud   k6 run loadtest/department.k6.js
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'smoke'

const readLatency = new Trend('dept_read_latency', true)
const writeLatency = new Trend('dept_write_latency', true)
const domainErrors = new Counter('dept_errors')

// admin@club.com 은 canManage(ADMIN) + canRead 모두 통과.
const LOGIN = { email: 'admin@club.com', password: 'Password1!' }

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

function authDel(cookie, path, opLabel) {
  const t0 = Date.now()
  const res = http.del(`${BASE_URL}${path}`, null, {
    headers: { Cookie: cookie },
    tags: { op: opLabel },
  })
  writeLatency.add(Date.now() - t0)
  return res
}

// ── 읽기 golden path (smoke, stress) ──────────────────────────────
function runReadPath(cookie) {
  group('list', () => {
    const res = authGet(cookie, '/departments', 'list_departments')
    check(res, {
      'list status 200': (r) => r.status === 200,
      'list is array': (r) => Array.isArray(r.json()),
    }) || domainErrors.add(1)

    if (res.status === 200 && Array.isArray(res.json()) && res.json().length > 0) {
      const first = res.json()[0]
      const rest = res.json().slice(0, 3)

      group('get_detail', () => {
        for (const d of rest) {
          const r = authGet(cookie, `/departments/${d.id}`, 'get_department')
          check(r, { 'get status 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
        }
      })

      group('headcount', () => {
        const r = authGet(cookie, `/departments/${first.id}/headcount`, 'get_headcount')
        check(r, { 'headcount status 200': (rr) => rr.status === 200 }) || domainErrors.add(1)
      })

      group('members', () => {
        const r = authGet(cookie, `/departments/${first.id}/members`, 'list_members')
        check(r, { 'members status<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
      })

      group('job_titles', () => {
        const r = authGet(cookie, `/departments/${first.id}/job-titles`, 'list_job_titles')
        check(r, { 'job-titles status<500': (rr) => rr.status < 500 }) || domainErrors.add(1)
      })
    }
  })
}

// ── CRUD 라이프사이클 (crud scenario) ─────────────────────────────
function runCrudPath(cookie) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const parentName = `LT_PARENT_${stamp}`
  const subName = `LT_TEAM_${stamp}`
  let parentId = null
  let subId = null

  group('crud_lifecycle', () => {
    // 1) 부모 부서 생성
    const cRes = authPost(cookie, '/departments', { name: parentName }, 'create_parent')
    if (!check(cRes, { 'create parent 201': (r) => r.status === 201 || r.status === 200 })) {
      domainErrors.add(1)
      return
    }
    parentId = cRes.json().id
    if (!parentId) { domainErrors.add(1); return }

    // 2) GET 조회
    const gRes = authGet(cookie, `/departments/${parentId}`, 'get_parent')
    check(gRes, { 'get parent 200': (r) => r.status === 200 }) || domainErrors.add(1)

    // 3) PATCH 업데이트
    const uRes = authPatch(cookie, `/departments/${parentId}`, { name: `${parentName}_updated` }, 'update_parent')
    check(uRes, { 'update parent 200': (r) => r.status === 200 }) || domainErrors.add(1)

    // 4) 하위 팀 생성 (parentId 지정)
    const subRes = authPost(cookie, '/departments', { name: subName, parentId }, 'create_sub')
    if (check(subRes, { 'create sub 201/200': (r) => r.status === 201 || r.status === 200 })) {
      subId = subRes.json().id
    } else {
      domainErrors.add(1)
    }

    // 5) headcount 조회 (신규 팀)
    if (subId) {
      const hcRes = authGet(cookie, `/departments/${subId}/headcount`, 'headcount_sub')
      check(hcRes, { 'headcount sub 200': (r) => r.status === 200 }) || domainErrors.add(1)
    }

    // 6) job-title CRUD (신규 팀 하위)
    if (subId) {
      const jtCreate = authPost(cookie, `/departments/${subId}/job-titles`, { label: `TITLE_${stamp}` }, 'create_job_title')
      const okCreate = check(jtCreate, { 'create job-title 200/201': (r) => r.status === 200 || r.status === 201 })
      if (!okCreate) domainErrors.add(1)

      if (okCreate) {
        const titleId = jtCreate.json().id
        if (titleId) {
          const jtDel = authDel(cookie, `/departments/${subId}/job-titles/${titleId}`, 'delete_job_title')
          check(jtDel, { 'delete job-title 200/204': (r) => r.status === 200 || r.status === 204 }) || domainErrors.add(1)
        }
      }
    }
  })

  // 7) cleanup: 하위 → 상위 순 DELETE (children 있으면 부모 삭제 실패하므로 순서 중요)
  group('cleanup', () => {
    if (subId) {
      const r = authDel(cookie, `/departments/${subId}`, 'delete_sub')
      check(r, { 'delete sub 200/204': (rr) => rr.status === 200 || rr.status === 204 }) || domainErrors.add(1)
    }
    if (parentId) {
      const r = authDel(cookie, `/departments/${parentId}`, 'delete_parent')
      check(r, { 'delete parent 200/204': (rr) => rr.status === 200 || rr.status === 204 }) || domainErrors.add(1)
    }
  })
}

// ── scenarios ─────────────────────────────────────────────────────
const smoke = {
  executor: 'constant-vus', vus: 2, duration: '10s', tags: { scenario: 'smoke' },
}
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
const crud = {
  executor: 'constant-vus', vus: 1, duration: '30s', tags: { scenario: 'crud' },
}

export const options = {
  scenarios:
    SCENARIO === 'smoke'  ? { smoke } :
    SCENARIO === 'stress' ? { stress } :
    SCENARIO === 'crud'   ? { crud } :
    (() => { throw new Error(`Unknown SCENARIO: ${SCENARIO} (expected: smoke|stress|crud)`) })(),
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.10'],
    dept_errors:       ['count<50'],
  },
}

export default function () {
  const cookie = login()
  if (SCENARIO === 'crud') {
    runCrudPath(cookie)
  } else {
    runReadPath(cookie)
  }
  sleep(1)
}
