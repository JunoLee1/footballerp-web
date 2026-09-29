/*
 * Football ERP — Role Boundary Security Probe
 *
 * TESTTODO Sections 13, 14 심층 검증:
 *  - Payroll: 재무팀장 / GM / 구단 관리자만 허용, 나머지 401/403
 *  - Operating Expenses / Medical Expenses / Employee Contracts / Players:
 *    프론트오피스 + 코칭스태프 만 조회 가능
 *
 * 각 endpoint × 각 role 조합으로 매트릭스 프로브. 예상 결과와 다르면 domainErrors++.
 *
 * Scenarios (SCENARIO env):
 *   probe — 1 VU · 1 iteration · 전 매트릭스 스캔
 *
 * Usage:
 *   BASE_URL=http://localhost:3001/api SCENARIO=probe k6 run loadtest/role-boundary-probe.k6.js
 */

import http from 'k6/http'
import { check, group } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001/api'
const SCENARIO = __ENV.SCENARIO || 'probe'

const boundaryLeaks = new Counter('boundary_leaks')
const boundaryChecks = new Counter('boundary_checks')
const readLatency = new Trend('boundary_latency', true)

// 모든 role 로그인 (seed 계정 기준)
const ROLE_CREDS = {
  ADMIN:            { email: 'admin@club.com',          password: 'Password1!' },
  GM:               { email: 'gm@club.com',             password: 'Password1!' },
  FINANCE_MANAGER:  { email: 'finance@club.com',        password: 'Password1!' },
  HR_MANAGER:       { email: 'hr@club.com',             password: 'Password1!' },
  ASSET_MANAGER:    { email: 'asset@club.com',          password: 'Password1!' },
  COACH:            { email: 'coach@club.com',          password: 'Password1!' },
  PLAYER:           { email: 'player@club.com',         password: 'Password1!' },
  MEDICAL_DIRECTOR: { email: 'meddir@club.com',         password: 'Password1!' },
  TD:               { email: 'td@club.com',             password: 'Password1!' },
  FACILITY_MANAGER: { email: 'facility.manager@club.com', password: 'Password1!' },
}

function login(creds) {
  const res = http.post(`${BASE_URL}/auth/login`, JSON.stringify(creds), {
    headers: { 'Content-Type': 'application/json' },
    tags: { op: 'login' },
  })
  if (res.status !== 200) return null
  const cookie = res.headers['Set-Cookie'] || ''
  const m = cookie.match(/access-token=([^;]+)/)
  return m ? `access-token=${m[1]}` : null
}

function probe(cookie, path, opLabel) {
  const t0 = Date.now()
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Cookie: cookie },
    tags: { op: opLabel },
  })
  readLatency.add(Date.now() - t0)
  return res
}

// ── 매트릭스 정의 ────────────────────────────────────────────────
// allowed = 정상 접근 (200 예상), blocked = 차단 (401/403 예상)

const PAYROLL_PATHS = ['/payroll/configs', '/payroll/salaries']
const EXPENSE_PATHS = ['/operating-expenses?seasonId=1', '/medical-expenses', '/employee-contracts']
const PLAYER_PATH   = '/players'

// Payroll: FINANCE_MANAGER / GM / ADMIN 만 허용
const PAYROLL_ALLOWED = ['ADMIN', 'GM', 'FINANCE_MANAGER']
const PAYROLL_BLOCKED = ['HR_MANAGER', 'ASSET_MANAGER', 'COACH', 'PLAYER', 'MEDICAL_DIRECTOR', 'TD', 'FACILITY_MANAGER']

// Section 14: FRONT_OFFICE + COACHING_STAFF 만 허용
// (실무 role 매핑: ADMIN/GM/FINANCE/HR/ASSET/TD/FACILITY 는 FRONT_OFFICE 산하, COACH/MEDICAL 은 COACHING_STAFF)
const EXPENSE_ALLOWED = ['ADMIN', 'GM', 'FINANCE_MANAGER', 'HR_MANAGER', 'ASSET_MANAGER', 'TD',
                          'FACILITY_MANAGER', 'COACH', 'MEDICAL_DIRECTOR']
const EXPENSE_BLOCKED = ['PLAYER']  // AGENT/GUARDIAN 은 없어서 제외

// Player 조회는 대부분 role 이 접근 가능 (기존 사용 확인) — reference

export const options = {
  scenarios: {
    probe: { executor: 'per-vu-iterations', vus: 1, iterations: 1, maxDuration: '60s' },
  },
  thresholds: {
    boundary_leaks: ['count==0'],
  },
}

export default function () {
  // 로그인
  const cookies = {}
  for (const [role, creds] of Object.entries(ROLE_CREDS)) {
    cookies[role] = login(creds)
  }

  const results = { payroll: { pass: 0, leak: 0 }, expense: { pass: 0, leak: 0 } }

  group('payroll_boundary', () => {
    for (const path of PAYROLL_PATHS) {
      for (const role of PAYROLL_ALLOWED) {
        if (!cookies[role]) continue
        const r = probe(cookies[role], path, `payroll:allowed:${role}`)
        boundaryChecks.add(1)
        const ok = r.status === 200
        check(r, { [`${role} allowed on ${path}`]: () => ok })
        if (!ok) console.log(`⚠️  ${role} expected 200 on ${path}, got ${r.status}`)
      }
      for (const role of PAYROLL_BLOCKED) {
        if (!cookies[role]) continue
        const r = probe(cookies[role], path, `payroll:blocked:${role}`)
        boundaryChecks.add(1)
        const isBlocked = r.status === 401 || r.status === 403
        if (!isBlocked && r.status === 200) {
          boundaryLeaks.add(1)
          results.payroll.leak++
          console.log(`🚨 LEAK: ${role} → ${path} → ${r.status}`)
        } else {
          results.payroll.pass++
        }
        check(r, { [`${role} blocked on ${path}`]: () => isBlocked })
      }
    }
  })

  group('expense_boundary', () => {
    for (const path of EXPENSE_PATHS) {
      for (const role of EXPENSE_ALLOWED) {
        if (!cookies[role]) continue
        const r = probe(cookies[role], path, `expense:allowed:${role}`)
        boundaryChecks.add(1)
        // Allowed 는 200 or 404 (record 미존재 OK) 허용, 401/403 이면 잘못된 차단
        const notWronglyBlocked = r.status !== 401 && r.status !== 403
        check(r, { [`${role} allowed on ${path}`]: () => notWronglyBlocked })
        if (!notWronglyBlocked) console.log(`⚠️  ${role} unexpectedly blocked on ${path}: ${r.status}`)
      }
      for (const role of EXPENSE_BLOCKED) {
        if (!cookies[role]) continue
        const r = probe(cookies[role], path, `expense:blocked:${role}`)
        boundaryChecks.add(1)
        const isBlocked = r.status === 401 || r.status === 403
        if (!isBlocked && r.status === 200) {
          boundaryLeaks.add(1)
          results.expense.leak++
          console.log(`🚨 LEAK: ${role} → ${path} → ${r.status}`)
        } else {
          results.expense.pass++
        }
        check(r, { [`${role} blocked on ${path}`]: () => isBlocked })
      }
    }
  })

  group('players_boundary', () => {
    for (const role of Object.keys(ROLE_CREDS)) {
      if (!cookies[role]) continue
      const r = probe(cookies[role], PLAYER_PATH, `players:${role}`)
      boundaryChecks.add(1)
      check(r, { [`${role} on ${PLAYER_PATH} response<500`]: () => r.status < 500 })
    }
  })

  console.log(`payroll: ${results.payroll.pass} blocked, ${results.payroll.leak} LEAK`)
  console.log(`expense: ${results.expense.pass} blocked, ${results.expense.leak} LEAK`)
}
