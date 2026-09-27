#!/usr/bin/env node
// GM authorized-access smoke — GM (isAdminLike) 이 각 도메인의 대표 endpoint 에
// 정상 접근 (200/2xx) 하는지 확인. 403/500/네트워크 실패는 regression.
// HTTP_PROXY=http://127.0.0.1:3002 로 Burp 라우팅 가능.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE = process.env.BASE_URL || 'http://localhost:3001/api'
const OUT = path.dirname(new URL(import.meta.url).pathname)
const PW = 'Password1!'
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY
const proxyArg = PROXY ? ['-x', PROXY] : []
if (PROXY) console.log(`[proxy] routing via ${PROXY}`)

const jar = '/tmp/gm-smoke.txt'
fs.writeFileSync(jar, '')
const loginCmd = `curl -s -o /dev/null ${proxyArg.map((a) => `'${a}'`).join(' ')} -X POST '${BASE}/auth/login' -H 'Content-Type: application/json' -d '${JSON.stringify({ email: 'gm@club.com', password: PW })}' -c '${jar}' -w '%{http_code}'`
const loginStatus = Number(execSync(loginCmd, { encoding: 'utf8' }).trim())
if (loginStatus !== 200) {
  console.error(`GM login failed: ${loginStatus}`)
  process.exit(2)
}
console.log('✓ GM logged in')

const ENDPOINTS = [
  { domain: 'HR', path: '/hiring-surveys' },
  { domain: 'HR', path: '/plan-reports' },
  { domain: 'HR', path: '/recruitment/job-postings' },
  { domain: 'FINANCE', path: '/operating-expenses?seasonId=1' },
  { domain: 'FINANCE', path: '/budget-control' },
  { domain: 'FINANCE', path: '/financial-reports/1' },
  { domain: 'ASSET', path: '/equipment' },
  { domain: 'ASSET', path: '/asset-requests' },
  { domain: 'ASSET', path: '/equipment/loans' },
  { domain: 'GM (owner)', path: '/plan-reports?filter=pending-final' },
  { domain: 'GM (owner)', path: '/reports?filter=pending-final' },
  { domain: 'GM (owner)', path: '/hiring-dispatches?filter=pending-dispatch' },
  { domain: 'MEDICAL', path: '/injuries/active' },
  { domain: 'MEDICAL', path: '/medical-equipment-loan' },
  { domain: 'MEDICAL', path: '/medical-expenses' },
  { domain: 'ADMIN', path: '/admin/audit-logs' },
  { domain: 'ADMIN', path: '/admin/users' },
]

const results = []
console.log('\n== GM authorized-access probing ==')
for (const ep of ENDPOINTS) {
  const cmd = `curl -s -o /dev/null ${proxyArg.map((a) => `'${a}'`).join(' ')} -b '${jar}' -w '%{http_code}' '${BASE}${ep.path}'`
  const status = Number(execSync(cmd, { encoding: 'utf8' }).trim())
  const ok = status >= 200 && status < 300
  const verdict = ok ? 'AUTHORIZED' : (status === 403 ? 'UNEXPECTED_403' : status >= 500 ? 'SERVER_ERROR' : `UNEXPECTED_${status}`)
  const flag = ok ? '✓' : '⚠️'
  results.push({ ...ep, status, verdict, ok })
  console.log(`  ${flag} ${ep.domain.padEnd(14)} ${ep.path.padEnd(50)} ${status} [${verdict}]`)
}

const pass = results.filter((r) => r.ok).length
const fail = results.length - pass
console.log(`\nSummary: ${pass}/${results.length} authorized · ${fail} unexpected${PROXY ? ` (via ${PROXY})` : ''}`)

fs.writeFileSync(
  path.join(OUT, 'gm-access-smoke.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE, proxy: PROXY || null, results }, null, 2),
)
console.log(`Wrote ${path.join(OUT, 'gm-access-smoke.json')}`)
if (fail > 0) process.exitCode = 1
