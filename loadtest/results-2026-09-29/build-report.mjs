#!/usr/bin/env node
// 2026-09-29 리포트 — 어제(2026-09-27) 와 동일한 구조로 생성.
// smoke + stress 는 오늘 데이터(DIR), Redis/userStatus/pentest/cross-role/GM 비교는 어제 데이터(PREV).
// Usage:  node build-report.mjs   (run from this directory)

import fs from 'node:fs'
import path from 'node:path'

const DIR = path.dirname(new URL(import.meta.url).pathname)
const PREV = path.resolve(DIR, '..', 'results-2026-09-27')

const PERSONAS = ['HR_MANAGER', 'HEAD_COACH', 'FINANCE_MANAGER', 'ASSET_MANAGER', 'GM', 'PLAYER', 'MEDICAL_DIRECTOR']
const REDIS_PERSONAS = ['GM', 'FINANCE_MANAGER', 'ASSET_MANAGER']
const USERSTATUS_PERSONAS = ['MEDICAL_DIRECTOR', 'GM', 'HR_MANAGER', 'FINANCE_MANAGER', 'ASSET_MANAGER']
const SCENARIOS = ['smoke', 'stress']

function readSummary(scenario, persona) {
  const p = path.join(DIR, `${scenario}-${persona}.json`)
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function pickRow(scenario, persona, s) {
  if (!s) return { scenario, persona, missing: true }
  const m = s.metrics
  const dur = m.http_req_duration || {}
  const failed = m.http_req_failed || {}
  const reqs = m.http_reqs || {}
  const iters = m.iterations || {}
  const totalReqs = reqs.count ?? 0
  const totalFailed = failed.passes ?? 0
  const vus = m.vus || {}
  return {
    scenario,
    persona,
    vuPeak: vus.max ?? m.vus_max?.value ?? null,
    reqs: totalReqs,
    rps: reqs.rate != null ? +reqs.rate.toFixed(2) : null,
    p95: dur['p(95)'] != null ? +dur['p(95)'].toFixed(1) : null,
    p99: dur['p(99)'] != null ? +dur['p(99)'].toFixed(1) : null,
    avg: dur.avg != null ? +dur.avg.toFixed(1) : null,
    max: dur.max != null ? +dur.max.toFixed(1) : null,
    failedPct: totalReqs > 0 ? +((totalFailed / totalReqs) * 100).toFixed(2) : 0,
    iters: iters.count ?? 0,
    personaErrors: m.persona_errors?.count ?? 0,
    thresholds: {
      p95Ok: dur.thresholds?.['p(95)<2000'] === true,
      failOk: failed.thresholds?.['rate<0.10'] === true,
    },
  }
}

const rows = []
for (const sc of SCENARIOS) {
  for (const p of PERSONAS) {
    rows.push(pickRow(sc, p, readSummary(sc, p)))
  }
}

const smokeRows = rows.filter((r) => r.scenario === 'smoke')
const stressRows = rows.filter((r) => r.scenario === 'stress')

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<title>Football ERP — k6 Persona Load Test (2026-09-29 · post-#551)</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 32px; background: #fafafa; color: #1a1a1a; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .sub { color: #666; margin-bottom: 32px; font-size: 14px; }
  section { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  h2 { margin: 0 0 16px; font-size: 18px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: right; padding: 8px 12px; border-bottom: 1px solid #eee; }
  th:first-child, td:first-child { text-align: left; font-weight: 500; }
  th { background: #f4f4f5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; color: #555; }
  tr:hover td { background: #fafafa; }
  .ok { color: #16a34a; font-weight: 600; }
  .warn { color: #d97706; font-weight: 600; }
  .bad { color: #dc2626; font-weight: 600; }
  .missing { color: #999; font-style: italic; }
  .bar-wrap { background: #f4f4f5; border-radius: 4px; height: 12px; width: 120px; display: inline-block; vertical-align: middle; margin-left: 8px; overflow: hidden; }
  .bar { height: 100%; background: linear-gradient(90deg, #22c55e, #eab308, #ef4444); }
  .num { font-variant-numeric: tabular-nums; }
  .footer { color: #999; font-size: 12px; margin-top: 32px; text-align: center; }
  code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
</style>
</head>
<body>
  <h1>⚽ Football ERP — k6 도메인별 Load Test</h1>
  <div class="sub">2026-09-29 · post-#551 (EquipmentLoan.dueDate 도입) 회귀 검증 · 7 personas × 2 scenarios · single-instance API @ localhost:3001</div>

  <section>
    <h2>🌡️ Smoke (VUS=2, 10s, baseline reads)</h2>
    ${renderTable(smokeRows)}
  </section>

  <section>
    <h2>💥 Stress (ramping 5→50→100→200 VUs, ~1m45s)</h2>
    ${renderTable(stressRows)}
  </section>

  <section>
    <h2>⚡ Redis 캐시 적용 전/후 비교 (참고: 2026-09-27 데이터)</h2>
    ${renderRedisCompare()}
  </section>

  <section>
    <h2>🚀 authMiddleware isDeleted 캐시 (userStatusCache) 도입 결과 (참고: 2026-09-27 데이터)</h2>
    ${renderUserStatusCompare()}
  </section>

  <section>
    <h2>📈 p95 latency by persona (stress vs smoke)</h2>
    ${renderChart(rows)}
  </section>

  <section>
    <h2>🛡️ Burp-style IDOR Probe (pentest) — 2026-09-27</h2>
    ${renderPentest()}
  </section>

  <section>
    <h2>🚨 Cross-Role RBAC Probe — 2026-09-27</h2>
    ${renderCrossRole()}
  </section>

  <section>
    <h2>✅ GM Authorized-Access Smoke — 2026-09-27</h2>
    ${renderGmSmoke()}
  </section>

  <section>
    <h2>⚡ GM Endpoint 개별 분해 Stress — 2026-09-27</h2>
    ${renderGmBreakdown()}
  </section>

  <section>
    <h2>🔵 오늘 vs 어제 회귀 요약</h2>
    ${renderRegression()}
  </section>

  <section>
    <h2>🏢 부서·팀 계층 CRUD (department.k6.js — 2026-09-29 신규)</h2>
    ${renderDomainSuite('department', ['smoke', 'stress', 'crud'])}
    <div style="margin-top:12px;padding:12px;background:#f0fdf4;border-left:3px solid #22c55e;font-size:13px">
      <strong>Highlights:</strong> stress <strong>386 RPS</strong> · p95 667ms (threshold pass) · 40,864 req 0% fail.
      CRUD lifecycle 27회 왕복 (create parent → sub → job-title CRUD → cleanup) 100% pass.
    </div>
  </section>

  <section>
    <h2>🏟️ 시설·자산 (facility.k6.js — 2026-09-29 신규)</h2>
    ${renderDomainSuite('facility', ['smoke', 'stress', 'crud'])}
    <div style="margin-top:12px;padding:12px;background:#fef3c7;border-left:3px solid #f59e0b;font-size:13px">
      <strong>발견:</strong> maintenance status 전환에서 controller <code>VALID_TRANSITIONS</code> 와 service <code>ALLOWED</code> 불일치. OPEN→REJECTED 를 controller 는 허용하나 service 에서 400. Cleanup 경로가 3-step 우회 필요.
    </div>
  </section>

  <section>
    <h2>⚽ 팀·시즌·경기 (teams-seasons-matches.k6.js — 2026-09-29 신규)</h2>
    ${renderDomainSuite('teams-seasons-matches', ['smoke', 'stress'])}
    <div style="margin-top:12px;padding:12px;background:#f0fdf4;border-left:3px solid #22c55e;font-size:13px">
      <strong>🥇 오늘 최고 처리량:</strong> stress <strong>430 RPS</strong> · p95 590ms · 45,612 req · 0% fail. Read-only 골든 패스 (/teams, /seasons, /matches + /:id + /remaining-capacity + /active) 통합.
    </div>
  </section>

  <section>
    <h2>👥 HR 세부 (hr-domain.k6.js — 2026-09-29 신규)</h2>
    ${renderDomainSuite('hr-domain', ['smoke', 'stress', 'idor'])}
    <div style="margin-top:12px;padding:12px;background:#f0fdf4;border-left:3px solid #22c55e;font-size:13px">
      <strong>IDOR 검증:</strong> PLAYER 세션 → staff-records/1~10 + hiring-surveys/1~10 순차 프로브 → <strong>20/20 건 403 정상 차단</strong> (<code>hr_idor_leaks=0</code>). checks 100% pass. <br>
      <strong>Endpoint 커버:</strong> /staff-records · /hiring-surveys · /recruitment/{job-postings, headcount-progress, time-to-hire, cost-per-hire} · /pii-access/requests · /pii-access/requests/mine.
      Note: idor scenario 의 <code>http_req_failed 62.5%</code> 는 예상된 403 차단 (fail 은 not-2xx 라 counter 증가). 실제 취약점은 없음.
    </div>
  </section>

  <div class="footer">Generated ${new Date().toISOString()} · thresholds: p(95)&lt;2000ms · fail_rate&lt;10%</div>
</body>
</html>`

function renderDomainSuite(domain, scenarios) {
  const rows = scenarios.map((sc) => {
    const p = path.join(DIR, domain, `${sc}.json`)
    if (!fs.existsSync(p)) return { scenario: sc, missing: true }
    const s = JSON.parse(fs.readFileSync(p, 'utf8'))
    const m = s.metrics
    const dur = m.http_req_duration || {}
    const failed = m.http_req_failed || {}
    const reqs = m.http_reqs || {}
    return {
      scenario: sc,
      vuPeak: m.vus_max?.value ?? m.vus?.max ?? null,
      reqs: reqs.count ?? 0,
      rps: reqs.rate != null ? +reqs.rate.toFixed(1) : null,
      p95: dur['p(95)'] != null ? +dur['p(95)'].toFixed(1) : null,
      avg: dur.avg != null ? +dur.avg.toFixed(1) : null,
      max: dur.max != null ? +dur.max.toFixed(1) : null,
      failedPct: reqs.count > 0 ? +((failed.passes || 0) / reqs.count * 100).toFixed(2) : 0,
      p95Ok: dur.thresholds?.['p(95)<2000'] === true,
      failOk: failed.thresholds?.['rate<0.10'] === true,
    }
  })
  const body = rows.map((r) => {
    if (r.missing) return `<tr><td>${r.scenario}</td><td colspan="8" class="missing">파일 없음</td></tr>`
    const p95Cls = r.p95 < 500 ? 'ok' : r.p95 < 2000 ? 'warn' : 'bad'
    const failCls = r.failedPct === 0 ? 'ok' : r.failedPct < 10 ? 'warn' : 'bad'
    const verdict = r.p95Ok && r.failOk ? '<span class="ok">PASS</span>' : '<span class="bad">FAIL</span>'
    return `<tr>
      <td>${r.scenario}</td><td class="num">${r.vuPeak}</td><td class="num">${r.reqs.toLocaleString()}</td>
      <td class="num">${r.rps}</td><td class="num">${r.avg}</td>
      <td class="num ${p95Cls}">${r.p95}</td><td class="num">${r.max}</td>
      <td class="num ${failCls}">${r.failedPct}</td><td>${verdict}</td>
    </tr>`
  }).join('\n')
  return `<table>
    <tr><th>Scenario</th><th>VU peak</th><th>Reqs</th><th>RPS</th><th>avg</th><th>p95</th><th>max</th><th>Fail %</th><th>Verdict</th></tr>
    ${body}
  </table>`
}


function renderTable(list) {
  const head = `<tr>
    <th>Persona</th><th>VU peak</th><th>Reqs</th><th>RPS</th><th>avg</th><th>p95</th><th>p99</th><th>max</th><th>Fail %</th><th>Errors</th><th>Verdict</th>
  </tr>`
  const body = list.map((r) => {
    if (r.missing) return `<tr><td>${r.persona}</td><td colspan="10" class="missing">summary file missing</td></tr>`
    const p95Cls = r.p95 == null ? '' : r.p95 < 500 ? 'ok' : r.p95 < 2000 ? 'warn' : 'bad'
    const failCls = r.failedPct === 0 ? 'ok' : r.failedPct < 10 ? 'warn' : 'bad'
    const verdict = r.thresholds.p95Ok && r.thresholds.failOk
      ? '<span class="ok">PASS</span>'
      : '<span class="bad">FAIL</span>'
    return `<tr>
      <td>${r.persona}</td>
      <td class="num">${r.vuPeak ?? '—'}</td>
      <td class="num">${r.reqs}</td>
      <td class="num">${r.rps ?? '—'}</td>
      <td class="num">${r.avg ?? '—'}</td>
      <td class="num ${p95Cls}">${r.p95 ?? '—'}</td>
      <td class="num">${r.p99 ?? '—'}</td>
      <td class="num">${r.max ?? '—'}</td>
      <td class="num ${failCls}">${r.failedPct}</td>
      <td class="num">${r.personaErrors}</td>
      <td>${verdict}</td>
    </tr>`
  }).join('\n')
  return `<table>${head}${body}</table>`
}

function renderRedisCompare() {
  const rows = REDIS_PERSONAS.map((p) => {
    const baseFile = path.join(PREV, `stress-${p}.json`)
    const redisFile = path.join(PREV, `stress-${p}-redis.json`)
    if (!fs.existsSync(baseFile) || !fs.existsSync(redisFile)) return null
    const b = JSON.parse(fs.readFileSync(baseFile, 'utf8')).metrics
    const r = JSON.parse(fs.readFileSync(redisFile, 'utf8')).metrics
    const p95a = b.http_req_duration['p(95)']
    const p95b = r.http_req_duration['p(95)']
    const rpsA = b.http_reqs.rate
    const rpsB = r.http_reqs.rate
    return {
      persona: p,
      p95a: p95a.toFixed(0),
      p95b: p95b.toFixed(0),
      p95Improve: (p95a / p95b).toFixed(2),
      rpsA: rpsA.toFixed(1),
      rpsB: rpsB.toFixed(1),
      rpsImprove: (rpsB / rpsA).toFixed(2),
    }
  }).filter(Boolean)
  if (rows.length === 0) return '<div class="missing">Redis 비교 데이터 없음.</div>'
  const body = rows.map((r) => `<tr>
    <td>${r.persona}</td>
    <td class="num">${r.p95a}ms</td>
    <td class="num ok">${r.p95b}ms</td>
    <td class="num ${+r.p95Improve >= 3 ? 'ok' : 'warn'}">${r.p95Improve}×</td>
    <td class="num">${r.rpsA}</td>
    <td class="num ok">${r.rpsB}</td>
    <td class="num ${+r.rpsImprove >= 2 ? 'ok' : 'warn'}">${r.rpsImprove}×</td>
  </tr>`).join('\n')
  return `<table>
    <tr><th>Persona</th><th>Baseline p95</th><th>Redis p95</th><th>p95 개선</th><th>Baseline RPS</th><th>Redis RPS</th><th>RPS 개선</th></tr>
    ${body}
  </table>
  <div style="margin-top:12px;padding:12px;background:#eff6ff;border-left:3px solid #2563eb;font-size:13px">
    <strong>메커니즘:</strong> 30초 TTL Redis 캐시(ioredis)를 <code>plan-report</code>·<code>report</code>·<code>hiring-dispatch</code>·<code>operating-expense</code>·<code>budget-control</code>·<code>equipment</code>·<code>asset-request</code>·<code>financial-report</code>·<code>budget-plan-request</code> 서비스 list/get 에 적용.
  </div>`
}

function renderUserStatusCompare() {
  const rows = USERSTATUS_PERSONAS.map((p) => {
    const baseFile = path.join(PREV, `stress-${p}.json`)
    const redisFile = p === 'MEDICAL_DIRECTOR'
      ? path.join(PREV, `stress-MEDICAL_DIRECTOR-redis-v4.json`)
      : path.join(PREV, `stress-${p}-redis.json`)
    const userstatusFile = p === 'MEDICAL_DIRECTOR'
      ? path.join(PREV, `stress-MEDICAL_DIRECTOR-redis-userstatus.json`)
      : path.join(PREV, `stress-${p}-userstatus.json`)
    if (!fs.existsSync(baseFile) || !fs.existsSync(userstatusFile)) return null
    const b = JSON.parse(fs.readFileSync(baseFile, 'utf8')).metrics
    const r = fs.existsSync(redisFile) ? JSON.parse(fs.readFileSync(redisFile, 'utf8')).metrics : null
    const u = JSON.parse(fs.readFileSync(userstatusFile, 'utf8')).metrics
    return {
      persona: p,
      p95base: b.http_req_duration['p(95)'].toFixed(0),
      p95redis: r ? r.http_req_duration['p(95)'].toFixed(0) : '—',
      p95user: u.http_req_duration['p(95)'].toFixed(0),
      rpsbase: b.http_reqs.rate.toFixed(1),
      rpsuser: u.http_reqs.rate.toFixed(1),
      totalMultiplier: (b.http_req_duration['p(95)'] / u.http_req_duration['p(95)']).toFixed(1),
    }
  }).filter(Boolean)
  if (rows.length === 0) return '<div class="missing">userStatusCache 결과 없음.</div>'
  const head = `<tr><th>Persona</th><th>Baseline p95</th><th>+Redis (endpoint) p95</th><th>+userStatusCache p95</th><th>Baseline→최종 개선</th><th>Baseline RPS</th><th>최종 RPS</th></tr>`
  const body = rows.map((r) => `<tr>
    <td>${r.persona}</td>
    <td class="num">${r.p95base}ms</td>
    <td class="num warn">${r.p95redis}${r.p95redis !== '—' ? 'ms' : ''}</td>
    <td class="num ok">${r.p95user}ms</td>
    <td class="num ok"><strong>${r.totalMultiplier}×</strong></td>
    <td class="num">${r.rpsbase}</td>
    <td class="num ok">${r.rpsuser}</td>
  </tr>`).join('\n')
  return `<table>${head}${body}</table>
  <div style="margin-top:12px;padding:12px;background:#dcfce7;border-left:3px solid #16a34a;font-size:13px">
    <strong>핵심 발견 (2026-09-27):</strong> 진짜 병목은 <code>authMiddleware</code> 매-요청 <code>SELECT isDeleted FROM User</code>. <code>lib/userStatusCache.ts</code> (5분 TTL) 로 이 조회 캐시 후 모든 도메인 p95 대폭 감소.
  </div>`
}

function renderPentest() {
  const p = path.join(PREV, 'pentest.json')
  if (!fs.existsSync(p)) return '<div class="missing">pentest.json 없음.</div>'
  const s = JSON.parse(fs.readFileSync(p, 'utf8'))
  const rows = s.rows
  const leaks = rows.filter((r) => r.verdict === 'LEAK')
  const crashes = rows.filter((r) => r.verdict === 'CRASH')
  const passes = rows.filter((r) => r.verdict === 'PASS')
  const summary = `<div style="margin-bottom:12px;font-size:14px">
    <span class="ok">${passes.length} PASS</span> ·
    <span class="bad">${leaks.length} LEAK</span> ·
    <span class="bad">${crashes.length} CRASH</span>
    · attackers: ${s.attackers.join(', ')} · IDs: ${s.idRange[0]}–${s.idRange[1]}
  </div>`
  const head = `<tr>
    <th>Attacker</th><th>Method</th><th>Endpoint</th><th>Sensitive</th><th>200</th><th>401/403</th><th>404</th><th>5xx</th><th>Verdict</th>
  </tr>`
  const body = rows.map((r) => {
    const cls = r.verdict === 'PASS' ? 'ok' : 'bad'
    return `<tr>
      <td>${r.attacker}</td>
      <td>${r.method}</td>
      <td><code>${r.endpoint}</code></td>
      <td class="num">${r.sensitive ? 'yes' : 'no'}</td>
      <td class="num">${r.ok200}</td>
      <td class="num">${r.forbidden}</td>
      <td class="num">${r.notFound}</td>
      <td class="num">${r.server5xx}</td>
      <td class="${cls}">${r.verdict}</td>
    </tr>`
  }).join('\n')
  return summary + `<table>${head}${body}</table>`
}

function renderCrossRole() {
  const p = path.join(PREV, 'cross-role-test.json')
  if (!fs.existsSync(p)) return '<div class="missing">cross-role-test.json 없음.</div>'
  const s = JSON.parse(fs.readFileSync(p, 'utf8'))
  const rows = s.results
  const leaks = rows.filter((r) => r.verdict === 'LEAK')
  const blocked = rows.filter((r) => r.verdict === 'BLOCKED')
  const summary = `<div style="margin-bottom:16px;font-size:14px">
    <span class="ok">${blocked.length} BLOCKED</span> ·
    <span class="bad">${leaks.length} LEAK</span> · 총 ${rows.length} 프로브
  </div>`
  const byOwner = {}
  for (const r of rows) {
    byOwner[r.owner] = byOwner[r.owner] || { total: 0, leak: 0, blocked: 0, endpoints: {} }
    byOwner[r.owner].total++
    if (r.verdict === 'LEAK') byOwner[r.owner].leak++
    else if (r.verdict === 'BLOCKED') byOwner[r.owner].blocked++
    const ek = r.endpoint
    byOwner[r.owner].endpoints[ek] = byOwner[r.owner].endpoints[ek] || { leakers: [], blockers: [] }
    if (r.verdict === 'LEAK') byOwner[r.owner].endpoints[ek].leakers.push(r.attacker)
    else if (r.verdict === 'BLOCKED') byOwner[r.owner].endpoints[ek].blockers.push(r.attacker)
  }
  const ownerRows = Object.entries(byOwner)
    .sort((a, b) => (b[1].leak / b[1].total) - (a[1].leak / a[1].total))
    .map(([owner, v]) => {
      const pct = (v.leak / v.total * 100).toFixed(0)
      const cls = v.leak === 0 ? 'ok' : v.leak === v.total ? 'bad' : 'warn'
      return `<tr><td>${owner}</td><td class="num">${v.total}</td><td class="num ${cls}">${v.leak}</td><td class="num">${v.blocked}</td><td class="num ${cls}">${pct}%</td></tr>`
    }).join('\n')
  const ownerHead = `<tr><th>Owner 도메인</th><th>총 프로브</th><th>LEAK</th><th>BLOCKED</th><th>취약도</th></tr>`

  const flat = []
  for (const [owner, v] of Object.entries(byOwner)) {
    for (const [ep, e] of Object.entries(v.endpoints)) {
      flat.push({ owner, endpoint: ep, leakers: e.leakers, blockers: e.blockers })
    }
  }
  flat.sort((a, b) => (b.leakers.length - a.leakers.length) || a.owner.localeCompare(b.owner))
  const epHead = `<tr><th>Owner</th><th>Endpoint</th><th>뚫은 role</th><th>판정</th></tr>`
  const epBody = flat.map((f) => {
    const cls = f.leakers.length === 0 ? 'ok' : 'bad'
    const flag = f.leakers.length === 0 ? '✓ BLOCKED' : `🚨 LEAK (${f.leakers.length} role)`
    return `<tr><td>${f.owner}</td><td><code>${f.endpoint}</code></td><td>${f.leakers.join(' · ') || '—'}</td><td class="${cls}">${flag}</td></tr>`
  }).join('\n')

  return summary
    + '<h3 style="margin-top:8px;font-size:15px">📊 Owner 도메인별 취약도</h3>'
    + `<table>${ownerHead}${ownerRows}</table>`
    + '<h3 style="margin-top:20px;font-size:15px">📋 Endpoint 별 상세</h3>'
    + `<table>${epHead}${epBody}</table>`
}

function renderGmSmoke() {
  const p = path.join(PREV, 'gm-access-smoke.json')
  if (!fs.existsSync(p)) return '<div class="missing">gm-access-smoke.json 없음.</div>'
  const s = JSON.parse(fs.readFileSync(p, 'utf8'))
  const rows = s.results
  const pass = rows.filter((r) => r.ok).length
  const fail = rows.length - pass
  const summary = `<div style="margin-bottom:12px;font-size:14px">
    <span class="ok">${pass} AUTHORIZED</span> ·
    <span class="${fail > 0 ? 'bad' : 'ok'}">${fail} unexpected</span> · 총 ${rows.length} endpoint
  </div>`
  const head = `<tr><th>Domain</th><th>Endpoint</th><th>Status</th><th>Verdict</th></tr>`
  const body = rows.map((r) => {
    const cls = r.ok ? 'ok' : 'bad'
    return `<tr><td>${r.domain}</td><td><code>${r.path}</code></td><td class="num">${r.status}</td><td class="${cls}">${r.verdict}</td></tr>`
  }).join('\n')
  return summary + `<table>${head}${body}</table>`
}

function renderGmBreakdown() {
  const files = ['GM_PLAN', 'GM_REPORTS', 'GM_DISPATCHES']
  const rows = files.map((f) => {
    const p = path.join(PREV, 'gm-breakdown', `stress-${f}.json`)
    if (!fs.existsSync(p)) return null
    const m = JSON.parse(fs.readFileSync(p, 'utf8')).metrics
    return {
      persona: f,
      endpoint: { GM_PLAN: '/plan-reports?filter=pending-final', GM_REPORTS: '/reports?filter=pending-final', GM_DISPATCHES: '/hiring-dispatches?filter=pending-dispatch' }[f],
      p95: m.http_req_duration['p(95)'].toFixed(0),
      rps: m.http_reqs.rate.toFixed(1),
      avg: m.http_req_duration.avg.toFixed(0),
      fail: (m.http_req_failed.value * 100).toFixed(2),
    }
  }).filter(Boolean)
  if (rows.length === 0) return '<div class="missing">gm-breakdown 없음.</div>'
  const head = `<tr><th>Persona (endpoint 단독)</th><th>Endpoint</th><th>p95</th><th>avg</th><th>RPS</th><th>Fail %</th></tr>`
  const body = rows.map((r) => `<tr>
    <td>${r.persona}</td>
    <td><code>${r.endpoint}</code></td>
    <td class="num ok">${r.p95}ms</td>
    <td class="num">${r.avg}ms</td>
    <td class="num">${r.rps}</td>
    <td class="num">${r.fail}</td>
  </tr>`).join('\n')
  return `<table>${head}${body}</table>`
}

function renderChart(all) {
  const maxP95 = Math.max(...all.filter((r) => r.p95 != null).map((r) => r.p95), 100)
  const items = PERSONAS.map((p) => {
    const smoke = all.find((r) => r.persona === p && r.scenario === 'smoke') || {}
    const stress = all.find((r) => r.persona === p && r.scenario === 'stress') || {}
    return { persona: p, smoke: smoke.p95 ?? 0, stress: stress.p95 ?? 0 }
  })
  return `<table>
    <tr><th>Persona</th><th style="width:60px">smoke p95</th><th style="width:200px"></th><th style="width:60px">stress p95</th><th style="width:200px"></th></tr>
    ${items.map((i) => `<tr>
      <td>${i.persona}</td>
      <td class="num">${i.smoke}</td>
      <td><div class="bar-wrap"><div class="bar" style="width:${(i.smoke / maxP95) * 100}%"></div></div></td>
      <td class="num">${i.stress}</td>
      <td><div class="bar-wrap"><div class="bar" style="width:${(i.stress / maxP95) * 100}%"></div></div></td>
    </tr>`).join('\n')}
  </table>`
}

function renderRegression() {
  const rows = PERSONAS.map((p) => {
    const todayFile = path.join(DIR, `stress-${p}.json`)
    const yesterdayFile = path.join(PREV, `stress-${p}-userstatus.json`)
    const fallback = path.join(PREV, `stress-${p}.json`)
    if (!fs.existsSync(todayFile)) return null
    const t = JSON.parse(fs.readFileSync(todayFile, 'utf8')).metrics
    let y = null
    let ySource = null
    if (fs.existsSync(yesterdayFile)) { y = JSON.parse(fs.readFileSync(yesterdayFile, 'utf8')).metrics; ySource = '+userStatusCache' }
    else if (fs.existsSync(fallback)) { y = JSON.parse(fs.readFileSync(fallback, 'utf8')).metrics; ySource = 'baseline' }
    if (!y) return null
    const t95 = t.http_req_duration['p(95)']
    const y95 = y.http_req_duration['p(95)']
    const delta = ((t95 - y95) / y95 * 100).toFixed(1)
    const regressed = t95 > y95 * 1.2
    return {
      persona: p,
      ySource,
      y95: y95.toFixed(1),
      t95: t95.toFixed(1),
      delta,
      regressed,
    }
  }).filter(Boolean)
  if (rows.length === 0) return '<div class="missing">회귀 비교 데이터 없음.</div>'
  const head = `<tr><th>Persona</th><th>어제 (기준)</th><th>어제 p95</th><th>오늘 p95</th><th>Δ</th><th>판정</th></tr>`
  const body = rows.map((r) => {
    const cls = r.regressed ? 'bad' : (+r.delta < -10 ? 'ok' : 'warn')
    const verdict = r.regressed ? '<span class="bad">회귀 ⚠️</span>' : (+r.delta < -10 ? '<span class="ok">개선</span>' : '<span class="warn">동등</span>')
    return `<tr>
      <td>${r.persona}</td>
      <td>${r.ySource}</td>
      <td class="num">${r.y95}ms</td>
      <td class="num">${r.t95}ms</td>
      <td class="num ${cls}">${+r.delta > 0 ? '+' : ''}${r.delta}%</td>
      <td>${verdict}</td>
    </tr>`
  }).join('\n')
  return `<table>${head}${body}</table>
  <div style="margin-top:12px;padding:12px;background:#fef3c7;border-left:3px solid #f59e0b;font-size:13px">
    <strong>회귀 판정 기준:</strong> 오늘 p95 &gt; 어제 p95 × 1.2 → 회귀. 어제 데이터는 <code>+userStatusCache</code> 최적화 상태 (없으면 baseline) 를 기준으로 사용.
  </div>`
}

fs.writeFileSync(path.join(DIR, 'report.html'), html)
console.log(`Wrote ${path.join(DIR, 'report.html')}`)
console.log(`\nSmoke summary:`)
console.table(smokeRows.map((r) => ({ persona: r.persona, p95: r.p95, rps: r.rps, fail: r.failedPct })))
console.log(`\nStress summary:`)
console.table(stressRows.map((r) => ({ persona: r.persona, p95: r.p95, rps: r.rps, fail: r.failedPct })))
