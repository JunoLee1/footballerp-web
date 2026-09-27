#!/usr/bin/env node
// Cross-role RBAC 프로브 — 각 페르소나 세션으로 다른 페르소나의 endpoint 접근 시도.
// 기대: 403 Forbidden (또는 401). 200 반환 시 role guard 부재 = LEAK.
// HTTP_PROXY=http://127.0.0.1:3002 로 실행하면 Burp Suite HTTP History 에 잡힘.

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const BASE = process.env.BASE_URL || 'http://localhost:3001/api'
const OUT = path.dirname(new URL(import.meta.url).pathname)
const PW = 'Password1!'
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY
const proxyArg = PROXY ? ['-x', PROXY] : []
if (PROXY) console.log(`[proxy] routing via ${PROXY}`)

// GM 은 isAdminLike (`permissions.ts:isAdminLike`) 로 전 도메인 접근 정당함 →
// attacker 프로브에서 제외. 대신 `gm-access-smoke.mjs` 로 GM 이 정상 접근하는지만 확인.
const PERSONAS = [
  { label: 'PLAYER', email: 'player@club.com' },
  { label: 'HR_MANAGER', email: 'hr@club.com' },
  { label: 'ASSET_MANAGER', email: 'asset@club.com' },
]

// Owner persona (endpoint 정상 접근 가능) × endpoint 리스트
const TARGETS = [
  { owner: 'HR_MANAGER', endpoints: [
    '/hiring-surveys', '/plan-reports', '/recruitment/job-postings',
  ]},
  { owner: 'FINANCE_MANAGER', endpoints: [
    '/operating-expenses?seasonId=1', '/budget-control', '/financial-reports/1',
  ]},
  { owner: 'ASSET_MANAGER', endpoints: [
    '/equipment', '/asset-requests', '/equipment/loans',
  ]},
  { owner: 'GM', endpoints: [
    '/plan-reports?filter=pending-final', '/reports?filter=pending-final', '/hiring-dispatches?filter=pending-dispatch',
  ]},
  { owner: 'MEDICAL_DIRECTOR', endpoints: [
    '/injuries/active', '/medical-equipment-loan', '/medical-expenses',
  ]},
  { owner: 'ADMIN', endpoints: [
    '/admin/audit-logs', '/admin/users',
  ]},
]

function login(email) {
  const jar = `/tmp/xr-${email.replace(/[^a-z0-9]/g, '_')}.txt`
  fs.writeFileSync(jar, '')
  const cmd = `curl -s -o /dev/null ${proxyArg.map((a) => `'${a}'`).join(' ')} -X POST '${BASE}/auth/login' -H 'Content-Type: application/json' -d '${JSON.stringify({ email, password: PW })}' -c '${jar}' -w '%{http_code}'`
  const status = Number(execSync(cmd, { encoding: 'utf8' }).trim())
  return { status, jar }
}

function probe(jar, url) {
  const cmd = `curl -s -o /dev/null ${proxyArg.map((a) => `'${a}'`).join(' ')} -b '${jar}' -w '%{http_code}' '${url}'`
  return Number(execSync(cmd, { encoding: 'utf8' }).trim())
}

const sessions = {}
for (const p of PERSONAS) {
  const r = login(p.email)
  if (r.status !== 200) {
    console.error(`✗ login ${p.label} failed: ${r.status}`)
    continue
  }
  sessions[p.label] = r.jar
  console.log(`✓ ${p.label} logged in`)
}

const results = []
console.log('\n== Cross-role probing ==')
for (const t of TARGETS) {
  for (const attackerLabel of Object.keys(sessions)) {
    if (attackerLabel === t.owner) continue // skip owner (would be 200 정상)
    for (const ep of t.endpoints) {
      const status = probe(sessions[attackerLabel], `${BASE}${ep}`)
      let verdict, flag
      if (status === 403 || status === 401) { verdict = 'BLOCKED'; flag = '✓' }
      else if (status === 200) { verdict = 'LEAK'; flag = '🚨' }
      else if (status === 404) { verdict = 'NOT_FOUND'; flag = '·' }
      else { verdict = `OTHER_${status}`; flag = '?' }
      results.push({ attacker: attackerLabel, owner: t.owner, endpoint: ep, status, verdict })
      console.log(`  ${flag} ${attackerLabel.padEnd(15)} → ${t.owner.padEnd(18)} ${ep.padEnd(50)} ${status} [${verdict}]`)
    }
  }
}

const leaks = results.filter((r) => r.verdict === 'LEAK')
const blocked = results.filter((r) => r.verdict === 'BLOCKED')
const notfound = results.filter((r) => r.verdict === 'NOT_FOUND')
console.log(`\nSummary: ${blocked.length} BLOCKED · ${leaks.length} LEAK · ${notfound.length} NOT_FOUND · total ${results.length}`)

fs.writeFileSync(
  path.join(OUT, 'cross-role-test.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE, proxy: PROXY || null, results }, null, 2),
)
console.log(`Wrote ${path.join(OUT, 'cross-role-test.json')}`)
if (leaks.length > 0) process.exitCode = 1
