/*
 * Football ERP — 공통 보안 테스트 (TESTTODO "공통 보안 테스트 (전 도메인)")
 *
 * 6 종 보안 프로브 통합. 각 SCENARIO 는 특정 위협 카테고리를 커버.
 *
 * SCENARIOs (SCENARIO env):
 *   no_auth        — 인증 없이 protected endpoint 접근 → 401 예상
 *   token_tamper   — JWT 토큰 없음/변조/alg:none 3종 프로브 → 401 예상
 *   sql_fuzz       — 쿼리 파라미터에 SQL injection 페이로드 → 500 없어야 함
 *   oversize       — 오버사이즈 문자열 body → 413 or 400 예상 (500 없어야)
 *   stack_trace    — 5xx 트리거 시도 → response body 에 stack 노출 없어야
 *   mass_write     — admin/create 반복 요청 → rate-limit 유무 확인
 *
 * 별도 (인프라 감사 · 코드 리뷰만으로 확인):
 *   - 비밀번호 해싱: bcrypt cost 10 (`lib/hash.ts`) 이미 ✅
 *   - 개인정보 마스킹: `maskPii.ts` 이미 ✅ (본 스크립트는 실측 재확인)
 *   - 보안 알림: `notification.repo.createForAdmin("LOGIN_LOCKOUT_24H", ...)` 이미 ✅
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=no_auth k6 run loadtest/common-security-probe.k6.js
 *   ... (각 SCENARIO 별 실행)
 */

import http from 'k6/http'
import { check } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'no_auth'

const findings = new Counter('security_findings')
const checksCount = new Counter('security_checks')
const respLatency = new Trend('security_latency', true)

const CREDS = { admin: { email: 'admin@club.com', password: 'Password1!' } }

function login(creds) {
  const r = http.post(`${BASE_URL}/auth/login`, JSON.stringify(creds), {
    headers: { 'Content-Type': 'application/json' },
  })
  if (r.status !== 200) throw new Error(`Login: ${r.status}`)
  const c = r.headers['Set-Cookie'] || ''
  const m = c.match(/access-token=([^;]+)/)
  if (!m) throw new Error('No access-token')
  return `access-token=${m[1]}`
}

// ── Protected endpoint 목록 (도메인 다양성 커버) ──────────────────
const PROTECTED_ENDPOINTS = [
  '/departments', '/payroll/configs', '/payroll/salaries',
  '/contracts', '/players', '/matches', '/seasons',
  '/operating-expenses?seasonId=1', '/medical-expenses',
  '/notifications/my', '/staff-records', '/audit-logs',
  '/hiring-surveys', '/plan-reports', '/reports',
  '/facility/reservations', '/facility/maintenance',
  '/equipment', '/equipment/loans', '/asset-requests',
  '/sponsorships', '/budget-control', '/sales/summary?seasonId=1',
  '/coaches', '/training', '/injuries/active',
  '/videos', '/inventory', '/software-licenses',
]

// ── 1. no_auth: 인증 없이 protected endpoint 접근 → 401 예상 ────
function runNoAuth() {
  for (const path of PROTECTED_ENDPOINTS) {
    const t0 = Date.now()
    const r = http.get(`${BASE_URL}${path}`, {
      // no Cookie header
      tags: { op: `no_auth:${path}` },
    })
    respLatency.add(Date.now() - t0)
    checksCount.add(1)
    const isBlocked = r.status === 401 || r.status === 403 || r.status === 404
    const passed = check(r, { [`${path} 401/403/404`]: () => isBlocked })
    if (!passed) {
      findings.add(1)
      console.log(`🚨 NO_AUTH LEAK: ${path} → ${r.status}`)
    }
  }
}

// ── 2. token_tamper: JWT 변조 3종 ─────────────────────────────────
function runTokenTamper() {
  const validCookie = login(CREDS.admin)
  const validToken = validCookie.replace(/^access-token=/, '')

  const tampered = [
    { name: 'garbage', cookie: 'access-token=this.is.not.a.jwt' },
    { name: 'signature_flip', cookie: `access-token=${validToken.slice(0, -5)}XXXXX` },
    // alg:none 시도 — 헤더를 { "alg": "none", "typ": "JWT" } 로 교체
    { name: 'alg_none', cookie: `access-token=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${validToken.split('.')[1]}.` },
  ]

  const target = '/notifications/my' // 인증 필요, 부작용 없음

  for (const t of tampered) {
    const t0 = Date.now()
    const r = http.get(`${BASE_URL}${target}`, {
      headers: { Cookie: t.cookie },
      tags: { op: `tamper:${t.name}` },
    })
    respLatency.add(Date.now() - t0)
    checksCount.add(1)
    const isBlocked = r.status === 401
    const passed = check(r, { [`${t.name} → 401`]: () => isBlocked })
    if (!passed) {
      findings.add(1)
      console.log(`🚨 TAMPER LEAK: ${t.name} → ${r.status}`)
    }
  }
}

// ── 3. sql_fuzz: 쿼리 파라미터에 injection 페이로드 → 500 없어야 ──
function runSqlFuzz() {
  const cookie = login(CREDS.admin)

  const payloads = [
    "1' OR '1'='1",
    "1; DROP TABLE users; --",
    "1 UNION SELECT NULL--",
    "1' UNION SELECT password FROM \"User\"--",
    "%27%20OR%20%271%27%3D%271", // URL-encoded ' OR '1'='1
  ]

  // ID 파라미터가 필요한 endpoint 들
  const targets = [
    (p) => `/departments/${p}`,
    (p) => `/players/${p}`,
    (p) => `/matches/${p}`,
    (p) => `/contracts/${p}`,
    (p) => `/notifications/${p}/read`, // PATCH 는 별도
  ]

  for (const buildPath of targets) {
    for (const payload of payloads) {
      const path = buildPath(encodeURIComponent(payload))
      const t0 = Date.now()
      const r = http.get(`${BASE_URL}${path}`, {
        headers: { Cookie: cookie },
        tags: { op: `sql_fuzz` },
      })
      respLatency.add(Date.now() - t0)
      checksCount.add(1)
      const noServerErr = r.status < 500
      const passed = check(r, { 'no 5xx': () => noServerErr })
      if (!passed) {
        findings.add(1)
        console.log(`🚨 SQL_FUZZ 500: ${path.slice(0, 60)} → ${r.status}`)
      }
    }
  }
}

// ── 4. oversize: 매우 큰 문자열 body → 413/400 예상 ───────────────
function runOversize() {
  const cookie = login(CREDS.admin)
  const bigString = 'A'.repeat(1024 * 1024 * 5) // 5MB

  // POST body 로 시도 — 큰 body 를 받는 create endpoint
  const targets = [
    { path: '/departments', body: { name: bigString } },
    { path: '/inventory', body: { name: bigString, unit: 'ea', quantity: 1, minThreshold: 0 } },
    { path: '/software-licenses', body: { name: bigString, vendor: 'X', totalSeats: 1 } },
  ]

  for (const t of targets) {
    const t0 = Date.now()
    const r = http.post(`${BASE_URL}${t.path}`, JSON.stringify(t.body), {
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      tags: { op: `oversize:${t.path}` },
    })
    respLatency.add(Date.now() - t0)
    checksCount.add(1)
    // 200/201 이면 무한 크기 허용 (문제), 500 이면 서버 크래시 (문제)
    // 400/413 은 정상 차단
    const validRejection = r.status === 400 || r.status === 413 || r.status === 422
    const acceptedButShouldNot = r.status >= 200 && r.status < 300
    const passed = check(r, { 'rejected properly': () => validRejection })
    if (acceptedButShouldNot) {
      findings.add(1)
      console.log(`🚨 OVERSIZE ACCEPTED: ${t.path} → ${r.status}`)
    } else if (r.status >= 500) {
      findings.add(1)
      console.log(`🚨 OVERSIZE 500: ${t.path} → ${r.status}`)
    }
    if (!passed) console.log(`ⓘ OVERSIZE ${t.path}: ${r.status}`)
  }
}

// ── 5. stack_trace: 5xx 트리거 후 body 에 stack 노출 없어야 ───────
function runStackTrace() {
  const cookie = login(CREDS.admin)

  // 5xx 유발할 만한 요청들
  const triggers = [
    { method: 'GET', path: '/transfers/recalls' },      // 알려진 #564 500
    { method: 'GET', path: '/payroll/salaries/9999999' }, // 존재하지 않는 큰 ID
    { method: 'POST', path: '/departments', body: { name: null } }, // null 값
    { method: 'GET', path: '/matches/abc' },            // ID 파싱 실패 (문자)
  ]

  for (const t of triggers) {
    const t0 = Date.now()
    const opts = { headers: { Cookie: cookie }, tags: { op: `stack:${t.path}` } }
    let r
    if (t.method === 'POST') {
      opts.headers['Content-Type'] = 'application/json'
      r = http.post(`${BASE_URL}${t.path}`, JSON.stringify(t.body || {}), opts)
    } else {
      r = http.get(`${BASE_URL}${t.path}`, opts)
    }
    respLatency.add(Date.now() - t0)
    checksCount.add(1)

    // stack trace 시그니처: "at ", "Error:", ".ts:", ".js:", "node_modules"
    const body = r.body || ''
    const looksLikeStack = /\bat\s+\w+\s*\(|Error:\s+\w+|\.ts:\d+|\.js:\d+|node_modules/.test(String(body))
    const passed = check(r, { 'no stack trace': () => !looksLikeStack })
    if (!passed) {
      findings.add(1)
      console.log(`🚨 STACK LEAK: ${t.path} → status ${r.status} · body: ${String(body).slice(0, 150)}`)
    }
  }
}

// ── 6. mass_write: admin/create 반복 → rate-limit 유무 확인 ───────
function runMassWrite() {
  const cookie = login(CREDS.admin)
  const N = 30

  // idempotent 하지 않지만 크기 작은 create — department 는 unique name 필요하니 stamp
  let successCount = 0
  let rateLimitedCount = 0
  for (let i = 0; i < N; i++) {
    const name = `MW_${Date.now()}_${i}_${Math.floor(Math.random() * 1e6)}`
    const t0 = Date.now()
    const r = http.post(`${BASE_URL}/departments`, JSON.stringify({ name }), {
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      tags: { op: 'mass_write' },
    })
    respLatency.add(Date.now() - t0)
    checksCount.add(1)
    if (r.status === 429) rateLimitedCount++
    else if (r.status === 201 || r.status === 200) {
      successCount++
      // cleanup — 아직 rate limit 안 걸렸으면 지움
      const id = (() => { try { return r.json().id } catch { return null } })()
      if (id) {
        http.del(`${BASE_URL}/departments/${id}`, null, { headers: { Cookie: cookie } })
      }
    }
  }

  if (rateLimitedCount === 0) {
    findings.add(1)
    console.log(`🚨 MASS_WRITE: ${N} 요청 전부 통과 (rate-limit 미장착) — successCount=${successCount}`)
  } else {
    console.log(`✅ MASS_WRITE: ${rateLimitedCount}건 429 rate-limited (of ${N})`)
  }
}

export const options = {
  scenarios: {
    run: { executor: 'per-vu-iterations', vus: 1, iterations: 1, maxDuration: '90s' },
  },
  thresholds: {
    security_findings: ['count==0'],
  },
}

export default function () {
  switch (SCENARIO) {
    case 'no_auth':      return runNoAuth()
    case 'token_tamper': return runTokenTamper()
    case 'sql_fuzz':     return runSqlFuzz()
    case 'oversize':     return runOversize()
    case 'stack_trace':  return runStackTrace()
    case 'mass_write':   return runMassWrite()
    default: throw new Error(`Unknown SCENARIO: ${SCENARIO}`)
  }
}
