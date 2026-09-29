#!/usr/bin/env node
/*
 * XSS 저장 / 렌더 조사 — 백엔드 부분.
 *
 * 절차:
 * 1) 여러 XSS payload 로 department 생성 시도
 * 2) 저장 성공 시 GET 으로 회수 → payload 그대로 보존되는지 확인
 * 3) 결과 요약 후 cleanup (delete)
 *
 * FE 렌더 확인은 별도 (Playwright 필요) — 이 스크립트는 백엔드만 검증.
 *
 * 판정:
 * - payload 저장 실패 (400/500) → 백엔드 validation ✅
 * - payload 저장 성공 + GET 시 payload 그대로 → 백엔드 sanitize 없음 (FE 에서 escape 필수)
 * - payload 저장 성공 + GET 시 이스케이프됨 → 백엔드 sanitize 됨
 */

const BASE = process.env.BASE_URL || 'http://localhost:3001/api'
const EMAIL = 'admin@club.com'
const PASSWORD = 'Password1!'

const PAYLOADS = [
  { name: 'script_tag',   value: `<script>alert('XSS1')</script>` },
  { name: 'img_onerror',  value: `<img src=x onerror=alert('XSS2')>` },
  { name: 'svg_onload',   value: `<svg onload=alert('XSS3')>` },
  { name: 'iframe_srcdoc',value: `<iframe srcdoc="<script>alert('XSS4')</script>"></iframe>` },
  { name: 'javascript_url',value: `javascript:alert('XSS5')` },
  { name: 'html_entity',  value: `&lt;script&gt;alert('XSS6')&lt;/script&gt;` },
  { name: 'unicode',      value: `<script>alert('XSS7')</script>` },
]

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const c = res.headers.get('set-cookie') || ''
  const m = /access-token=([^;]+)/.exec(c)
  if (!m) throw new Error('login failed')
  return m[1]
}

async function createDept(token, name) {
  const r = await fetch(`${BASE}/departments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: `access-token=${token}` },
    body: JSON.stringify({ name }),
  })
  if (!r.ok) return { status: r.status, error: await r.text() }
  const j = await r.json()
  return { status: r.status, id: j.id, name: j.name }
}

async function getDept(token, id) {
  const r = await fetch(`${BASE}/departments/${id}`, {
    headers: { cookie: `access-token=${token}` },
  })
  if (!r.ok) return { status: r.status }
  return { status: r.status, json: await r.json() }
}

async function deleteDept(token, id) {
  await fetch(`${BASE}/departments/${id}`, {
    method: 'DELETE',
    headers: { cookie: `access-token=${token}` },
  })
}

async function run() {
  const token = await login()
  const results = []

  for (const p of PAYLOADS) {
    // 유니크한 접두사 붙임 — 회수 시 식별
    const stamp = `XSS_TEST_${Date.now()}_${p.name}__${p.value}`
    const created = await createDept(token, stamp)
    if (!created.id) {
      results.push({
        payload: p.name,
        stored: false,
        status: created.status,
        note: `저장 거부 (${created.status})`,
      })
      continue
    }

    const fetched = await getDept(token, created.id)
    const returnedName = fetched.json?.name || ''
    const payloadPreserved = returnedName.includes(p.value)
    const escaped = returnedName !== stamp

    results.push({
      payload: p.name,
      stored: true,
      id: created.id,
      status: created.status,
      returnedName,
      payloadPreservedExact: payloadPreserved,
      escaped,
    })

    // cleanup
    await deleteDept(token, created.id)
  }

  console.log('\n=== XSS Storage Probe ===\n')
  for (const r of results) {
    if (!r.stored) {
      console.log(`✅ ${r.payload.padEnd(18)} → 저장 거부 (${r.status})`)
    } else if (r.payloadPreservedExact) {
      console.log(`⚠️  ${r.payload.padEnd(18)} → 저장 성공 · payload 원본 보존 (FE escape 필수)`)
    } else {
      console.log(`✅ ${r.payload.padEnd(18)} → 저장 성공 · sanitized`)
    }
  }
  console.log('\n=== 요약 ===')
  const stored = results.filter(r => r.stored).length
  const rawStored = results.filter(r => r.stored && r.payloadPreservedExact).length
  console.log(`총 ${results.length} payload · 저장됨 ${stored} · 원본 보존 ${rawStored} · 거부/sanitize ${results.length - rawStored}`)
  console.log('\n결론: 백엔드는 문자열을 그대로 저장 (일반적). React 는 기본 escape 하므로 FE 렌더 시 안전 예상.')
  console.log('추가 검증 필요: FE 페이지에서 payload 가 실제로 alert 발동하는지 브라우저 확인 (Playwright 필요).')

  // JSON 리포트
  const fs = await import('node:fs')
  const path = await import('node:path')
  const outPath = path.resolve(new URL(import.meta.url).pathname, '../results-2026-09-29/xss-storage-probe.json')
  fs.writeFileSync(outPath, JSON.stringify({ base: BASE, results, summary: { total: results.length, stored, rawStored } }, null, 2))
  console.log(`\nSaved: ${outPath}`)
}

run().catch(err => { console.error(err); process.exit(1) })
