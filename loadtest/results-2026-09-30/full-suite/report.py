#!/usr/bin/env python3
"""
Football ERP — 부하 · 스모크 · 보안 종합 보고서 (interactive)

기존 generate_report.py 대비:
- Chart.js 로 페르소나별 p95 비교 시각화
- 소트/필터 가능한 domain latency 테이블
- pentest-real-ids-566 결과 통합
- 500ms 이상 도메인 자동 하이라이트
"""
import json
import glob
import os
import re
from datetime import datetime, timezone

RESULTS_DIR = os.path.dirname(os.path.abspath(__file__))
PENTEST_DIR = os.path.join(RESULTS_DIR, "..", "pentest-real-ids-566")
OUTPUT = os.path.join(RESULTS_DIR, "report.html")

# ── Data loading ─────────────────────────────────────────────────

def load_json(path):
    with open(path) as f:
        return json.load(f)

def metric(data, name, key="med"):
    m = data.get("metrics", {}).get(name, {})
    v = m.get("values", {}).get(key) if "values" in m else m.get(key)
    return v

def collect(prefix):
    rows = []
    for path in sorted(glob.glob(f"{RESULTS_DIR}/{prefix}-*.json")):
        name = os.path.basename(path).replace(f"{prefix}-", "").replace(".json", "")
        # skip aggregate/per-domain files, only per-persona
        if name in ("per-domain", "per-domain-agg"):
            continue
        try:
            d = load_json(path)
        except Exception as e:
            rows.append({"name": name, "error": str(e)})
            continue
        rows.append({
            "name": name,
            "reqs": metric(d, "http_reqs", "count"),
            "rps": metric(d, "http_reqs", "rate"),
            "p50": metric(d, "http_req_duration", "med"),
            "p95": metric(d, "http_req_duration", "p(95)"),
            "p99": metric(d, "http_req_duration", "p(99)"),
            "avg": metric(d, "http_req_duration", "avg"),
            "max": metric(d, "http_req_duration", "max"),
            "fail_rate": metric(d, "http_req_failed", "rate"),
            "iterations": metric(d, "iterations", "count"),
            "vus_max": metric(d, "vus_max", "max"),
        })
    return rows

def load_per_domain():
    path = os.path.join(RESULTS_DIR, "stress-per-domain-agg.json")
    if not os.path.exists(path):
        return []
    d = load_json(path)
    return [{"domain": k, **v} for k, v in d.items()]

def load_pentest():
    path = os.path.join(PENTEST_DIR, "pentest-real-ids.json")
    if not os.path.exists(path):
        return None
    return load_json(path)

# ── Formatters ────────────────────────────────────────────────────

def fmt_ms(v):
    if v is None: return "-"
    if v >= 1000: return f"{v/1000:.2f}s"
    if v >= 1: return f"{v:.0f}ms"
    return f"{v*1000:.1f}μs"

def fmt_num(v):
    if v is None: return "-"
    if isinstance(v, float) and v < 1: return f"{v:.2f}"
    return f"{int(v):,}"

def fmt_pct(v):
    if v is None: return "-"
    return f"{v*100:.2f}%"

def cls_p95(v, threshold=2000):
    if v is None: return "muted"
    if v > threshold: return "bad"
    if v > threshold * 0.8: return "warn"
    return "ok"

def cls_fail(v, threshold=0.05):
    if v is None: return "muted"
    if v > threshold: return "bad"
    if v > 0.01: return "warn"
    return "ok"

def cls_p95_domain(v, threshold=500):
    if v is None: return "muted"
    if v > threshold: return "bad"
    if v > threshold * 0.6: return "warn"
    return "ok"

# ── Persona classification ────────────────────────────────────────

MAIN_PERSONAS = {
    "ADMIN", "ASSET_MANAGER", "FINANCE_MANAGER", "GM", "HEAD_COACH",
    "HR_MANAGER", "MEDICAL_DIRECTOR", "PLAYER", "FACILITY_MANAGER",
}

def split_personas(rows):
    main = [r for r in rows if r["name"] in MAIN_PERSONAS]
    ext = [r for r in rows if r["name"] not in MAIN_PERSONAS]
    return main, ext

# ── Rendering ────────────────────────────────────────────────────

def render_persona_row(r):
    if "error" in r:
        return f"<tr><td class='name'>{r['name']}</td><td colspan='9' class='err'>error: {r['error']}</td></tr>"
    return (
        "<tr>"
        f"<td class='name'>{r['name']}</td>"
        f"<td>{fmt_num(r['reqs'])}</td>"
        f"<td>{fmt_num(r['rps'])}</td>"
        f"<td>{fmt_ms(r['p50'])}</td>"
        f"<td class='v-{cls_p95(r['p95'])}'>{fmt_ms(r['p95'])}</td>"
        f"<td>{fmt_ms(r['p99'])}</td>"
        f"<td>{fmt_ms(r['max'])}</td>"
        f"<td class='v-{cls_fail(r['fail_rate'])}'>{fmt_pct(r['fail_rate'])}</td>"
        f"<td>{r['vus_max'] or '-'}</td>"
        "</tr>"
    )

def render_persona_table(rows, title, note=""):
    if not rows:
        return f"<h3>{title}</h3><p class='muted'>데이터 없음</p>"
    parts = [f"<h3>{title}</h3>"]
    if note:
        parts.append(f"<p class='note'>{note}</p>")
    parts.append("<table class='sortable'><thead><tr>")
    parts.append("<th>Persona</th><th>Reqs</th><th>RPS</th><th>p50</th><th>p95</th><th>p99</th><th>Max</th><th>Fail%</th><th>VUs</th>")
    parts.append("</tr></thead><tbody>")
    for r in rows:
        parts.append(render_persona_row(r))
    parts.append("</tbody></table>")
    return "\n".join(parts)

def render_domain_table(domains):
    if not domains:
        return "<p class='muted'>per-domain 데이터 없음</p>"
    # sort by p95 desc
    domains = sorted(domains, key=lambda d: (d.get("p95") or 0), reverse=True)
    parts = ["<table class='sortable' id='domain-table'><thead><tr>"]
    parts.append("<th>Domain</th><th>Reqs</th><th>p50 (ms)</th><th>p95 (ms)</th><th>Avg (ms)</th><th>Max (ms)</th>")
    parts.append("</tr></thead><tbody>")
    for d in domains:
        p95 = d.get("p95")
        parts.append(
            "<tr>"
            f"<td class='name'><code>{d['domain']}</code></td>"
            f"<td>{fmt_num(d.get('count'))}</td>"
            f"<td>{fmt_ms(d.get('p50'))}</td>"
            f"<td class='v-{cls_p95_domain(p95)}'>{fmt_ms(p95)}</td>"
            f"<td>{fmt_ms(d.get('avg'))}</td>"
            f"<td>{fmt_ms(d.get('max'))}</td>"
            "</tr>"
        )
    parts.append("</tbody></table>")
    return "\n".join(parts)

def render_bottleneck(domains, threshold=500):
    bad = [d for d in domains if (d.get("p95") or 0) > threshold]
    if not bad:
        return "<div class='alert ok'><strong>✅ 500ms 초과 병목 없음</strong> — 모든 도메인 p95 &lt; 500ms</div>"
    bad_sorted = sorted(bad, key=lambda d: d["p95"], reverse=True)
    parts = ["<div class='alert warn'>"]
    parts.append(f"<h3>⚠️ 500ms 초과 병목 알람 ({len(bad_sorted)}개)</h3>")
    parts.append("<p>다음 도메인의 p95 응답 시간이 500ms 를 넘어 즉각 최적화 검토 대상입니다.</p>")
    parts.append("<table><thead><tr><th>도메인</th><th>p95</th><th>avg</th><th>max</th><th>reqs</th></tr></thead><tbody>")
    for d in bad_sorted:
        parts.append(
            "<tr>"
            f"<td class='name'><code>{d['domain']}</code></td>"
            f"<td class='v-bad'><strong>{fmt_ms(d['p95'])}</strong></td>"
            f"<td>{fmt_ms(d.get('avg'))}</td>"
            f"<td>{fmt_ms(d.get('max'))}</td>"
            f"<td>{fmt_num(d.get('count'))}</td>"
            "</tr>"
        )
    parts.append("</tbody></table></div>")
    return "\n".join(parts)

def render_pentest(pentest):
    if not pentest:
        return "<p class='muted'>pentest-real-ids 결과 데이터 없음</p>"
    summary = pentest.get("summary", {})
    total = pentest.get("totalProbes", 0)
    leaks = pentest.get("rows", [])
    leaks = [r for r in leaks if r.get("verdict") == "LEAK"]

    parts = []
    parts.append("<div class='kpi-grid'>")
    parts.append(f"<div class='kpi'><h4>Total Probes</h4><div class='value'>{fmt_num(total)}</div></div>")
    leak_cls = "value bad" if summary.get("leaks", 0) > 0 else "value ok"
    parts.append(f"<div class='kpi'><h4>LEAK</h4><div class='{leak_cls}'>{summary.get('leaks', 0)}</div></div>")
    parts.append(f"<div class='kpi'><h4>CRASH</h4><div class='value'>{summary.get('crashes', 0)}</div></div>")
    parts.append(f"<div class='kpi'><h4>Blocked (401/403)</h4><div class='value ok'>{summary.get('blocked', 0)}</div></div>")
    parts.append("</div>")

    if leaks:
        # group by endpoint
        by_endpoint = {}
        for l in leaks:
            key = f"{l['method']} {re.sub(r'/([a-z0-9-]+)$', '/:id', l['endpoint']) if '/' in l['endpoint'] else l['endpoint']}"
            by_endpoint.setdefault(key, []).append(l)
        parts.append("<h3>🚨 LEAK 상세</h3>")
        parts.append("<table><thead><tr><th>Endpoint</th><th>Count</th><th>Attackers</th></tr></thead><tbody>")
        for ep, items in sorted(by_endpoint.items(), key=lambda kv: -len(kv[1])):
            attackers = ", ".join(sorted({i["attacker"] for i in items}))
            parts.append(f"<tr><td class='name'><code>{ep}</code></td><td>{len(items)}</td><td>{attackers}</td></tr>")
        parts.append("</tbody></table>")
    else:
        parts.append("<p class='ok-msg'>✅ LEAK 0건 — 모든 sensitive endpoint 가 guard 로 방어됨</p>")

    return "\n".join(parts)

# ── Assemble page ─────────────────────────────────────────────────

smoke = collect("smoke")
stress = collect("stress")
domains = load_per_domain()
pentest = load_pentest()

smoke_main, smoke_ext = split_personas(smoke)
stress_main, stress_ext = split_personas(stress)

now = datetime.now(timezone.utc).astimezone()
date_str = now.strftime("%Y-%m-%d %H:%M %Z")

# KPIs
total_reqs = sum((r.get("reqs") or 0) for r in stress if "error" not in r)
p95_list = [r["p95"] for r in stress if "error" not in r and r.get("p95") is not None]
max_p95 = max(p95_list) if p95_list else None
mean_p95 = sum(p95_list) / len(p95_list) if p95_list else None
threshold_breach = sum(1 for v in p95_list if v > 2000)

# Chart.js data — persona vs p95
chart_labels = [r["name"] for r in stress if "error" not in r and r.get("p95") is not None]
chart_data = [round(r["p95"], 1) for r in stress if "error" not in r and r.get("p95") is not None]
chart_json = json.dumps({"labels": chart_labels, "data": chart_data}, ensure_ascii=False)

# Domain chart — top 15 by p95
top_domains = sorted(domains, key=lambda d: (d.get("p95") or 0), reverse=True)[:15]
domain_chart_labels = [d["domain"] for d in top_domains]
domain_chart_data = [round(d.get("p95") or 0, 1) for d in top_domains]
domain_chart_json = json.dumps({"labels": domain_chart_labels, "data": domain_chart_data}, ensure_ascii=False)

pentest_summary = pentest.get("summary", {}) if pentest else {}

html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Football ERP — 부하 · 스모크 · 보안 종합 보고서 ({now.date()})</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
* {{ box-sizing: border-box; }}
body {{
  font-family: -apple-system, "SF Pro Text", "Pretendard", system-ui, sans-serif;
  max-width: 1200px; margin: 40px auto; padding: 0 24px;
  color: #1c1c1e; background: #f6f6f8;
}}
h1 {{ font-size: 28px; margin-bottom: 4px; }}
h2 {{ margin-top: 48px; border-bottom: 2px solid #d1d1d6; padding-bottom: 8px; font-size: 20px; }}
h3 {{ margin-top: 28px; color: #3a3a3c; font-size: 16px; }}
h4 {{ margin-top: 20px; color: #48484a; font-size: 14px; }}
.meta {{ color: #636366; font-size: 14px; margin-bottom: 20px; }}
.note {{ color: #6d6d70; font-size: 13px; margin: 6px 0 12px; }}
.muted {{ color: #8e8e93; font-size: 13px; }}
.ok-msg {{ color: #1a4d29; font-weight: 500; }}

table {{
  width: 100%; border-collapse: collapse; margin: 12px 0 24px;
  background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  border-radius: 8px; overflow: hidden; font-size: 13px;
}}
th, td {{ padding: 9px 12px; text-align: right; border-bottom: 1px solid #eee; }}
th {{ background: #f2f2f7; font-weight: 600; color: #48484a; user-select: none; }}
table.sortable th {{ cursor: pointer; }}
table.sortable th:hover {{ background: #e5e5ea; }}
table.sortable th.sort-asc::after {{ content: " ▲"; color: #007aff; }}
table.sortable th.sort-desc::after {{ content: " ▼"; color: #007aff; }}
td.name, th:first-child {{ text-align: left; }}
td.name {{ font-weight: 500; }}
code {{ font-family: "SF Mono", Consolas, monospace; background: #f2f2f7; padding: 2px 6px; border-radius: 4px; font-size: 12px; }}

.v-ok {{ color: #34c759; }}
.v-warn {{ color: #ff9500; }}
.v-bad {{ color: #ff3b30; }}
.v-muted {{ color: #8e8e93; }}
.err {{ color: #ff3b30; }}

.summary-badges {{ display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }}
.badge {{
  padding: 5px 12px; border-radius: 999px; font-size: 13px; font-weight: 500;
  background: #e5e5ea; color: #1c1c1e;
}}
.badge.ok {{ background: #d1f0d9; color: #1a4d29; }}
.badge.warn {{ background: #ffe7b8; color: #6a4200; }}
.badge.fail {{ background: #ffd4cf; color: #6a1a10; }}

.kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0; }}
.kpi {{ background: white; padding: 16px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }}
.kpi h4 {{ margin: 0 0 8px; font-size: 11px; color: #8e8e93; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }}
.kpi .value {{ font-size: 24px; font-weight: 600; }}
.kpi .value.ok {{ color: #34c759; }}
.kpi .value.warn {{ color: #ff9500; }}
.kpi .value.bad {{ color: #ff3b30; }}

.alert {{ padding: 16px 20px; border-radius: 10px; margin: 20px 0; }}
.alert.ok {{ background: #d1f0d9; color: #1a4d29; }}
.alert.warn {{ background: #fff3cd; border: 2px solid #ff9500; color: #6a4200; }}
.alert.warn table {{ margin-top: 12px; background: white; }}
.alert h3 {{ margin: 0 0 12px; color: inherit; }}

.chart-wrap {{ background: white; padding: 20px; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin: 16px 0 24px; height: 340px; position: relative; }}

.filter-bar {{ display: flex; gap: 12px; align-items: center; margin: 12px 0; }}
.filter-bar input {{ padding: 8px 12px; border: 1px solid #d1d1d6; border-radius: 8px; font-size: 14px; min-width: 240px; }}

footer {{ margin-top: 60px; color: #8e8e93; font-size: 12px; text-align: center; }}
</style>
</head>
<body>

<h1>🏈 Football ERP — 부하 · 스모크 · 보안 종합 보고서</h1>
<div class="meta">생성 시각: {date_str} · 대상 서버: <code>http://localhost:3001/api</code></div>

<div class="summary-badges">
  <span class="badge ok">k6 smoke: {len(smoke)}개</span>
  <span class="badge ok">k6 stress: {len(stress)}개</span>
  <span class="badge {"ok" if pentest_summary.get("leaks", 0) == 0 else "fail"}">pentest-real-ids: LEAK {pentest_summary.get("leaks", "?")}</span>
  <span class="badge ok">per-domain: {len(domains)}개 도메인</span>
</div>

<h2>📊 Executive Summary</h2>
<div class="kpi-grid">
  <div class="kpi"><h4>Stress 총 요청</h4><div class="value">{fmt_num(total_reqs)}</div></div>
  <div class="kpi"><h4>Stress p95 평균</h4><div class="value">{fmt_ms(mean_p95)}</div></div>
  <div class="kpi"><h4>Stress p95 최악</h4><div class="value {"warn" if max_p95 and max_p95 > 1000 else "ok"}">{fmt_ms(max_p95)}</div></div>
  <div class="kpi"><h4>Threshold(p95&lt;2s) 초과</h4><div class="value {"bad" if threshold_breach else "ok"}">{threshold_breach}/{len(stress)}</div></div>
  <div class="kpi"><h4>Pentest LEAK</h4><div class="value {"bad" if pentest_summary.get("leaks", 0) > 0 else "ok"}">{pentest_summary.get("leaks", "-")}</div></div>
  <div class="kpi"><h4>Pentest CRASH</h4><div class="value {"bad" if pentest_summary.get("crashes", 0) > 0 else "ok"}">{pentest_summary.get("crashes", "-")}</div></div>
</div>

{render_bottleneck(domains)}

<h2>🚀 Smoke Test (VUS=2 · 10s · baseline)</h2>
<p class='note'>엔드포인트 목록 200 응답 확인 · 지연은 최소치</p>
{render_persona_table(smoke_main, "메인 페르소나")}
{render_persona_table(smoke_ext, "확장 페르소나")}

<h2>💪 Stress Test (VUS 최대 · 30s+)</h2>
<p class='note'>threshold: p95 &lt; 2000ms · fail_rate &lt; 5%</p>
{render_persona_table(stress_main, "메인 페르소나")}
{render_persona_table(stress_ext, "확장 페르소나")}

<h3>페르소나별 p95 비교</h3>
<div class="chart-wrap"><canvas id="chart-persona-p95"></canvas></div>

<h2>🌐 Per-Domain 응답 시간 (Top 15 by p95)</h2>
<div class="chart-wrap"><canvas id="chart-domain-p95"></canvas></div>

<h2>🌐 Per-Domain 응답 시간 (전체)</h2>
<div class="filter-bar">
  <input type="text" id="domain-filter" placeholder="도메인 이름으로 필터... (예: /players)" />
  <span class='muted'>총 {len(domains)}개 · p95 desc 정렬 · 열 클릭시 재정렬</span>
</div>
{render_domain_table(domains)}

<h2>🛡️ Pentest — 실 record ID IDOR 프로브 (#566)</h2>
<p class='note'>공격자 페르소나 × 실 record ID sub-action 매트릭스 · 200 응답 시 LEAK</p>
{render_pentest(pentest)}

<footer>
Football ERP QA · k6 + Chart.js · Generated by Claude Code · {now.strftime("%Y-%m-%d")}
</footer>

<script>
// Chart.js — persona p95
const personaCtx = document.getElementById('chart-persona-p95').getContext('2d');
const personaData = {chart_json};
new Chart(personaCtx, {{
  type: 'bar',
  data: {{
    labels: personaData.labels,
    datasets: [{{
      label: 'p95 (ms)',
      data: personaData.data,
      backgroundColor: personaData.data.map(v => v > 2000 ? '#ff3b30' : v > 1000 ? '#ff9500' : '#34c759'),
      borderRadius: 6,
    }}],
  }},
  options: {{
    responsive: true, maintainAspectRatio: false,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ y: {{ beginAtZero: true, title: {{ display: true, text: 'p95 (ms)' }} }} }},
  }}
}});

// Chart.js — domain p95
const domainCtx = document.getElementById('chart-domain-p95').getContext('2d');
const domainData = {domain_chart_json};
new Chart(domainCtx, {{
  type: 'bar',
  data: {{
    labels: domainData.labels,
    datasets: [{{
      label: 'p95 (ms)',
      data: domainData.data,
      backgroundColor: domainData.data.map(v => v > 500 ? '#ff3b30' : v > 300 ? '#ff9500' : '#34c759'),
      borderRadius: 6,
    }}],
  }},
  options: {{
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    plugins: {{ legend: {{ display: false }} }},
    scales: {{ x: {{ beginAtZero: true, title: {{ display: true, text: 'p95 (ms)' }} }} }},
  }}
}});

// Sortable tables
document.querySelectorAll('table.sortable').forEach(table => {{
  const headers = table.querySelectorAll('th');
  const tbody = table.querySelector('tbody');
  headers.forEach((th, colIdx) => {{
    th.addEventListener('click', () => {{
      const asc = !th.classList.contains('sort-asc');
      headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
      th.classList.toggle(asc ? 'sort-asc' : 'sort-desc');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {{
        const av = a.cells[colIdx]?.innerText.trim() ?? '';
        const bv = b.cells[colIdx]?.innerText.trim() ?? '';
        const numA = parseFloat(av.replace(/[^-0-9.]/g, ''));
        const numB = parseFloat(bv.replace(/[^-0-9.]/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) return asc ? numA - numB : numB - numA;
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      }});
      rows.forEach(r => tbody.appendChild(r));
    }});
  }});
}});

// Domain filter
const domainFilter = document.getElementById('domain-filter');
if (domainFilter) {{
  domainFilter.addEventListener('input', () => {{
    const q = domainFilter.value.toLowerCase();
    document.querySelectorAll('#domain-table tbody tr').forEach(r => {{
      r.style.display = r.cells[0].innerText.toLowerCase().includes(q) ? '' : 'none';
    }});
  }});
}}
</script>
</body>
</html>
"""

with open(OUTPUT, "w") as f:
    f.write(html)

print(f"HTML report → {OUTPUT}")
print(f"Rows: smoke={len(smoke)} · stress={len(stress)} · domains={len(domains)} · pentest={'yes' if pentest else 'no'}")
