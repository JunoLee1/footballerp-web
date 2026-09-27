#!/usr/bin/env node
// Aggregate per-persona k6 summaries into a single self-contained HTML dashboard.
// Usage:  node build-report.mjs   (run from this directory)

import fs from 'node:fs'
import path from 'node:path'

const DIR = path.dirname(new URL(import.meta.url).pathname)
const PERSONAS = [
  // Original 7 canonical role heads
  'HR_MANAGER',
  'HEAD_COACH',
  'FINANCE_MANAGER',
  'ASSET_MANAGER',
  'GM',
  'PLAYER',
  'MEDICAL_DIRECTOR',
  // Extended 10 (admin + staff delegates + coaching variants)
  'ADMIN',
  'SUPERADMIN',
  'HR_STAFF',
  'FINANCE_STAFF',
  'ASSET_STAFF',
  'FACILITY_MANAGER',
  'FACILITY_STAFF',
  'ASSISTANT_COACH',
  'ATTACKING_COACH',
  'DEFENSIVE_COACH',
]
const REDIS_PERSONAS = ['GM', 'FINANCE_MANAGER', 'ASSET_MANAGER']
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
    vuPeak: vus.max ?? null,
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
<title>Football ERP — k6 Persona Load Test (2026-09-27)</title>
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
</style>
</head>
<body>
  <h1>⚽ Football ERP — k6 도메인별 Load Test</h1>
  <div class="sub">2026-09-27 · 7 personas × 2 scenarios · single-instance API @ localhost:3001</div>

  <section>
    <h2>🌡️ Smoke (VUS=2, 10s, baseline reads)</h2>
    ${renderTable(smokeRows)}
  </section>

  <section>
    <h2>💥 Stress (ramping 5→50→100→200 VUs, ~1m45s)</h2>
    ${renderTable(stressRows)}
  </section>

  <section>
    <h2>⚡ Redis 캐시 적용 전/후 비교</h2>
    ${renderRedisCompare()}
  </section>

  <section>
    <h2>📈 p95 latency by persona (stress vs smoke)</h2>
    ${renderChart(rows)}
  </section>

  <section>
    <h2>🛡️ Burp-style IDOR Probe (pentest)</h2>
    ${renderPentest()}
  </section>

  <div class="footer">Generated ${new Date().toISOString()} · thresholds: p(95)&lt;2000ms · fail_rate&lt;10%</div>
</body>
</html>`

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
    const baseFile = path.join(DIR, `stress-${p}.json`)
    const redisFile = path.join(DIR, `stress-${p}-redis.json`)
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
    <strong>메커니즘:</strong> 30초 TTL Redis 캐시(ioredis)를 <code>plan-report</code>·<code>report</code>·<code>hiring-dispatch</code>·<code>operating-expense</code>·<code>budget-control</code>·<code>equipment</code>·<code>asset-request</code>·<code>financial-report</code>·<code>budget-plan-request</code> 서비스 list/get 에 적용. 매 요청 DB 재조회 → 첫 요청만 DB, 이후 30s 동안 캐시 hit.
  </div>`
}

function renderPentest() {
  const p = path.join(DIR, 'pentest.json')
  if (!fs.existsSync(p)) return '<div class="missing">pentest.json 없음 — <code>node pentest.mjs</code> 먼저 러닝.</div>'
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
  const claim = `<div style="margin-top:14px;padding:12px;background:#fef2f2;border-left:3px solid #dc2626;font-size:13px;color:#7f1d1d">
    📄 <strong>photophoio.md line 66 claim:</strong> "UUID v4 도입 · 임의 주소 변조 시 라우터 단 403 Forbidden 완벽 작동" —
    ${leaks.length > 0
      ? `<span class="bad">FALSIFIED</span> · numeric IDs still enumerable, ${leaks.length} endpoint(s) leaked data`
      : `<span class="ok">HOLDS</span>`}
  </div>`
  return summary + `<table>${head}${body}</table>` + claim
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

fs.writeFileSync(path.join(DIR, 'report.html'), html)
console.log(`Wrote ${path.join(DIR, 'report.html')}`)
console.log(`\nSmoke summary:`)
console.table(smokeRows.map((r) => ({ persona: r.persona, p95: r.p95, rps: r.rps, fail: r.failedPct })))
console.log(`\nStress summary:`)
console.table(stressRows.map((r) => ({ persona: r.persona, p95: r.p95, rps: r.rps, fail: r.failedPct })))
