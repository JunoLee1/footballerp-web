#!/usr/bin/env python3
"""Generate HTML report from k6 JSON outputs."""
import json
import glob
import os
from datetime import datetime, timezone

RESULTS_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT = os.path.join(RESULTS_DIR, "index.html")

def load(path):
    with open(path) as f:
        return json.load(f)

def metric(data, name, key="med"):
    m = data.get("metrics", {}).get(name, {})
    v = m.get("values", {}).get(key) if "values" in m else m.get(key)
    return v

def fmt_ms(v):
    if v is None: return "-"
    return f"{v:.0f}ms" if v >= 1 else f"{v*1000:.1f}μs"

def fmt_num(v):
    if v is None: return "-"
    return f"{v:,.0f}" if v >= 1 else f"{v:.2f}"

def fmt_pct(v):
    if v is None: return "-"
    return f"{v*100:.2f}%"

def collect(prefix):
    rows = []
    for path in sorted(glob.glob(f"{RESULTS_DIR}/{prefix}-*.json")):
        name = os.path.basename(path).replace(f"{prefix}-", "").replace(".json", "")
        try:
            d = load(path)
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

def verdict_p95(v, threshold=2000):
    if v is None: return "-"
    if v > threshold: return "❌"
    if v > threshold * 0.8: return "⚠️"
    return "✅"

def verdict_fail(v, threshold=0.05):
    if v is None: return "-"
    if v > threshold: return "❌"
    if v > 0.01: return "⚠️"
    return "✅"

def render_persona_table(rows, title, note=""):
    if not rows:
        return f"<h3>{title}</h3><p><em>No data</em></p>"
    html = [f"<h3>{title}</h3>"]
    if note:
        html.append(f"<p class='note'>{note}</p>")
    html.append("<table><thead><tr>")
    html.append("<th>Persona</th><th>Reqs</th><th>RPS</th><th>p50</th><th>p95</th><th>p99</th><th>Max</th><th>Fail%</th><th>VUs</th><th>Verdict</th>")
    html.append("</tr></thead><tbody>")
    for r in rows:
        if "error" in r:
            html.append(f"<tr><td>{r['name']}</td><td colspan='9' class='err'>error: {r['error']}</td></tr>")
            continue
        v_p95 = verdict_p95(r["p95"])
        v_fail = verdict_fail(r["fail_rate"])
        overall = "✅" if v_p95 == "✅" and v_fail == "✅" else ("❌" if "❌" in (v_p95, v_fail) else "⚠️")
        html.append(f"<tr>")
        html.append(f"<td class='name'>{r['name']}</td>")
        html.append(f"<td>{fmt_num(r['reqs'])}</td>")
        html.append(f"<td>{fmt_num(r['rps'])}</td>")
        html.append(f"<td>{fmt_ms(r['p50'])}</td>")
        html.append(f"<td class='v-{v_p95[0].lower()}'>{fmt_ms(r['p95'])}</td>")
        html.append(f"<td>{fmt_ms(r['p99'])}</td>")
        html.append(f"<td>{fmt_ms(r['max'])}</td>")
        html.append(f"<td class='v-{v_fail[0].lower()}'>{fmt_pct(r['fail_rate'])}</td>")
        html.append(f"<td>{r['vus_max'] or '-'}</td>")
        html.append(f"<td class='verdict'>{overall}</td>")
        html.append(f"</tr>")
    html.append("</tbody></table>")
    return "\n".join(html)

def render_role_boundary():
    path = os.path.join(RESULTS_DIR, "role-boundary.json")
    if not os.path.exists(path):
        return "<h3>Role Boundary Probe</h3><p><em>No data</em></p>"
    d = load(path)
    total_reqs = metric(d, "http_reqs", "count")
    fail_rate = metric(d, "http_req_failed", "rate")
    p95 = metric(d, "http_req_duration", "p(95)")
    return f"""
    <h3>🛡️ Role Boundary Probe (RBAC)</h3>
    <table>
      <tr><th>Total Requests</th><td>{fmt_num(total_reqs)}</td></tr>
      <tr><th>Failure Rate</th><td>{fmt_pct(fail_rate)}</td></tr>
      <tr><th>p95 Latency</th><td>{fmt_ms(p95)}</td></tr>
    </table>
    """

smoke = collect("smoke")
stress = collect("stress")

now = datetime.now(timezone.utc).astimezone()
date_str = now.strftime("%Y-%m-%d %H:%M %Z")

html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>Football ERP — 부하 · 보안 종합 보고서 ({now.date()})</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    font-family: -apple-system, "SF Pro Text", "Pretendard", system-ui, sans-serif;
    max-width: 1100px; margin: 40px auto; padding: 0 24px;
    color: #1c1c1e; background: #f6f6f8;
  }}
  h1 {{ font-size: 26px; margin-bottom: 4px; }}
  h2 {{ margin-top: 40px; border-bottom: 2px solid #d1d1d6; padding-bottom: 6px; }}
  h3 {{ margin-top: 28px; color: #3a3a3c; }}
  .meta {{ color: #636366; font-size: 14px; margin-bottom: 20px; }}
  .note {{ color: #6d6d70; font-size: 13px; margin: 6px 0 12px; }}
  table {{
    width: 100%; border-collapse: collapse; margin: 12px 0 24px;
    background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    border-radius: 8px; overflow: hidden;
  }}
  th, td {{ padding: 10px 12px; text-align: right; border-bottom: 1px solid #eee; font-size: 14px; }}
  th {{ background: #f2f2f7; text-align: right; font-weight: 600; color: #48484a; }}
  td.name, th:first-child {{ text-align: left; }}
  td.name {{ font-weight: 500; }}
  td.verdict {{ text-align: center; font-size: 16px; }}
  .v-✅, .v-v {{ color: #34c759; }}
  .v-⚠️, .v-w {{ color: #ff9500; }}
  .v-❌, .v-e {{ color: #ff3b30; }}
  .err {{ color: #ff3b30; }}
  .summary-badges {{ display: flex; gap: 10px; flex-wrap: wrap; margin: 12px 0; }}
  .badge {{
    padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 500;
    background: #e5e5ea; color: #1c1c1e;
  }}
  .badge.ok {{ background: #d1f0d9; color: #1a4d29; }}
  .badge.warn {{ background: #ffe7b8; color: #6a4200; }}
  .badge.fail {{ background: #ffd4cf; color: #6a1a10; }}
  footer {{ margin-top: 60px; color: #8e8e93; font-size: 12px; text-align: center; }}
  .kpi-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0; }}
  .kpi {{ background: white; padding: 14px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }}
  .kpi h4 {{ margin: 0 0 6px; font-size: 12px; color: #8e8e93; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; }}
  .kpi .value {{ font-size: 22px; font-weight: 600; }}
</style>
</head>
<body>

<h1>🏈 Football ERP — 부하·보안 종합 보고서</h1>
<div class="meta">생성 시각: {date_str} · 대상 서버: <code>http://localhost:3001/api</code></div>

<div class="summary-badges">
  <span class="badge">k6 smoke: {len(smoke)}개 페르소나</span>
  <span class="badge">k6 stress: {len(stress)}개 페르소나</span>
  <span class="badge">role-boundary probe: 실행</span>
  <span class="badge warn">Burp Suite: 프록시 (포트 3002) 부재로 미실행</span>
</div>

<h2>📊 Executive Summary</h2>
<div class="kpi-grid">
"""

# KPI cards
total_reqs = sum((r.get("reqs") or 0) for r in stress if "error" not in r)
avg_p95_stress = [r["p95"] for r in stress if "error" not in r and r.get("p95") is not None]
max_p95 = max(avg_p95_stress) if avg_p95_stress else None
mean_p95 = sum(avg_p95_stress)/len(avg_p95_stress) if avg_p95_stress else None
threshold_breach = sum(1 for r in stress if "error" not in r and r.get("p95") and r["p95"] > 2000)

html += f"""
  <div class="kpi"><h4>Stress 총 요청</h4><div class="value">{fmt_num(total_reqs)}</div></div>
  <div class="kpi"><h4>Stress p95 평균</h4><div class="value">{fmt_ms(mean_p95)}</div></div>
  <div class="kpi"><h4>Stress p95 최악</h4><div class="value">{fmt_ms(max_p95)}</div></div>
  <div class="kpi"><h4>Threshold(p95&lt;2s) 초과</h4><div class="value">{threshold_breach}/{len(stress)}</div></div>
</div>

<h2>🚀 Smoke Test (VUS=2 · 10s · baseline)</h2>
"""
html += render_persona_table(smoke, "페르소나별 골든 패스", "endpoint 목록 200 응답 확인 · 지연은 최소치")

html += "\n<h2>💪 Stress Test (VUS=50 · 30s)</h2>\n"
html += render_persona_table(stress, "페르소나별 부하 응답성", "threshold: p95 < 2000ms · fail_rate < 5%")

html += "\n<h2>🛡️ 보안 · RBAC</h2>\n"
html += render_role_boundary()
html += """
<p class="note">Burp Suite (proxy 3002) 는 이 실행 시점에 리스닝 상태가 아니어서 pentest-real-ids · 수동 프로브는 이번 보고서에서 제외.
다음 실행 시 <code>lsof -iTCP:3002</code> 확인 후 재실행 예정.</p>

<h2>📋 후속 조치</h2>
<ul>
  <li>❌ 항목 (p95 &gt; 2s or fail_rate &gt; 5%) — 병목 endpoint 재조사 · Redis 캐시 커버리지 확인</li>
  <li>⚠️ 항목 — threshold 근접 · 부하 증가 시 모니터링</li>
  <li>Burp Suite 리스너 켜고 <code>loadtest/pentest-real-ids.mjs</code> 재실행 · IDOR 매트릭스 프로브 결과 통합</li>
  <li>LB 모드 (docker-compose.loadtest.yml) 부팅 후 <code>BASE_URL=http://localhost:3002/api</code> 재실행</li>
</ul>

<footer>
Football ERP QA · k6 + Custom HTML Renderer · Generated by Claude Code
</footer>
</body>
</html>
"""

with open(OUTPUT, "w") as f:
    f.write(html)

print(f"HTML report → {OUTPUT}")
print(f"Rows: smoke={len(smoke)} · stress={len(stress)}")
